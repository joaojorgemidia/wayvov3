import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { getDataCache, isDataCacheInitialized } from "@/lib/data-cache";
import {
  CollectionFollowup,
  CollectionModule,
  CollectionRule,
  DEFAULT_STAGES,
  PendingItem,
  daysOverdue,
  defaultRule,
  expectedStage,
  isEscalated,
  lastSentStage,
} from "@/lib/collections";
import {
  buildAllTokens,
  applyTokens,
} from "@/lib/message-tokens";
import {
  getOilStatus,
  loadBrandConfig,
  loadGlobalConfig,
} from "@/lib/oil-kpis";
import { isSnoozed as isOleoSnoozed, onSnoozeChange as onOleoSnoozeChange } from "@/lib/oil-snooze";

const db = supabase as any;

const ALL_MODULES: CollectionModule[] = ["pagamento", "multa", "outras_receitas", "oleo", "vistoria", "manutencao"];

interface UseCollectionsReturn {
  rules: Record<CollectionModule, CollectionRule>;
  followups: CollectionFollowup[];
  pendings: PendingItem[];
  escalated: PendingItem[];
  loading: boolean;
  saveRule: (rule: CollectionRule) => Promise<void>;
  registerFollowup: (item: PendingItem, channel: CollectionFollowup["channel"], message: string, stageOverride?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCollections(): UseCollectionsReturn {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const cid = activeCompany?.id;

  const [rulesById, setRulesById] = useState<Record<CollectionModule, CollectionRule>>(() => {
    const out = {} as Record<CollectionModule, CollectionRule>;
    for (const m of ALL_MODULES) out[m] = defaultRule(cid || "", m);
    return out;
  });
  const [followups, setFollowups] = useState<CollectionFollowup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    const [rulesRes, fupsRes] = await Promise.all([
      db.from("collection_rules").select("*").eq("company_id", cid),
      db.from("collection_followups").select("*").eq("company_id", cid),
    ]);
    const merged = {} as Record<CollectionModule, CollectionRule>;
    for (const m of ALL_MODULES) merged[m] = defaultRule(cid, m);
    for (const row of rulesRes.data || []) {
      const mod = row.module as CollectionModule;
      if (ALL_MODULES.includes(mod)) {
        merged[mod] = {
          id: row.id,
          company_id: row.company_id,
          module: mod,
          enabled: row.enabled,
          stages: Array.isArray(row.stages) && row.stages.length > 0 ? row.stages : DEFAULT_STAGES[mod],
        };
      }
    }
    setRulesById(merged);
    setFollowups(fupsRes.data || []);
    setLoading(false);
  }, [cid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveRule = useCallback(async (rule: CollectionRule) => {
    if (!cid) return;
    // Proteção: nunca persistir régua sem etapas (causa "volta para o padrão"
    // ao recarregar, já que o hook cai no fallback de DEFAULT_STAGES).
    const stages = Array.isArray(rule.stages) && rule.stages.length > 0
      ? rule.stages
      : DEFAULT_STAGES[rule.module];
    const payload = {
      company_id: cid,
      module: rule.module,
      enabled: rule.enabled,
      stages,
    };
    const { error } = await db
      .from("collection_rules")
      .upsert(payload, { onConflict: "company_id,module" })
      .select("id")
      .single();

    if (error) throw error;
    await fetchAll();
  }, [cid, fetchAll]);

  const registerFollowup = useCallback(async (
    item: PendingItem,
    channel: CollectionFollowup["channel"],
    message: string,
    stageOverride?: number,
  ) => {
    if (!cid) return;
    await db.from("collection_followups").insert({
      company_id: cid,
      module: item.module,
      entity_id: item.entityId,
      cliente_id: item.clienteId,
      moto_id: item.motoId,
      stage_number: stageOverride ?? item.nextStage,
      channel,
      message_snapshot: message,
      sent_by: user?.id || null,
      escalated: item.escalated,
    });
    await fetchAll();
  }, [cid, user?.id, fetchAll]);

  // ─── Cálculo das pendências ─────────────────────────────────────
  const pendings = useMemo<PendingItem[]>(() => {
    if (!isDataCacheInitialized()) return [];
    const cache = getDataCache();
    const motosById = new Map(cache.motos.map((m) => [m.id, m]));
    const clientsById = new Map(cache.clients.map((c) => [c.id, c]));
    const rentalsById = new Map(cache.rentals.map((r) => [r.id, r]));

    const result: PendingItem[] = [];

    function build(
      module: CollectionModule,
      entityId: string,
      dueDate: string | null,
      descricao: string,
      clienteId: string | null,
      motoId: string | null,
      extras?: { valor?: number; categoriaLabel?: string },
    ): PendingItem | null {
      const rule = rulesById[module];
      const daysLate = daysOverdue(dueDate);
      if (daysLate < 0) return null;
      const exp = expectedStage(rule, daysLate);
      if (exp <= 0) return null;
      const sent = lastSentStage(followups, module, entityId);
      const next = Math.max(sent + 1, 1);
      const stageDef = rule.stages.find((s) => s.stage === Math.min(next, rule.stages.length))
        || rule.stages[rule.stages.length - 1];
      const moto = motoId ? motosById.get(motoId) || null : null;
      const cliente = clienteId ? clientsById.get(clienteId) || null : null;
      const tokens = buildAllTokens({ moto, cliente });
      const template = applyTokens(stageDef?.template || "", tokens);
      return {
        module,
        entityId,
        clienteId,
        motoId,
        descricao,
        dueDateISO: dueDate,
        daysLate,
        expectedStage: exp,
        sentStage: sent,
        nextStage: Math.min(next, rule.stages.length),
        escalated: isEscalated(rule, sent),
        totalStages: rule.stages.length,
        template,
        valor: extras?.valor,
        categoriaLabel: extras?.categoriaLabel,
      };
    }

    // Receitas pendentes (aluguel, caução, multa repassada, outras) — agrupadas no módulo "pagamento"
    const CAT_LABELS: Record<string, string> = {
      aluguel: "Aluguel",
      caucao: "Caução",
      multa: "Multa repassada",
      multa_transito_receita: "Multa de Trânsito",
      multa_transito: "Multa de Trânsito",
      manutencao_receita: "Manutenção",
      juros_atraso: "Juros de atraso",
      venda_moto: "Venda de moto",
      servico: "Serviço",
      venda: "Venda",
      outro: "Outra receita",
    };
    for (const e of cache.financial) {
      if (e.tipo !== "receita") continue;
      if (e.pago) continue;
      if (e.ignorada) continue;
      const due = e.dataPrevista || e.data;
      const catKey = (e.categoria || "outro").toLowerCase();
      const catLabel = CAT_LABELS[catKey] || e.categoria || "Receita";
      // Prioriza cliente: o entry tem clienteId ou herda da locação vinculada
      let cli = e.clienteId || null;
      if (!cli && e.rentalId) {
        const r = rentalsById.get(e.rentalId);
        if (r) cli = r.clienteId;
      }
      // Categorização: aluguel/caução → pagamento; multas → multa; demais → outras_receitas
      const isMultaCat = catKey === "multa" || catKey === "multa_transito" || catKey === "multa_transito_receita";
      const isAluguelCat = catKey === "aluguel" || catKey === "caucao";
      const targetModule: CollectionModule = isMultaCat
        ? "multa"
        : isAluguelCat
          ? "pagamento"
          : "outras_receitas";
      const item = build(
        targetModule, e.id, due,
        e.descricao || catLabel,
        cli, e.motoId,
        { valor: e.valor, categoriaLabel: catLabel },
      );
      if (item) result.push(item);
    }
    // Multas pendentes
    for (const f of cache.fines) {
      if (f.status !== "pendente") continue;
      const cli = f.clienteId;
      const moto = f.motoId;
      const item = build(
        "multa", f.id, f.dataMulta, f.descricao || "Multa",
        cli, moto, { valor: f.valor, categoriaLabel: "Multa de trânsito" },
      );
      if (item) result.push(item);
    }
    // Troca de óleo: motos cuja ultimaTrocaOleo + intervalo (usar km como proxy)
    // Usa getOilStatus para só sinalizar quando estiver realmente vencida.
    const brandCfg = loadBrandConfig();
    const globalCfg = loadGlobalConfig();
    for (const m of cache.motos) {
      if (m.status === "vendida" || m.status === "inativa") continue;
      // Sem locatário ativo não faz sentido cobrar troca de óleo
      const activeRentalOleo = cache.rentals.find((r) => r.motoId === m.id && r.status === "ativa");
      if (!activeRentalOleo) continue;
      const status = getOilStatus(m, brandCfg, globalCfg, cache.rentals);
      if (status.situation !== "vencida") continue;
      // due date = momento em que ficou vencida (última troca + overdueDays)
      const overdueDays = globalCfg.overdueDays ?? 10;
      const diasDesde = status.diasDesdeUltima ?? overdueDays + 1;
      const diasAtraso = Math.max(1, diasDesde - overdueDays);
      const due = new Date(Date.now() - diasAtraso * 86400000).toISOString().slice(0, 10);
      const cli = activeRentalOleo.clienteId || null;
      const item = build("oleo", m.id, due, `Troca de óleo • ${m.placa}`, cli, m.id);
      if (item) result.push(item);
    }
    // Vistoria: motos cuja última vistoria está vencida (>180 dias por padrão)
    for (const m of cache.motos) {
      if (m.status === "vendida" || m.status === "inativa") continue;
      if (!m.ultimaVistoria) continue;
      // tratamos a vistoria como "vencida" se passou 180d
      const refDate = new Date(m.ultimaVistoria.length === 10 ? m.ultimaVistoria + "T00:00:00" : m.ultimaVistoria);
      const dueDate = new Date(refDate.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const activeRental = cache.rentals.find((r) => r.motoId === m.id && r.status === "ativa");
      const cli = activeRental?.clienteId || null;
      const item = build("vistoria", m.id, dueDate, `Vistoria • ${m.placa}`, cli, m.id);
      if (item) result.push(item);
    }
    // Manutenção: agendadas/em_andamento com data passada
    for (const mn of cache.maintenance) {
      if (mn.status === "concluida") continue;
      const moto = motosById.get(mn.motoId);
      const activeRental = cache.rentals.find((r) => r.motoId === mn.motoId && r.status === "ativa");
      const cli = activeRental?.clienteId || null;
      const item = build(
        "manutencao",
        mn.id,
        mn.data,
        `${mn.tipo} • ${moto?.placa || ""}`,
        cli,
        mn.motoId,
        { valor: mn.custo, categoriaLabel: "Manutenção" },
      );
      if (item) result.push(item);
    }

    return result;
  }, [rulesById, followups]);

  // Última data de envio por entidade (para desempate por antiguidade do último follow-up)
  const lastSentAtByEntity = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of followups) {
      if (f.regularized_at) continue;
      const key = `${f.module}:${f.entity_id}`;
      const t = new Date(f.sent_at).getTime();
      const cur = map.get(key);
      if (cur === undefined || t > cur) map.set(key, t);
    }
    return map;
  }, [followups]);

