import React, { useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setDataCache, setSaveCallback, setBulkInsertCallback, clearDataCache, getDataCache } from "@/lib/data-cache";
import type { Motorcycle, Client, Rental, Fine, Maintenance, FinancialEntry } from "@/lib/types";
import { recordAction, type EntityTable } from "@/lib/action-history";
import {
  dbToMoto, motoToDb, dbToClient, clientToDb,
  dbToRental, rentalToDb, dbToFine, fineToDb,
  dbToMaintenance, maintenanceToDb, dbToFinancial, financialToDb,
  dbToBankAccount, bankAccountToDb,
  TABLE_MAP, TABLE_TO_CACHE_KEY,
} from "@/lib/db-mappers";

const db = supabase as any;

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
      .order("id")
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
  // Conta saves em andamento — realtime refetches são bloqueados enquanto > 0
  const activeSavesRef = useRef(0);

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

  // Limpa o cache imediatamente ao trocar de empresa para evitar dados
  // da empresa anterior aparecerem em qualquer página durante o carregamento
  useEffect(() => {
    if (cid) clearDataCache();
  }, [cid]);

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
    const cacheKey = TABLE_TO_CACHE_KEY[table];

    // Snapshot BEFORE the optimistic update (used by the async diff below).
    // Captured here — synchronously, at call time — so that each queued mutation
    // knows exactly what the cache looked like before its own items were applied,
    // even when multiple saveFn calls happen in the same event-loop turn.
    const existingSnapshot = cacheKey ? [...(getDataCache()[cacheKey] as any[])] : [];

    // Optimistically update the cache synchronously (before the mutation runs in
    // the queue). This ensures that subsequent loadXxx() calls in the same
    // event-loop turn — e.g. a second saveFinancial() in the same handler, or a
    // loadFinancial() in LocacoesPage right after saveRental() — see the fresh
    // data instead of the stale snapshot and accidentally soft-deleting entries
    // that were just added by the previous save.
    if (cacheKey) {
      setDataCache({ [cacheKey]: items } as any);
    }

    return runQueuedMutation(table, async () => {
    activeSavesRef.current++;
    try {
    if (!cid) throw new Error("No active company selected");

    const mapper = TABLE_MAP[table];
    if (!mapper) throw new Error(`Unknown table: ${table}`);

    // Use the pre-update snapshot captured at saveFn call time (not the current
    // cache, which may have been updated by later saveFn calls in the meantime).
    const existingItems = existingSnapshot;

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

    // Upsert ONLY changed (existing) rows — new rows were already inserted above.
    // No version gate here: the mutation queue already serialises saves, so every
    // save runs in order. A version gate that skips updates causes user-initiated
    // changes (e.g. pago: true) to be silently dropped when a background effect
    // (auto-materialize, reconcile) bumps the version before the DB write runs.
    for (let b = 0; b < changedRows.length; b += 100) {
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

    // Após todos os writes completarem, sincroniza o React Query cache com o
    // estado otimista. Isso evita que um refetch de realtime que disparou no
    // meio dos writes (e.g. após o INSERT mas antes do UPDATE) sobrescreva o
    // cache com dados desatualizados do banco.
    if (cacheKey) {
      const existing = qc.getQueryData<any>(queryKey);
      if (existing) qc.setQueryData(queryKey, { ...existing, [cacheKey]: items });
    }
    } finally {
      activeSavesRef.current = Math.max(0, activeSavesRef.current - 1);
    }
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
        (_payload: any) => {
          // Bloqueia refetch enquanto um save nosso está em progresso — evita
          // que um evento realtime disparado pelo INSERT da primeira operação
          // busque dados desatualizados antes que o UPDATE seguinte complete.
          if (activeSavesRef.current > 0) return;
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
