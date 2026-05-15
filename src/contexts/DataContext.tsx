import React, { useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setDataCache, setSaveCallback, setBulkInsertCallback, clearDataCache, getDataCache } from "@/lib/data-cache";
import type { Motorcycle, Client, Rental, Fine, Maintenance, FinancialEntry } from "@/lib/types";
import { recordAction, type EntityTable } from "@/lib/action-history";

const db = supabase as any;

// ─── Mappers ────────────────────────────────────────────────────

function dbToMoto(r: any): Motorcycle {
  return {
    id: r.id, placa: r.placa || "", modelo: r.modelo || "", anoModelo: r.ano_modelo ?? null,
    cor: r.cor || "", chassi: r.chassi || "", renavam: r.renavam || "", numMotor: r.num_motor || "",
    aplicativo: r.aplicativo || "", tipo: r.tipo === "terceiro" ? "terceiro" : "propria",
    proprietario: r.proprietario || undefined, status: r.status || "disponivel",
    kmAtual: r.km_atual ?? null, kmCompra: r.km_compra ?? null, kmTrocaOleo: r.km_troca_oleo ?? null,
    kmVenda: r.km_venda ?? null, ultimaVistoria: r.ultima_vistoria || null,
    ultimaTrocaOleo: r.ultima_troca_oleo || null, historicoOleo: r.historico_oleo || [],
    valorCompra: r.valor_compra != null ? Number(r.valor_compra) : null,
    dataCompra: r.data_compra || null, valorFipe: r.valor_fipe != null ? Number(r.valor_fipe) : null,
    dataFipe: r.data_fipe || null, valorVenda: r.valor_venda != null ? Number(r.valor_venda) : null,
    dataVenda: r.data_venda || null, lucroOperacional: r.lucro_operacional != null ? Number(r.lucro_operacional) : null,
    decisao: r.decisao || null, crlvPdfName: r.crlv_pdf_name || null, crlvPdfData: null,
  };
}

function motoToDb(m: Motorcycle): any {
  return {
    placa: m.placa, modelo: m.modelo, ano_modelo: m.anoModelo, cor: m.cor, chassi: m.chassi,
    renavam: m.renavam, num_motor: m.numMotor, aplicativo: m.aplicativo, tipo: m.tipo,
    proprietario: m.proprietario || null, status: m.status, km_atual: m.kmAtual,
    km_compra: m.kmCompra, km_troca_oleo: m.kmTrocaOleo, km_venda: m.kmVenda,
    ultima_vistoria: m.ultimaVistoria || null, ultima_troca_oleo: m.ultimaTrocaOleo || null,
    historico_oleo: m.historicoOleo || [], valor_compra: m.valorCompra,
    data_compra: m.dataCompra || null, valor_fipe: m.valorFipe, data_fipe: m.dataFipe || null,
    valor_venda: m.valorVenda, data_venda: m.dataVenda || null,
    lucro_operacional: m.lucroOperacional, decisao: m.decisao, crlv_pdf_name: m.crlvPdfName,
  };
}

function dbToClient(r: any): Client {
  return {
    id: r.id, nome: r.nome || "", cpf: r.cpf || "", cnh: r.cnh || "",
    cnhCategoria: r.cnh_categoria || "", cnhValidade: r.cnh_validade || null,
    cnhPdfName: r.cnh_pdf_name || null, cnhPdfData: null,
    telefone: r.telefone || "", email: r.email || "",
    cep: r.cep || "", rua: r.rua || "", numero: r.numero || "",
    complemento: r.complemento || "", bairro: r.bairro || "",
    cidade: r.cidade || "", estado: r.estado || "",
    comprovanteEnderecoName: r.comprovante_endereco_name || null, comprovanteEnderecoData: null,
    emergenciaNome1: r.emergencia_nome1 || "", emergenciaTel1: r.emergencia_tel1 || "",
    emergenciaNome2: r.emergencia_nome2 || "", emergenciaTel2: r.emergencia_tel2 || "",
    observacoes: r.observacoes || "", createdAt: r.created_at || "",
    asaasCustomerId: r.asaas_customer_id || null,
  };
}

