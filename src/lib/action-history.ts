import { supabase } from "@/integrations/supabase/client";
import { TABLE_MAP } from "./db-mappers";

const db = supabase as any;

export type ActionType = "create" | "update" | "delete" | "bulk_import" | "revert";
export type EntityTable =
  | "motorcycles"
  | "clients"
  | "rentals"
  | "fines"
  | "maintenance"
  | "financial_entries"
  | "bank_accounts";

const ENTITY_LABELS: Record<EntityTable, { singular: string; plural: string }> = {
  motorcycles: { singular: "moto", plural: "motos" },
  clients: { singular: "cliente", plural: "clientes" },
  rentals: { singular: "locação", plural: "locações" },
  fines: { singular: "multa", plural: "multas" },
  maintenance: { singular: "manutenção", plural: "manutenções" },
  financial_entries: { singular: "transação financeira", plural: "transações financeiras" },
  bank_accounts: { singular: "conta bancária", plural: "contas bancárias" },
};

export function entityLabel(table: EntityTable, plural = false): string {
  return plural ? ENTITY_LABELS[table].plural : ENTITY_LABELS[table].singular;
}

function describeRecord(table: EntityTable, row: any): string {
  if (!row) return "";
  switch (table) {
    case "motorcycles": return row.placa || row.modelo || row.id?.slice(0, 8) || "";
    case "clients": return row.nome || row.cpf || row.id?.slice(0, 8) || "";
    case "rentals": return `locação #${row.numero || row.id?.slice(0, 8) || ""}`;
    case "fines": return `multa ${row.descricao || ""}`.trim();
    case "maintenance": return `manutenção ${row.tipo || ""}`.trim();
    case "financial_entries": return `${row.descricao || ""} (R$ ${Number(row.valor || 0).toFixed(2)})`;
    case "bank_accounts": return row.nome || row.banco || "";
    default: return "";
  }
}

export interface ActionHistoryEntry {
  id: string;
  company_id: string;
  user_id: string | null;
  user_name: string;
  action_type: ActionType;
  entity_type: EntityTable;
  entity_ids: string[];
  description: string;
  snapshot_before: any[];
  snapshot_after: any[];
  reverted: boolean;
  reverted_at: string | null;
  reverted_by: string | null;
  reverts_action_id: string | null;
  created_at: string;
}

interface RecordActionParams {
  companyId: string;
  userId: string | null;
  userName: string;
  actionType: ActionType;
  entityType: EntityTable;
  snapshotBefore: any[];
  snapshotAfter: any[];
  description?: string;
  revertsActionId?: string | null;
}

function buildDescription(p: RecordActionParams): string {
  if (p.description) return p.description;
  const label = ENTITY_LABELS[p.entityType];
  switch (p.actionType) {
    case "create": {
      const n = p.snapshotAfter.length;
      if (n === 1) return `Criou ${label.singular} ${describeRecord(p.entityType, p.snapshotAfter[0])}`.trim();
      return `Criou ${n} ${label.plural}`;
    }
    case "update": {
      const n = p.snapshotAfter.length;
      if (n === 1) return `Editou ${label.singular} ${describeRecord(p.entityType, p.snapshotAfter[0])}`.trim();
      return `Editou ${n} ${label.plural}`;
    }
    case "delete": {
      const n = p.snapshotBefore.length;
      if (n === 1) return `Excluiu ${label.singular} ${describeRecord(p.entityType, p.snapshotBefore[0])}`.trim();
      return `Excluiu ${n} ${label.plural}`;
    }
    case "bulk_import": {
      const n = p.snapshotAfter.length;
      return `Importou ${n} ${label.plural}`;
    }
    case "revert":
      return `Reverteu ação anterior em ${label.plural}`;
  }
}

