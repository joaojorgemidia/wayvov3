import React, { useState } from "react";
import { addWeeks, addDays, addMonths, differenceInDays, isBefore, isEqual, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/companies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const db = supabase as any;

// Todas as cobranças de aluguel a partir desta data serão apagadas e recriadas.
const CUTOFF = "2026-06-01";

interface RentalSummary {
  rentalId: string;
  placa: string;
  clienteNome: string;
  created: number;
  error?: string;
}

interface RunResult {
  totalDeleted: number;
  totalCreated: number;
  rentals: RentalSummary[];
}

// ─── Gerador de entradas de aluguel ────────────────────────────
// Lógica idêntica à de LocacoesPage.tsx — itera do início do contrato
// contando períodos, mas só emite entradas a partir de CUTOFF.
function buildAluguelEntries(rental: any, motos: Map<string, string>, clients: Map<string, string>, companyId: string): any[] {
  const freq: string = rental.frequencia_pagamento || "";
  if (!rental.data_fim_contrato || !rental.valor_diario) return [];

  const startDate = parseISO(rental.data_inicio);
  const endDate = parseISO(rental.data_fim_contrato);
  if (rental.data_fim_contrato < CUTOFF) return []; // contrato termina antes do corte

  const valorDiario = Number(rental.valor_diario) || 0;
  const motoPlaca = motos.get(rental.moto_id) || "";
  const clienteNome = clients.get(rental.cliente_id) || "";
  const aluguelSerieId = `aluguel-${rental.id}`;
  const recurringGroupId = crypto.randomUUID();
  const periodDays = freq === "semanal" ? 7 : freq === "quinzenal" ? 15 : 30;
  const now = new Date().toISOString();

  const advanceDate = (d: Date): Date => {
    if (freq === "semanal") return addWeeks(d, 1);
    if (freq === "quinzenal") return addDays(d, 15);
    return addMonths(d, 1);
  };

  const makeRow = (dataStr: string, valor: number, idx: number, extra = ""): any => ({
    id: crypto.randomUUID(),
    company_id: companyId,
    tipo: "receita",
    categoria: "aluguel",
    serie_id: aluguelSerieId,
    recurring_group_id: recurringGroupId,
    descricao: `Aluguel ${idx}ª semana${extra} - ${motoPlaca} - ${clienteNome}`,
    valor,
    data: dataStr,
    data_prevista: dataStr,
    pago: false,
    moto_id: rental.moto_id || null,
    rental_id: rental.id,
    cliente_id: rental.cliente_id || null,
    placa: motoPlaca,
    cliente_nome: clienteNome,
    natureza: "operacional",
    recorrente: false,
    despesa_fixa: false,
    ignorada: false,
    tags: [],
    classificacao_manual: false,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });

  const entries: any[] = [];
  let current = advanceDate(startDate);
  let lastChargeDate = startDate;
  let idx = 1;

  while (isBefore(current, endDate) || isEqual(current, endDate)) {
    const dataStr = current.toISOString().split("T")[0];
    if (dataStr >= CUTOFF) {
      entries.push(makeRow(dataStr, valorDiario, idx));
    }
    lastChargeDate = current;
    current = advanceDate(current);
    idx++;
  }

  // Pro-rata da última fração de período
  const remainingDays = differenceInDays(endDate, lastChargeDate);
  if (remainingDays > 0 && remainingDays < periodDays) {
    const dataStr = endDate.toISOString().split("T")[0];
    if (dataStr >= CUTOFF) {
      const proratedValue = parseFloat(((valorDiario / periodDays) * remainingDays).toFixed(2));
      entries.push(makeRow(dataStr, proratedValue, idx, ` (${remainingDays}d)`));
    }
  }

  return entries;
}

// ─── Página ────────────────────────────────────────────────────
export default function RebuildAluguelPage() {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  const emit = (msg: string) => setLog(prev => [...prev, msg]);

  const run = async () => {
    setPhase("running");
    setLog([]);
    setResult(null);

    const cid = getActiveCompanyId();
    if (!cid) {
      emit("❌ Nenhuma empresa ativa. Faça login e selecione a empresa antes de executar.");
      setPhase("error");
      return;
    }

    const runResult: RunResult = { totalDeleted: 0, totalCreated: 0, rentals: [] };
    const now = new Date().toISOString();

    try {
      // ── PASSO 1: contar entradas que serão soft-deletadas ──────
      emit(`[1/4] Verificando entradas de aluguel >= ${CUTOFF}...`);
      const { count: countBefore } = await db
        .from("financial_entries")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .eq("categoria", "aluguel")
        .gte("data", CUTOFF)
        .is("deleted_at", null);
      emit(`      → ${countBefore ?? 0} entradas encontradas.`);

      // ── PASSO 2: soft-delete em lotes de 200 ──────────────────
      emit(`[2/4] Soft-deletando...`);
      let deleted = 0;
      for (;;) {
        const { data: batch } = await db
          .from("financial_entries")
          .select("id")
          .eq("company_id", cid)
          .eq("categoria", "aluguel")
          .gte("data", CUTOFF)
          .is("deleted_at", null)
          .limit(200);

        if (!batch || batch.length === 0) break;

        const ids = (batch as { id: string }[]).map(r => r.id);
        const { error } = await db
          .from("financial_entries")
          .update({ deleted_at: now })
          .in("id", ids);

        if (error) throw new Error(`Falha no delete: ${error.message}`);
        deleted += ids.length;
        emit(`      → ${deleted} soft-deletadas...`);
      }
      runResult.totalDeleted = deleted;
      emit(`      ✓ ${deleted} entradas soft-deletadas.`);

      // ── PASSO 3: carregar motos, clientes e contratos ativos ───
      emit(`[3/4] Carregando contratos ativos...`);

      const [motosRes, clientsRes, rentalsRes] = await Promise.all([
        db.from("motorcycles").select("id, placa").eq("company_id", cid).is("deleted_at", null),
        db.from("clients").select("id, nome").eq("company_id", cid).is("deleted_at", null),
        db.from("rentals")
          .select("*")
          .eq("company_id", cid)
          .eq("status", "ativa")
          .eq("gerar_cobranca_pagamento", true)
          .is("deleted_at", null),
      ]);

      if (motosRes.error) throw new Error(`Motos: ${motosRes.error.message}`);
      if (clientsRes.error) throw new Error(`Clientes: ${clientsRes.error.message}`);
      if (rentalsRes.error) throw new Error(`Locações: ${rentalsRes.error.message}`);

      const motoMap = new Map<string, string>((motosRes.data || []).map((m: any) => [m.id, m.placa]));
      const clientMap = new Map<string, string>((clientsRes.data || []).map((c: any) => [c.id, c.nome]));

      const rentals = (rentalsRes.data || []).filter(
        (r: any) => r.data_fim_contrato && r.data_fim_contrato >= CUTOFF && Number(r.valor_diario) > 0,
      );
      emit(`      → ${rentals.length} contrato(s) elegível(is) (fim >= ${CUTOFF}).`);

      // ── PASSO 4: recriar entradas por contrato ─────────────────
      emit(`[4/4] Recriando entradas...`);
      for (const rental of rentals) {
        const placa = motoMap.get(rental.moto_id) || rental.moto_id;
        const clienteNome = clientMap.get(rental.cliente_id) || rental.cliente_id;
        const summary: RentalSummary = { rentalId: rental.id, placa, clienteNome, created: 0 };

        try {
          const rows = buildAluguelEntries(rental, motoMap, clientMap, cid);

          for (let b = 0; b < rows.length; b += 100) {
            const { error } = await db.from("financial_entries").insert(rows.slice(b, b + 100));
            if (error) throw new Error(error.message);
          }

          summary.created = rows.length;
          runResult.totalCreated += rows.length;
          emit(`      ✓ ${placa} / ${clienteNome}: ${rows.length} entrada(s) criada(s).`);
        } catch (e: any) {
          summary.error = e?.message || String(e);
          emit(`      ❌ ${placa}: ${summary.error}`);
        }

        runResult.rentals.push(summary);
      }

      setResult(runResult);
      setPhase("done");
      emit(`\n✅ Concluído. ${runResult.totalDeleted} deletadas · ${runResult.totalCreated} criadas.`);
    } catch (e: any) {
      emit(`❌ Erro fatal: ${e?.message || String(e)}`);
      setResult(runResult);
      setPhase("error");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Reconstrução de Cobranças de Aluguel</CardTitle>
          <CardDescription>
            Utilitário de uso único — apaga e recria todas as cobranças de aluguel com data ≥{" "}
            <strong>{CUTOFF}</strong> para os contratos ativos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 p-3 flex gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-yellow-800 dark:text-yellow-300 space-y-1">
              <p>
                <strong>Esta operação é irreversível.</strong> Serão soft-deletadas{" "}
                <em>todas</em> as entradas de aluguel com data ≥ {CUTOFF} (inclusive pagas) e
                recriadas do zero para cada contrato ativo, com um novo{" "}
                <code className="text-xs bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">
                  recurring_group_id
                </code>
                .
              </p>
              <p>Execute apenas uma vez e recarregue o módulo financeiro após a conclusão.</p>
            </div>
          </div>

          {phase === "idle" && (
            <Button onClick={run} variant="destructive" className="w-full">
              Executar Reconstrução
            </Button>
          )}

          {phase === "running" && (
            <Button disabled className="w-full gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Executando — aguarde…
            </Button>
          )}

          {phase === "done" && result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Concluído com sucesso · {result.totalDeleted} deletadas · {result.totalCreated} criadas
              </div>
              <div className="divide-y divide-border rounded-md border text-sm overflow-hidden">
                {result.rentals.map(r => (
                  <div key={r.rentalId} className="flex items-center justify-between px-3 py-2">
                    <span className="font-mono text-xs font-semibold">{r.placa}</span>
                    <span className="text-muted-foreground truncate mx-3 flex-1">{r.clienteNome}</span>
                    {r.error
                      ? <span className="text-destructive text-xs">{r.error}</span>
                      : <span className="text-green-600 dark:text-green-400 font-medium">{r.created} criadas</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="flex items-center gap-2 text-destructive font-medium text-sm">
              <XCircle className="h-4 w-4" />
              Erro durante a execução. Verifique o log abaixo.
            </div>
          )}

          {log.length > 0 && (
            <pre className="text-xs bg-muted rounded-md p-3 max-h-80 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">
              {log.join("\n")}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
