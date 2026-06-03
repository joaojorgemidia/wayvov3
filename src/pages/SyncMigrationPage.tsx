import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/companies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const db = supabase as any;

interface TableResult {
  table: string;
  localCount: number;
  alreadyExisted: number;
  inserted: number;
  errors: string[];
  status: "pending" | "processing" | "done" | "error";
}

const FIELD_MAPS: Record<string, (item: any) => any> = {
  motorcycles: (m) => ({
    placa: m.placa, modelo: m.modelo, ano_fabricacao: m.anoFabricacao ?? null, ano_modelo: m.anoModelo, cor: m.cor, chassi: m.chassi,
    renavam: m.renavam, num_motor: m.numMotor, aplicativo: m.aplicativo, tipo: m.tipo,
    proprietario: m.proprietario || null, status: m.status, km_atual: m.kmAtual,
    km_compra: m.kmCompra, km_troca_oleo: m.kmTrocaOleo, km_venda: m.kmVenda,
    ultima_vistoria: m.ultimaVistoria || null, ultima_troca_oleo: m.ultimaTrocaOleo || null,
    historico_oleo: m.historicoOleo || [], valor_compra: m.valorCompra,
    data_compra: m.dataCompra || null, valor_fipe: m.valorFipe, data_fipe: m.dataFipe || null,
    valor_venda: m.valorVenda, data_venda: m.dataVenda || null,
    lucro_operacional: m.lucroOperacional, decisao: m.decisao, crlv_pdf_name: m.crlvPdfName,
  }),
  clients: (c) => ({
    nome: c.nome, cpf: c.cpf, cnh: c.cnh, cnh_categoria: c.cnhCategoria,
    cnh_validade: c.cnhValidade || null, cnh_pdf_name: c.cnhPdfName,
    telefone: c.telefone, email: c.email, cep: c.cep, rua: c.rua,
    numero: c.numero, complemento: c.complemento, bairro: c.bairro,
    cidade: c.cidade, estado: c.estado,
    comprovante_endereco_name: c.comprovanteEnderecoName,
    emergencia_nome1: c.emergenciaNome1, emergencia_tel1: c.emergenciaTel1,
    emergencia_nome2: c.emergenciaNome2, emergencia_tel2: c.emergenciaTel2,
    observacoes: c.observacoes,
  }),
  rentals: (r) => ({
    moto_id: r.motoId, cliente_id: r.clienteId, vendedor: r.vendedor,
    data_inicio: r.dataInicio, hora_inicio: r.horaInicio,
    data_fim: r.dataFim || null, data_fim_contrato: r.dataFimContrato || null,
    proximo_pagamento: r.proximoPagamento || null,
    tempo_minimo_contrato: r.tempoMinimoContrato,
    frequencia_pagamento: r.frequenciaPagamento,
    valor_diario: r.valorDiario, valor_caucao: r.valorCaucao,
    caucao_pendente: r.caucaoPendente, caucao_parcelado: r.caucaoParcelado,
    parcelas_caucao: r.parcelasCaucao,
    multa_atraso: r.multaAtraso, juros_atraso_mes: r.jurosAtrasoMes,
    local_retirada: r.localRetirada, local_devolucao: r.localDevolucao,
    km_inicio: r.kmInicio, km_fim: r.kmFim,
    nivel_combustivel: r.nivelCombustivel, plano: r.plano,
    raio_circulacao: r.raioCirculacao, seguro_terceiros: r.seguroTerceiros,
    gerar_cobranca_caucao: r.gerarCobrancaCaucao,
    gerar_cobranca_pagamento: r.gerarCobrancaPagamento,
    status: r.status, checklist_retirada: r.checklistRetirada,
    checklist_devolucao: r.checklistDevolucao, observacoes: r.observacoes,
  }),
  fines: (f) => ({
    moto_id: f.motoId, cliente_id: f.clienteId || null,
    rental_id: f.rentalId || null, data_multa: f.dataMulta,
    data_notificacao: f.dataNotificacao || null, valor: f.valor,
    descricao: f.descricao, status: f.status, responsavel: f.responsavel,
  }),
  maintenance: (m) => ({
    moto_id: m.motoId, tipo: m.tipo, data: m.data, km: m.km,
    custo: m.custo, descricao: m.descricao, fornecedor: m.fornecedor, status: m.status,
  }),
  financial_entries: (e) => ({
    tipo: e.tipo, categoria: e.categoria, subcategoria: e.subcategoria || null,
    descricao: e.descricao, valor: e.valor, data: e.data,
    data_prevista: e.dataPrevista || null,
    moto_id: e.motoId || null, rental_id: e.rentalId || null,
    cliente_id: e.clienteId || null, pago: e.pago,
    recorrente: e.recorrente || false, recorrencia_tipo: e.recorrenciaTipo || null,
    recorrencia_vezes: e.recorrenciaVezes ?? null,
    despesa_fixa: e.despesaFixa || false, ignorada: e.ignorada || false,
    observacao: e.observacao || null, tags: e.tags || [],
    conta: e.conta || null, natureza: e.natureza || null,
    placa: e.placa || null, cliente_nome: e.clienteNome || null,
    classificacao_manual: e.classificacaoManual || false,
    serie_id: e.serieId || null, fixed_origin_id: e.fixedOriginId || null,
  }),
  bank_accounts: (a) => ({
    nome: a.nome, banco: a.banco, saldo_inicial: a.saldoInicial,
  }),
};