function clientToDb(c: Client): any {
  return {
    nome: c.nome, cpf: c.cpf, cnh: c.cnh, cnh_categoria: c.cnhCategoria,
    cnh_validade: c.cnhValidade || null, cnh_pdf_name: c.cnhPdfName,
    telefone: c.telefone, email: c.email, cep: c.cep, rua: c.rua,
    numero: c.numero, complemento: c.complemento, bairro: c.bairro,
    cidade: c.cidade, estado: c.estado,
    comprovante_endereco_name: c.comprovanteEnderecoName,
    emergencia_nome1: c.emergenciaNome1, emergencia_tel1: c.emergenciaTel1,
    emergencia_nome2: c.emergenciaNome2, emergencia_tel2: c.emergenciaTel2,
    observacoes: c.observacoes,
  };
}

function dbToRental(r: any): Rental {
  return {
    id: r.id, motoId: r.moto_id || "", clienteId: r.cliente_id || "",
    vendedor: r.vendedor || "", dataInicio: r.data_inicio || "", horaInicio: r.hora_inicio || "",
    dataFim: r.data_fim || null, dataFimContrato: r.data_fim_contrato || null,
    proximoPagamento: r.proximo_pagamento || null, tempoMinimoContrato: r.tempo_minimo_contrato ?? null,
    frequenciaPagamento: r.frequencia_pagamento || "",
    valorDiario: Number(r.valor_diario) || 0, valorCaucao: Number(r.valor_caucao) || 0,
    caucaoPendente: r.caucao_pendente || false, caucaoParcelado: r.caucao_parcelado || false,
    parcelasCaucao: r.parcelas_caucao || [],
    multaAtraso: Number(r.multa_atraso) || 0, jurosAtrasoMes: Number(r.juros_atraso_mes) || 0,
    localRetirada: r.local_retirada || "", localDevolucao: r.local_devolucao || "",
    kmInicio: r.km_inicio || 0, kmFim: r.km_fim ?? null,
    nivelCombustivel: r.nivel_combustivel || "", plano: r.plano || "",
    raioCirculacao: r.raio_circulacao || "", seguroTerceiros: r.seguro_terceiros || false,
    gerarCobrancaCaucao: r.gerar_cobranca_caucao || false,
    gerarCobrancaPagamento: r.gerar_cobranca_pagamento || false,
    status: r.status || "ativa",
    checklistRetirada: r.checklist_retirada || [], checklistDevolucao: r.checklist_devolucao || [],
    observacoes: r.observacoes || "", createdAt: r.created_at || "",
  };
}

function rentalToDb(r: Rental): any {
  return {
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
  };
}

function dbToFine(r: any): Fine {
  return {
    id: r.id, motoId: r.moto_id || "", clienteId: r.cliente_id || null,
    rentalId: r.rental_id || null, dataMulta: r.data_multa || "",
    dataNotificacao: r.data_notificacao || null, valor: Number(r.valor) || 0,
    descricao: r.descricao || "", status: r.status || "pendente",
    responsavel: r.responsavel || "locadora",
  };
}

function fineToDb(f: Fine): any {
  return {
    moto_id: f.motoId, cliente_id: f.clienteId || null,
    rental_id: f.rentalId || null, data_multa: f.dataMulta,
    data_notificacao: f.dataNotificacao || null, valor: f.valor,
    descricao: f.descricao, status: f.status, responsavel: f.responsavel,
  };
}

function dbToMaintenance(r: any): Maintenance {
  return {
    id: r.id, motoId: r.moto_id || "", tipo: r.tipo || "outro",
    data: r.data || "", km: r.km ?? null, custo: Number(r.custo) || 0,
    descricao: r.descricao || "", fornecedor: r.fornecedor || "",
    status: r.status || "agendada",
  };
}

