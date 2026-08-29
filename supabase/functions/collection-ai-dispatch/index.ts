// Cron diário (mesmo padrão de asaas-cron-sync): varre todas as empresas com
// automação de WhatsApp habilitada, recalcula pendências de óleo e pagamento
// (mesma régua de src/lib/collections.ts, portada em _shared/collection-ai-lib.ts),
// aplica travas rígidas (horário comercial, pausa manual, limite semanal por
// cliente) e só então pergunta pra IA se deve enviar — lendo o histórico de
// conversa (whatsapp_messages) pra evitar cobrar quem já deu um retorno.
//
// Modo "review" (padrão inicial): a decisão "enviar" só entra como
// pending_review em collection_ai_dispatch_log — a mensagem não sai sozinha
// até alguém aprovar na aba "Cobrança IA" de /cobrancas.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/extract-ai.ts";
import { decideWithFallback } from "../_shared/text-ai.ts";
import {
  applyTokens,
  buildAllTokens,
  ClientRow,
  CollectionModule,
  CollectionRule,
  DEFAULT_BRAND_CONFIG,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_STAGES,
  MotoRow,
  RentalRow,
  daysOverdue,
  defaultRule,
  expectedStage,
  getOilStatus,
  lastSentStage,
} from "../_shared/collection-ai-lib.ts";

const MODULES: CollectionModule[] = ["pagamento", "oleo"];
const CAT_LABELS: Record<string, string> = { aluguel: "Aluguel", caucao: "Caução" };

interface PendencyCandidate {
  module: CollectionModule;
  entityId: string;
  clienteId: string;
  motoId: string | null;
  descricao: string;
  dueDateISO: string;
  valor?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const summary = { companies: 0, candidates: 0, sent_pending_review: 0, skipped: 0, failed: 0 };