  /**
   * Ordenação de prioridade (maior prioridade primeiro):
   * 1) mais etapas já enviadas (sentStage desc)
   * 2) execução mais antiga da última etapa (lastSentAt asc) — quem foi cobrado há mais tempo sobe
   * 3) mais dias de atraso (daysLate desc)
   */
  /**
   * Ordenação: itens que JÁ tiveram follow-up vão para o final
   * (quanto mais recente o último envio, mais ao fim). Quem nunca foi
   * cobrado fica no topo, ordenado por mais dias em atraso.
   */
  const priorityCompare = useCallback((a: PendingItem, b: PendingItem) => {
    const ka = `${a.module}:${a.entityId}`;
    const kb = `${b.module}:${b.entityId}`;
    const ta = lastSentAtByEntity.get(ka);
    const tb = lastSentAtByEntity.get(kb);
    // Nunca cobrados primeiro
    if (ta === undefined && tb !== undefined) return -1;
    if (ta !== undefined && tb === undefined) return 1;
    // Ambos cobrados: o cobrado há mais tempo sobe (mais antigo primeiro)
    if (ta !== undefined && tb !== undefined && ta !== tb) return ta - tb;
    // Tiebreak: maior atraso primeiro
    return b.daysLate - a.daysLate;
  }, [lastSentAtByEntity]);

  const escalated = useMemo(
    () => pendings.filter((p) => p.escalated).sort(priorityCompare),
    [pendings, priorityCompare],
  );

  return {
    rules: rulesById,
    followups,
    pendings: pendings
      .filter((p) => !p.escalated)
      .sort(priorityCompare),
    escalated,
    loading,
    saveRule,
    registerFollowup,
    refresh: fetchAll,
  };
}

/** Hook leve só para consultar a etapa atual de UMA entidade (para o badge inline). */
export function useFollowupForEntity(module: CollectionModule, entityId: string) {
  const { followups, rules } = useCollections();
  const sent = lastSentStage(followups, module, entityId);
  const total = rules[module].stages.length;
  return { sentStage: sent, totalStages: total };
}