function maintenanceToDb(m: Maintenance): any {
  return {
    moto_id: m.motoId, tipo: m.tipo, data: m.data, km: m.km,
    custo: m.custo, descricao: m.descricao, fornecedor: m.fornecedor, status: m.status,
  };
}

function dbToFinancial(r: any): FinancialEntry {
  return {
    id: r.id, tipo: r.tipo || "despesa", categoria: r.categoria || "",
    subcategoria: r.subcategoria || undefined, descricao: r.descricao || "",
    valor: Number(r.valor) || 0, data: r.data || "",
    dataPrevista: r.data_prevista || undefined,
    motoId: r.moto_id || null, rentalId: r.rental_id || null,
    clienteId: r.cliente_id || null, pago: r.pago ?? false,
    recorrente: r.recorrente ?? false, recorrenciaTipo: r.recorrencia_tipo || undefined,
    recorrenciaVezes: r.recorrencia_vezes ?? undefined,
    despesaFixa: r.despesa_fixa ?? false, ignorada: r.ignorada ?? false,
    observacao: r.observacao || undefined, tags: r.tags || [],
    conta: r.conta || undefined, natureza: r.natureza || undefined,
    placa: r.placa || undefined, clienteNome: r.cliente_nome || undefined,
    classificacaoManual: r.classificacao_manual ?? false,
    serieId: r.serie_id || undefined, fixedOriginId: r.fixed_origin_id || undefined,
    recurringGroupId: r.recurring_group_id || null,
    createdAt: r.created_at || undefined,
    asaasPaymentId: r.asaas_payment_id || null,
    asaasStatus: r.asaas_status || null,
    asaasBoletoUrl: r.asaas_boleto_url || null,
    asaasInvoiceUrl: r.asaas_invoice_url || null,
  };
}

function financialToDb(e: FinancialEntry): any {
  return {
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
    recurring_group_id: e.recurringGroupId || null,
    asaas_payment_id: e.asaasPaymentId || null,
    asaas_status: e.asaasStatus || null,
    asaas_boleto_url: e.asaasBoletoUrl || null,
    asaas_invoice_url: e.asaasInvoiceUrl || null,
  };
}

function dbToBankAccount(r: any) {
  return { id: r.id, nome: r.nome || "", banco: r.banco || "", saldoInicial: Number(r.saldo_inicial) || 0 };
}

function bankAccountToDb(a: any) {
  return { nome: a.nome, banco: a.banco, saldo_inicial: a.saldoInicial };
}

// ─── Table mapper registry ──────────────────────────────────────

const TABLE_MAP: Record<string, { toDb: (item: any) => any }> = {
  motorcycles: { toDb: motoToDb },
  clients: { toDb: clientToDb },
  rentals: { toDb: rentalToDb },
  fines: { toDb: fineToDb },
  maintenance: { toDb: maintenanceToDb },
  financial_entries: { toDb: financialToDb },
  bank_accounts: { toDb: bankAccountToDb },
};

// Map DB table name -> data-cache key so we can optimistically update
// the in-memory cache as soon as a save is dispatched. Without this, the
// DataProvider's query cache may briefly broadcast STALE data to subscribers
// (FinanceiroPage and others), causing edits to "disappear" until the
// network round-trip completes and the refetch resolves.
const TABLE_TO_CACHE_KEY: Record<string, "motos" | "clients" | "rentals" | "fines" | "maintenance" | "financial" | "bankAccounts"> = {
  motorcycles: "motos",
  clients: "clients",
  rentals: "rentals",
  fines: "fines",
  maintenance: "maintenance",
  financial_entries: "financial",
  bank_accounts: "bankAccounts",
};

// ─── Fetch helper ───────────────────────────────────────────────

const FETCH_PAGE_SIZE = 1000;

async function fetchTableRows(table: string, cid: string) {
  const allRows: any[] = [];

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("created_at")
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < FETCH_PAGE_SIZE) {
      break;
    }
  }

  return { data: allRows, error: null };
}