  try {
    const { data: companies, error: companiesErr } = await supabase
      .from("companies")
      .select("id, whatsapp_config");
    if (companiesErr) throw companiesErr;

    for (const company of companies || []) {
      const cfg = company.whatsapp_config as {
        enabled?: boolean;
        maxMessagesPerClientPerWeek?: number;
        businessHoursStart?: number;
        businessHoursEnd?: number;
      } | null;
      if (!cfg?.enabled) continue;
      summary.companies++;

      const cid = company.id as string;
      const maxPerWeek = cfg.maxMessagesPerClientPerWeek ?? 2;
      const hourNow = Number(
        new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()),
      );
      const businessStart = cfg.businessHoursStart ?? 8;
      const businessEnd = cfg.businessHoursEnd ?? 20;
      const withinBusinessHours = hourNow >= businessStart && hourNow < businessEnd;

      // ---- Régua (mesmo merge com DEFAULT_STAGES do useCollections.fetchAll) ----
      const { data: ruleRows } = await supabase
        .from("collection_rules")
        .select("*")
        .eq("company_id", cid)
        .in("module", MODULES);
      const rulesByModule: Record<string, CollectionRule> = {};
      for (const m of MODULES) rulesByModule[m] = defaultRule(cid, m);
      for (const row of ruleRows || []) {
        if (MODULES.includes(row.module)) {
          rulesByModule[row.module] = {
            company_id: cid,
            module: row.module,
            enabled: row.enabled,
            stages: Array.isArray(row.stages) && row.stages.length > 0 ? row.stages : DEFAULT_STAGES[row.module as CollectionModule],
          };
        }
      }

      const { data: followupRows } = await supabase
        .from("collection_followups")
        .select("module, entity_id, stage_number, regularized_at, sent_at, cliente_id, channel")
        .eq("company_id", cid)
        .in("module", MODULES);

      const todayISO = new Date().toISOString().slice(0, 10);
      const { data: pauseRows } = await supabase
        .from("automation_pauses")
        .select("module, entity_id, snoozed_until")
        .eq("company_id", cid)
        .in("module", MODULES)
        .gte("snoozed_until", todayISO);
      const pausedSet = new Set((pauseRows || []).map((p) => `${p.module}:${p.entity_id}`));

      const weekAgoISO = new Date(Date.now() - 7 * 86400000).toISOString();
      const autoSentByClient = new Map<string, number>();
      for (const f of followupRows || []) {
        if (f.channel !== "whatsapp_auto") continue;
        if (!f.cliente_id || !f.sent_at || f.sent_at < weekAgoISO) continue;
        autoSentByClient.set(f.cliente_id, (autoSentByClient.get(f.cliente_id) || 0) + 1);
      }

      const { data: rentals } = await supabase
        .from("rentals")
        .select("id, moto_id, cliente_id, status, data_inicio")
        .eq("company_id", cid)
        .is("deleted_at", null);
      const rentalRows = (rentals || []) as RentalRow[];

      // ---- Candidatos: pagamento (aluguel/caução em aberto) ----
      const candidates: PendencyCandidate[] = [];
      const { data: financialEntries } = await supabase
        .from("financial_entries")
        .select("id, categoria, descricao, valor, data, data_prevista, moto_id, rental_id, cliente_id")
        .eq("company_id", cid)
        .eq("tipo", "receita")
        .eq("pago", false)
        .eq("ignorada", false)
        .is("deleted_at", null)
        .in("categoria", ["aluguel", "caucao"]);

      for (const e of financialEntries || []) {
        let clienteId = e.cliente_id as string | null;
        if (!clienteId && e.rental_id) {
          clienteId = rentalRows.find((r) => r.id === e.rental_id)?.cliente_id || null;
        }
        if (!clienteId) continue;
        const due = (e.data_prevista || e.data) as string | null;
        if (!due) continue;
        candidates.push({
          module: "pagamento",
          entityId: e.id,
          clienteId,
          motoId: e.moto_id || null,
          descricao: e.descricao || CAT_LABELS[e.categoria] || "Aluguel",
          dueDateISO: due,
          valor: e.valor,
        });
      }

      // ---- Candidatos: óleo vencido (moto com locação ativa) ----
      const { data: motos } = await supabase
        .from("motorcycles")
        .select("id, placa, modelo, ano_modelo, cor, chassi, renavam, num_motor, km_atual, km_compra, km_troca_oleo, ultima_troca_oleo, historico_oleo, tipo, proprietario, status")
        .eq("company_id", cid)
        .not("status", "in", "(vendida,inativa)");

      for (const m of (motos || []) as MotoRow[]) {
        const activeRental = rentalRows.find((r) => r.moto_id === m.id && r.status === "ativa");
        if (!activeRental?.cliente_id) continue;
        if (pausedSet.has(`oleo:${m.id}`)) continue;
        const status = getOilStatus(m, DEFAULT_BRAND_CONFIG, DEFAULT_GLOBAL_CONFIG, rentalRows);
        if (status.situation !== "vencida") continue;
        const overdueDays = DEFAULT_GLOBAL_CONFIG.overdueDays ?? 10;
        const diasDesde = status.diasDesdeUltima ?? overdueDays + 1;
        const diasAtraso = Math.max(1, diasDesde - overdueDays);
        const due = new Date(Date.now() - diasAtraso * 86400000).toISOString().slice(0, 10);
        candidates.push({
          module: "oleo",
          entityId: m.id,
          clienteId: activeRental.cliente_id,
          motoId: m.id,
          descricao: `Troca de óleo • ${m.placa}`,
          dueDateISO: due,
        });
      }

      summary.candidates += candidates.length;

      // ---- Avalia cada candidato: régua → travas → IA ----
      for (const cand of candidates) {
        if (pausedSet.has(`${cand.module}:${cand.entityId}`)) continue;

        const rule = rulesByModule[cand.module];
        const daysLate = daysOverdue(cand.dueDateISO);
        const exp = expectedStage(rule, daysLate);
        if (exp <= 0) continue;
        const sent = lastSentStage((followupRows || []) as any, cand.module, cand.entityId);
        const nextStage = Math.min(Math.max(sent + 1, 1), rule.stages.length);
        if (nextStage <= sent) continue; // nada de novo pra cobrar nessa entidade

        const logBase = {
          company_id: cid,
          module: cand.module,
          entity_id: cand.entityId,
          cliente_id: cand.clienteId,
          moto_id: cand.motoId,
          stage_number: nextStage,
        };

        // Travas rígidas — não gastam chamada de IA
        if (!withinBusinessHours) {
          await supabase.from("collection_ai_dispatch_log").insert({
            ...logBase, decision: "skip", status: "skipped",
            reasoning: "Fora do horário comercial configurado.",
          });
          summary.skipped++;
          continue;
        }
        if ((autoSentByClient.get(cand.clienteId) || 0) >= maxPerWeek) {
          await supabase.from("collection_ai_dispatch_log").insert({
            ...logBase, decision: "skip", status: "skipped",
            reasoning: `Limite de ${maxPerWeek} cobranças automáticas por semana já atingido para este cliente.`,
          });
          summary.skipped++;
          continue;
        }

        try {
          const [{ data: cliente }, { data: moto }, { data: recentMsgs }] = await Promise.all([
            supabase.from("clients").select("*").eq("id", cand.clienteId).single(),
            cand.motoId
              ? supabase.from("motorcycles").select("*").eq("id", cand.motoId).single()
              : Promise.resolve({ data: null }),
            supabase
              .from("whatsapp_messages")
              .select("direction, body, created_at")
              .eq("company_id", cid)
              .eq("cliente_id", cand.clienteId)
              .order("created_at", { ascending: false })
              .limit(15),
          ]);

          const stageDef = rule.stages.find((s) => s.stage === nextStage) || rule.stages[rule.stages.length - 1];
          const tokens = buildAllTokens({ moto: moto as MotoRow | null, cliente: cliente as ClientRow | null });
          const baselineMessage = applyTokens(stageDef?.template || "", tokens);

          const history = [...(recentMsgs || [])].reverse()
            .map((m) => `[${m.direction === "outbound" ? "Empresa" : "Cliente"}] ${m.body}`)
            .join("\n") || "(sem mensagens anteriores registradas)";

          const moduleLabel = cand.module === "oleo" ? "troca de óleo" : "pagamento de aluguel";
          const systemPrompt = "Você decide se uma cobrança automática deve ser enviada a um cliente de locação de motos, "
            + "lendo o histórico recente de conversa no WhatsApp. Seja conservador: se o cliente já avisou que vai pagar/já "
            + "resolveu, já está negociando, ou o motivo de atraso já foi tratado na conversa, prefira 'skip'. Só decida "
            + "'send' quando não houver nenhum sinal de que o cliente já está ciente e agindo. Nunca invente compromissos "
            + "que não estão explicitamente na conversa. Responda APENAS com um JSON no formato "
            + '{"decision": "send" | "skip", "reasoning": "string curta explicando por quê", "message": "string, obrigatório só se decision=send"}.';

          const userPrompt = [
            `Pendência: ${moduleLabel}.`,
            `Cliente: ${cliente?.nome || "(sem nome)"}.`,
            cand.motoId ? `Moto: ${moto?.placa || cand.motoId}.` : null,
            `Dias em atraso: ${daysLate}.`,
            cand.valor != null ? `Valor: R$ ${cand.valor}.` : null,
            `Etapa da régua a disparar: ${nextStage} de ${rule.stages.length}.`,
            `Mensagem padrão dessa etapa: "${baselineMessage}"`,
            "",
            "Histórico recente da conversa (mais antiga primeiro):",
            history,
          ].filter(Boolean).join("\n");

          const result = await decideWithFallback({ systemPrompt, userPrompt });
          const decision = result.decision === "send" ? "send" : "skip";
          const reasoning = typeof result.reasoning === "string" && result.reasoning ? result.reasoning : "(sem justificativa retornada)";
          const proposedMessage = decision === "send"
            ? (typeof result.message === "string" && result.message.trim() ? result.message : baselineMessage)
            : null;

          await supabase.from("collection_ai_dispatch_log").insert({
            ...logBase,
            decision,
            status: decision === "send" ? "pending_review" : "skipped",
            reasoning,
            proposed_message: proposedMessage,
          });

          if (decision === "send") summary.sent_pending_review++;
          else summary.skipped++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[collection-ai-dispatch] falha ao avaliar ${cand.module}:${cand.entityId}`, msg);
          await supabase.from("collection_ai_dispatch_log").insert({
            ...logBase, decision: "skip", status: "skipped",
            reasoning: `Falha técnica ao avaliar (não tentar de novo automaticamente): ${msg.slice(0, 300)}`,
          });
          summary.failed++;
        }
      }
    }

    console.log("[collection-ai-dispatch] concluído:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), { headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[collection-ai-dispatch] erro geral:", msg);
    return new Response(JSON.stringify({ error: msg, ...summary }), { status: 500, headers: jsonHeaders });
  }
});