const LS_KEYS: Record<string, string> = {
  motorcycles: "motos",
  clients: "clients",
  rentals: "rentals",
  fines: "fines",
  maintenance: "maintenance",
  financial_entries: "financial",
  bank_accounts: "bank_accounts",
};

const TABLE_LABELS: Record<string, string> = {
  motorcycles: "Motos",
  clients: "Clientes",
  rentals: "Locações",
  fines: "Multas",
  maintenance: "Manutenções",
  financial_entries: "Financeiro",
  bank_accounts: "Contas Bancárias",
};

const TABLES = Object.keys(FIELD_MAPS);

export default function SyncMigrationPage() {
  const navigate = useNavigate();
  const cid = getActiveCompanyId();
  const started = useRef(false);
  const [results, setResults] = useState<TableResult[]>(
    TABLES.map((t) => ({ table: t, localCount: 0, alreadyExisted: 0, inserted: 0, errors: [], status: "pending" }))
  );
  const [done, setDone] = useState(false);
  const [allSuccess, setAllSuccess] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runSync();
  }, []);

  async function runSync() {
    const newResults: TableResult[] = TABLES.map((t) => ({
      table: t, localCount: 0, alreadyExisted: 0, inserted: 0, errors: [], status: "pending",
    }));

    for (let idx = 0; idx < TABLES.length; idx++) {
      const table = TABLES[idx];
      const lsKey = `${cid}:${LS_KEYS[table]}`;
      const mapper = FIELD_MAPS[table];

      newResults[idx].status = "processing";
      setResults([...newResults]);

      const raw = localStorage.getItem(lsKey);
      let items: any[] = [];
      try { items = raw ? JSON.parse(raw) : []; } catch { items = []; }

      newResults[idx].localCount = items.length;

      if (items.length === 0) {
        newResults[idx].status = "done";
        setResults([...newResults]);
        continue;
      }

      try {
        // Fetch existing IDs
        const { data: existing } = await db.from(table).select("id").eq("company_id", cid);
        const existingIds = new Set((existing || []).map((r: any) => r.id));

        const toInsert = items.filter((item: any) => !existingIds.has(item.id));
        newResults[idx].alreadyExisted = items.length - toInsert.length;

        // Process in batches of 50
        for (let b = 0; b < toInsert.length; b += 50) {
          const batch = toInsert.slice(b, b + 50);
          const rows = batch.map((item: any) => {
            const row = mapper(item);
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
            return { ...row, id: isUuid ? item.id : crypto.randomUUID(), company_id: cid };
          });

          const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
          if (error) {
            newResults[idx].errors.push(`Lote ${Math.floor(b / 50) + 1}: ${error.message}`);
          } else {
            newResults[idx].inserted += batch.length;
          }
          setResults([...newResults]);
        }

        newResults[idx].status = newResults[idx].errors.length > 0 ? "error" : "done";
      } catch (err: any) {
        newResults[idx].errors.push(err.message);
        newResults[idx].status = "error";
      }

      setResults([...newResults]);
    }

    const success = newResults.every((r) => r.errors.length === 0);
    if (success) {
      localStorage.setItem(`${cid}:migrated_to_db`, "true");
    }
    setAllSuccess(success);
    setDone(true);
  }

  const totalProcessed = results.filter((r) => r.status === "done" || r.status === "error").length;
  const progress = (totalProcessed / TABLES.length) * 100;

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Sincronização de Dados</h1>
      <p className="text-muted-foreground mb-4">Company: <code>{cid}</code></p>

      <Progress value={progress} className="mb-6" />

      <div className="space-y-3">
        {results.map((r) => (
          <Card key={r.table} className={r.status === "error" ? "border-destructive" : ""}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                {r.status === "processing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {r.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {r.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                {r.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
                {TABLE_LABELS[r.table]}
              </CardTitle>
            </CardHeader>
            {(r.status !== "pending") && (
              <CardContent className="py-2 px-4 text-xs space-y-1">
                <p>Local: <strong>{r.localCount}</strong> | Já existiam: <strong>{r.alreadyExisted}</strong> | Inseridos: <strong>{r.inserted}</strong></p>
                {r.errors.map((e, i) => (
                  <p key={i} className="text-destructive">{e}</p>
                ))}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {done && (
        <div className="mt-6 space-y-3">
          {allSuccess ? (
            <p className="text-green-600 font-medium">✅ Sincronização concluída com sucesso!</p>
          ) : (
            <p className="text-destructive font-medium">⚠️ Concluída com erros em algumas tabelas.</p>
          )}
          <Button onClick={() => navigate("/financeiro")}>Ir para Financeiro</Button>
        </div>
      )}
    </div>
  );
}