export async function recordAction(p: RecordActionParams): Promise<string | null> {
  // Skip empty no-ops
  if (p.snapshotBefore.length === 0 && p.snapshotAfter.length === 0) return null;

  const ids = new Set<string>();
  p.snapshotBefore.forEach(r => r?.id && ids.add(r.id));
  p.snapshotAfter.forEach(r => r?.id && ids.add(r.id));

  const description = buildDescription(p);

  try {
    const { data, error } = await db.from("action_history").insert({
      company_id: p.companyId,
      user_id: p.userId,
      user_name: p.userName || "—",
      action_type: p.actionType,
      entity_type: p.entityType,
      entity_ids: Array.from(ids),
      description,
      snapshot_before: p.snapshotBefore,
      snapshot_after: p.snapshotAfter,
      reverts_action_id: p.revertsActionId || null,
    }).select("id").single();
    if (error) {
      console.warn("[action-history] insert failed", error.message);
      return null;
    }
    return data?.id || null;
  } catch (e: any) {
    console.warn("[action-history] insert exception", e.message);
    return null;
  }
}

/**
 * Reverts an action by reversing its effect:
 * - create / bulk_import → DELETE the affected ids
 * - update              → restore snapshot_before via UPSERT
 * - delete              → re-INSERT snapshot_before
 * - revert              → not revertable
 */
export async function revertAction(
  entry: ActionHistoryEntry,
  ctx: { companyId: string; userId: string | null; userName: string },
): Promise<{ ok: boolean; message: string }> {
  if (entry.reverted) return { ok: false, message: "Esta ação já foi revertida." };
  if (entry.action_type === "revert") return { ok: false, message: "Reversões não podem ser desfeitas." };

  const table = entry.entity_type;
  const mapper = TABLE_MAP[table];
  if (!mapper) return { ok: false, message: `Tipo desconhecido: ${table}` };

  try {
    if (entry.action_type === "create" || entry.action_type === "bulk_import") {
      // Hard-delete only ids that still belong to this company AND match the snapshot
      const ids = entry.entity_ids;
      if (ids.length > 0) {
        for (let b = 0; b < ids.length; b += 100) {
          const batch = ids.slice(b, b + 100);
          const { error } = await db.from(table).delete().in("id", batch).eq("company_id", entry.company_id);
          if (error) throw error;
        }
      }
    } else if (entry.action_type === "update") {
      // Restore previous values
      const rows = entry.snapshot_before.map((item: any) => ({
        ...mapper.toDb(item),
        id: item.id,
        company_id: entry.company_id,
        deleted_at: null,
      }));
      for (let b = 0; b < rows.length; b += 100) {
        const batch = rows.slice(b, b + 100);
        const { error } = await db.from(table).upsert(batch, { onConflict: "id" });
        if (error) throw error;
      }
    } else if (entry.action_type === "delete") {
      // Re-create
      const rows = entry.snapshot_before.map((item: any) => ({
        ...mapper.toDb(item),
        id: item.id,
        company_id: entry.company_id,
        deleted_at: null,
      }));
      for (let b = 0; b < rows.length; b += 100) {
        const batch = rows.slice(b, b + 100);
        const { error } = await db.from(table).upsert(batch, { onConflict: "id" });
        if (error) throw error;
      }
    }

    // Mark original as reverted
    await db.from("action_history").update({
      reverted: true,
      reverted_at: new Date().toISOString(),
      reverted_by: ctx.userId,
    }).eq("id", entry.id);

    // Record the revert as its own audit entry
    await recordAction({
      companyId: ctx.companyId,
      userId: ctx.userId,
      userName: ctx.userName,
      actionType: "revert",
      entityType: table,
      snapshotBefore: entry.snapshot_after,
      snapshotAfter: entry.snapshot_before,
      description: `Reverteu: ${entry.description}`,
      revertsActionId: entry.id,
    });

    return { ok: true, message: "Ação revertida com sucesso." };
  } catch (e: any) {
    return { ok: false, message: `Falha ao reverter: ${e.message || e}` };
  }
}

export async function fetchActionHistory(companyId: string, days = 30): Promise<ActionHistoryEntry[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("action_history")
    .select("*")
    .eq("company_id", companyId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as ActionHistoryEntry[];
}