async function fetchAll(cid: string) {
  const q = (table: string) => fetchTableRows(table, cid);

  const [motos, clients, rentals, fines, maintenance, financial, bankAccounts] =
    await Promise.all([
      q("motorcycles"), q("clients"), q("rentals"), q("fines"),
      q("maintenance"), q("financial_entries"), q("bank_accounts"),
    ]);

  const tableNames = ["motorcycles","clients","rentals","fines","maintenance","financial_entries","bank_accounts"];
  const errors = [motos, clients, rentals, fines, maintenance, financial, bankAccounts]
    .map((r, i) => r.error ? `[${tableNames[i]}]: ${r.error.message}` : null)
    .filter(Boolean);

  if (errors.length > 0) {
    throw new Error(`Supabase query failed:\n${errors.join("\n")}`);
  }

  return {
    motos: (motos.data || []).map(dbToMoto),
    clients: (clients.data || []).map(dbToClient),
    rentals: (rentals.data || []).map(dbToRental),
    fines: (fines.data || []).map(dbToFine),
    maintenance: (maintenance.data || []).map(dbToMaintenance),
    financial: (financial.data || []).map(dbToFinancial),
    bankAccounts: (bankAccounts.data || []).map(dbToBankAccount),
  };
}

// ─── Audit helper ───────────────────────────────────────────────

async function auditLog(table: string, recordId: string, action: string, payload: any, companyId: string) {
  await db.from("audit_log").insert({
    table_name: table,
    record_id: recordId,
    action,
    payload,
    company_id: companyId,
  });
}

// ─── Provider ───────────────────────────────────────────────────

export function DataProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;
  const queryKey = useMemo(() => ["all-data", user?.id, cid], [user?.id, cid]);
  const mutationQueueRef = useRef<Record<string, Promise<unknown>>>({});
  const latestSaveVersionRef = useRef<Record<string, number>>({});

  const authReady = !authLoading && !!user;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => {
      if (!cid) throw new Error("No active company selected");
      return fetchAll(cid);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: authReady && !!cid,
    retry: 1,
  });

  useEffect(() => {
    if (!user) {
      clearDataCache();
    }
  }, [user]);

  // Set up the save callback
  const runQueuedMutation = useCallback((table: string, mutation: () => Promise<void>): Promise<void> => {
    const previous = mutationQueueRef.current[table] || Promise.resolve();
    const queued: Promise<void> = previous
      .catch(() => undefined)
      .then(mutation);

    mutationQueueRef.current[table] = queued.catch(() => undefined);
    return queued;
  }, []);

  const saveFn = useCallback((table: string, items: any[]) => {
    const nextVersion = (latestSaveVersionRef.current[table] || 0) + 1;
    latestSaveVersionRef.current[table] = nextVersion;

    return runQueuedMutation(table, async () => {
    if (!cid) throw new Error("No active company selected");

    const mapper = TABLE_MAP[table];
    if (!mapper) throw new Error(`Unknown table: ${table}`);

    // ─── Phase 1: always execute (even if a newer version is queued) ──────────
    // Optimistically update the cache and soft-delete removed rows regardless of
    // version. This prevents deletions from being silently swallowed when a
    // concurrent auto-materialize or reconcile effect bumps the version counter
    // before our mutation body runs.
    const cacheKey = TABLE_TO_CACHE_KEY[table];
    // Snapshot existing cache BEFORE updating it (needed for the diff below).
    const existingItems = cacheKey ? [...(getDataCache()[cacheKey] as any[])] : [];

    if (cacheKey) {
      setDataCache({ [cacheKey]: items } as any);
    }

    // ─── INCREMENTAL DIFF ────────────────────────────────────────
    const existingById = new Map<string, any>(existingItems.map((item: any) => [item.id, item]));
    const incomingIds = new Set<string>(items.map((i: any) => i.id));
    const toSoftDelete = existingItems.filter((item: any) => !incomingIds.has(item.id)).map((item: any) => item.id);

    const deletedSnapshots = existingItems.filter((item: any) => toSoftDelete.includes(item.id));
    const userInfo = {
      companyId: cid,
      userId: user?.id || null,
      userName: user?.user_metadata?.display_name || user?.email || "—",
    };

    // Compute full diff upfront so new rows can be inserted unconditionally.
    const createdItems: any[] = [];
    const updatedItemsBefore: any[] = [];
    const updatedItemsAfter: any[] = [];
    const newRows: any[] = [];
    const changedRows: any[] = [];

    for (const i of items) {
      const before = existingById.get(i.id);
      const afterDb = mapper.toDb(i);
      if (!before) {
        createdItems.push(i);
        newRows.push({ ...afterDb, id: i.id, company_id: cid, deleted_at: null });
        continue;
      }
      // Cheap shallow diff using JSON.stringify per key
      const beforeDb = mapper.toDb(before);
      let changed = false;
      for (const k of Object.keys(afterDb)) {
        if (JSON.stringify(afterDb[k]) !== JSON.stringify(beforeDb[k])) { changed = true; break; }
      }
      if (changed) {
        updatedItemsBefore.push(before);
        updatedItemsAfter.push(i);
        changedRows.push({ ...afterDb, id: i.id, company_id: cid, deleted_at: null });
      }
    }

    // Soft-delete removed rows — always, regardless of version gate.
    // Skipping soft-deletes for stale versions caused confirmed deletions to
    // not persist: the version gate returned early before touching the DB,
    // and the subsequent realtime refetch restored the deleted entries.
    const now = new Date().toISOString();
    if (toSoftDelete.length > 0) {
      for (let b = 0; b < toSoftDelete.length; b += 50) {
        const batch = toSoftDelete.slice(b, b + 50);
        await db.from(table).update({ deleted_at: now }).in("id", batch);
      }
    }

    // Insert brand-new rows — always, regardless of version gate.
    // New entries must be persisted even when a concurrent auto-materialize or
    // reconcile effect has already bumped the version counter, otherwise the
    // base entry of a new recurring series is silently lost: the auto-materialize
    // picks up the optimistic cache update, calls saveFinancial (bumping version),
    // and the original save's Phase 2 is skipped — leaving only the generated
    // occurrences in the DB while the base entry vanishes after a page refresh.
    for (let b = 0; b < newRows.length; b += 100) {
      const batch = newRows.slice(b, b + 100);
      const { error } = await db.from(table).upsert(batch, { onConflict: "id" });
      if (error) throw error;
    }

    // ─── Phase 2: version gate — skip updates if a newer save is queued ───────
    // Updates represent field edits; only the latest snapshot should win to
    // prevent stale values from overwriting newer ones. Soft-deletes and
    // inserts are already done above and are always correct regardless of version.
    if (latestSaveVersionRef.current[table] !== nextVersion) {
      // Still record deletes to action history even when stale.
      if (deletedSnapshots.length) {
        (async () => {
          try {
            await recordAction({ ...userInfo, actionType: "delete", entityType: table as EntityTable, snapshotBefore: deletedSnapshots, snapshotAfter: [] });
          } catch (e) {
            console.warn("[action-history] stale delete hook failed", e);
          }
        })();
      }
      return;
    }

    // Upsert ONLY changed (existing) rows — new rows were already inserted above
    for (let b = 0; b < changedRows.length; b += 100) {
      if (latestSaveVersionRef.current[table] !== nextVersion) return;
      const batch = changedRows.slice(b, b + 100);
      const { error } = await db.from(table).upsert(batch, { onConflict: "id" });
      if (error) throw error;
    }

    // Record action history fire-and-forget — do NOT block the save UI
    (async () => {
      try {
        const entityType = table as EntityTable;
        if (createdItems.length) {
          const action = createdItems.length >= 5 ? "bulk_import" : "create";
          await recordAction({ ...userInfo, actionType: action, entityType, snapshotBefore: [], snapshotAfter: createdItems });
        }
        if (updatedItemsAfter.length) {
          await recordAction({ ...userInfo, actionType: "update", entityType, snapshotBefore: updatedItemsBefore, snapshotAfter: updatedItemsAfter });
        }
        if (deletedSnapshots.length) {
          await recordAction({ ...userInfo, actionType: "delete", entityType, snapshotBefore: deletedSnapshots, snapshotAfter: [] });
        }
      } catch (e) {
        console.warn("[action-history] save hook failed", e);
      }
    })();

    // Do NOT invalidate the React Query cache here — the optimistic
    // setDataCache() above already broadcast the new state to all subscribers.
    // Refetching all 7 tables on every save is what caused the perceived lag.
    });
  }, [cid, qc, queryKey, runQueuedMutation, user]);

  // Bulk INSERT helper — does NOT soft-delete missing rows. Use for imports.
  const bulkInsertFn = useCallback((table: string, items: any[]) => runQueuedMutation(table, async () => {
    if (!cid) throw new Error("No active company selected");
    const mapper = TABLE_MAP[table];
    if (!mapper) throw new Error(`Unknown table: ${table}`);
    const rows = items.map(i => ({ ...mapper.toDb(i), id: i.id, company_id: cid, deleted_at: null }));
    for (let b = 0; b < rows.length; b += 100) {
      const batch = rows.slice(b, b + 100);
      const { error } = await db.from(table).upsert(batch, { onConflict: "id" });
      if (error) throw error;
      for (const row of batch) {
        await auditLog(table, row.id, "insert", row, cid);
      }
    }
    try {
      const entityType = table as EntityTable;
      const userInfo = {
        companyId: cid,
        userId: user?.id || null,
        userName: user?.user_metadata?.display_name || user?.email || "—",
      };
      await recordAction({ ...userInfo, actionType: "bulk_import", entityType, snapshotBefore: [], snapshotAfter: items });
    } catch (e) {
      console.warn("[action-history] bulk insert hook failed", e);
    }
    qc.invalidateQueries({ queryKey });
  }), [cid, qc, queryKey, runQueuedMutation, user]);

  // Keep save bridge and cache in sync via effects (not during render)
  useEffect(() => {
    if (authReady && cid) {
      setSaveCallback(saveFn);
      setBulkInsertCallback(bulkInsertFn);
    }
  }, [authReady, cid, saveFn, bulkInsertFn]);

  // Set cache in an effect (NOT during render — that triggers React warning + cascading re-renders)
  useEffect(() => {
    if (authReady && data) {
      setDataCache(data);
    }
  }, [authReady, data]);

  // ─── Realtime subscriptions ───────────────────────────────────
  // Listen for changes made by OTHER users on the same company and refresh
  // the local cache instantly. We debounce to avoid refetch storms during
  // bulk operations.
  useEffect(() => {
    if (!authReady || !cid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey });
      }, 350);
    };

    const tables = [
      "motorcycles", "clients", "rentals", "fines", "maintenance",
      "financial_entries", "bank_accounts", "companies",
      "collection_followups", "collection_rules",
    ];

    const channel = supabase.channel(`company-${cid}-realtime`);
    for (const t of tables) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t, filter: `company_id=eq.${cid}` },
        (payload: any) => {
          // Skip events from our own user (we already updated optimistically)
          const actor = payload?.new?.updated_by || payload?.new?.user_id;
          if (actor && user?.id && actor === user.id) {
            // still refetch action_history for self? handled separately
          }
          scheduleRefetch();
        }
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [authReady, cid, qc, queryKey, user?.id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <p className="text-destructive font-semibold">Erro ao carregar dados</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Não foi possível conectar ao banco de dados. Verifique sua conexão e tente novamente.
        </p>
        <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
          {String(error)}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm underline text-primary"
        >
          Recarregar
        </button>
      </div>
    );
  }

  if (authReady && !cid) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <p className="font-semibold">Nenhuma empresa disponível para esta conta</p>
        <p className="text-sm text-muted-foreground max-w-md">
          O acesso foi autenticado, mas não foi possível resolver a empresa vinculada ao usuário.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm underline text-primary"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (authLoading || (authReady && !!cid && (isLoading || !data))) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
