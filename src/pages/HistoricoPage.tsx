import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchActionHistory, revertAction, entityLabel,
  type ActionHistoryEntry, type EntityTable,
} from "@/lib/action-history";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  PlusCircle, PencilLine, Trash2, Upload, Undo2, RotateCcw, Search,
  CheckCircle2, History, Loader2,
} from "lucide-react";

const ACTION_META: Record<ActionHistoryEntry["action_type"], { label: string; icon: any; className: string }> = {
  create:      { label: "Criação",     icon: PlusCircle,  className: "text-success" },
  update:      { label: "Edição",      icon: PencilLine,  className: "text-primary" },
  delete:      { label: "Exclusão",    icon: Trash2,      className: "text-destructive" },
  bulk_import: { label: "Importação",  icon: Upload,      className: "text-warning" },
  revert:      { label: "Reversão",    icon: Undo2,       className: "text-muted-foreground" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function getFinancialDetails(entry: ActionHistoryEntry): string | null {
  if (entry.entity_type !== "financial_entries") return null;
  const rows = entry.snapshot_after?.length ? entry.snapshot_after : entry.snapshot_before;
  if (!rows || rows.length === 0) return null;
  const first = rows[0];
  const parts: string[] = [];
  if (first?.conta) parts.push(`Conta: ${first.conta}`);
  if (first?.data) {
    const d = new Date(first.data + "T00:00:00");
    if (!isNaN(d.getTime())) parts.push(`Data: ${d.toLocaleDateString("pt-BR")}`);
  }
  if (parts.length === 0) return null;
  return rows.length > 1 ? `${parts.join(" · ")} (+${rows.length - 1})` : parts.join(" · ");
}

export default function HistoricoPage() {
  const { user, isAdmin } = useAuth();
  const { activeCompany } = useCompany();
  const qc = useQueryClient();

  const [entries, setEntries] = useState<ActionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<string | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<ActionHistoryEntry | null>(null);

  // Filters
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const cid = activeCompany?.id;

  async function load() {
    if (!cid) return;
    setLoading(true);
    try {
      const data = await fetchActionHistory(cid, 30);
      setEntries(data);
    } catch (e: any) {
      toast.error("Erro ao carregar histórico: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cid]);

  const users = useMemo(() => {
    const set = new Map<string, string>();
    entries.forEach(e => set.set(e.user_id || "—", e.user_name || "—"));
    return Array.from(set.entries());
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterEntity !== "all" && e.entity_type !== filterEntity) return false;
      if (filterAction !== "all" && e.action_type !== filterAction) return false;
      if (filterUser !== "all" && (e.user_id || "—") !== filterUser) return false;
      if (filterStatus === "active" && e.reverted) return false;
      if (filterStatus === "reverted" && !e.reverted) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!e.description.toLowerCase().includes(s) && !e.user_name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [entries, filterEntity, filterAction, filterUser, filterStatus, search]);

  function canRevert(e: ActionHistoryEntry): boolean {
    if (e.reverted) return false;
    if (e.action_type === "revert") return false;
    return isAdmin || e.user_id === user?.id;
  }

  async function doRevert(entry: ActionHistoryEntry) {
    if (!cid) return;
    setReverting(entry.id);
    try {
      const result = await revertAction(entry, {
        companyId: cid,
        userId: user?.id || null,
        userName: user?.user_metadata?.display_name || user?.email || "—",
      });
      if (result.ok) {
        toast.success(result.message);
        // Invalidate all data so pages refresh
        await qc.invalidateQueries();
        await load();
      } else {
        toast.error(result.message);
      }
    } finally {
      setReverting(null);
      setConfirmEntry(null);
    }
  }

  const entityOptions: { value: string; label: string }[] = [
    { value: "all", label: "Todas as áreas" },
    { value: "motorcycles", label: "Motos" },
    { value: "clients", label: "Clientes" },
    { value: "rentals", label: "Locações" },
    { value: "fines", label: "Multas" },
    { value: "maintenance", label: "Manutenções" },
    { value: "financial_entries", label: "Financeiro" },
    { value: "bank_accounts", label: "Contas bancárias" },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Histórico de ações</h1>
          <p className="text-sm text-muted-foreground">
            Registro dos últimos 30 dias. Reverta ações em caso de erro.
            {!isAdmin && " Você pode reverter apenas suas próprias ações."}
          </p>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar descrição ou usuário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {entityOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="create">Criação</SelectItem>
            <SelectItem value="update">Edição</SelectItem>
            <SelectItem value="delete">Exclusão</SelectItem>
            <SelectItem value="bulk_import">Importação</SelectItem>
            <SelectItem value="revert">Reversão</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {users.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Não revertidas</SelectItem>
            <SelectItem value="reverted">Revertidas</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhuma ação encontrada para os filtros selecionados.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => {
            const meta = ACTION_META[e.action_type];
            const Icon = meta.icon;
            const allowed = canRevert(e);
            const finDetails = getFinancialDetails(e);
            return (
              <Card key={e.id} className={`p-3 flex items-start gap-3 ${e.reverted ? "opacity-60" : ""}`}>
                <div className={`rounded-md bg-muted p-2 shrink-0 ${meta.className}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{e.description}</span>
                    <Badge variant="outline" className="text-[10px]">{entityLabel(e.entity_type as EntityTable, true)}</Badge>
                    {e.entity_ids.length > 1 && (
                      <Badge variant="outline" className="text-[10px]">{e.entity_ids.length} registros</Badge>
                    )}
                    {e.reverted && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-success/40 text-success">
                        <CheckCircle2 className="h-3 w-3" /> Revertido
                      </Badge>
                    )}
                  </div>
                  {finDetails && (
                    <p className="text-xs text-muted-foreground">{finDetails}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {e.user_name} · {formatDateTime(e.created_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!allowed || reverting === e.id}
                  onClick={() => setConfirmEntry(e)}
                  className="gap-1.5 shrink-0"
                >
                  {reverting === e.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RotateCcw className="h-3.5 w-3.5" />}
                  Reverter
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmEntry} onOpenChange={(o) => !o && setConfirmEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter ação?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Esta operação <strong>não pode ser desfeita</strong>. Os dados serão alterados imediatamente:
              </span>
              {confirmEntry && (
                <span className="block bg-muted rounded p-3 text-xs space-y-1">
                  <span className="block"><strong>Ação:</strong> {ACTION_META[confirmEntry.action_type].label}</span>
                  <span className="block"><strong>Descrição:</strong> {confirmEntry.description}</span>
                  <span className="block"><strong>Registros afetados:</strong> {confirmEntry.entity_ids.length}</span>
                  <span className="block text-muted-foreground mt-2">
                    {confirmEntry.action_type === "create" || confirmEntry.action_type === "bulk_import"
                      ? "Os registros criados serão excluídos permanentemente."
                      : confirmEntry.action_type === "update"
                      ? "Os valores anteriores serão restaurados."
                      : confirmEntry.action_type === "delete"
                      ? "Os registros excluídos serão recriados."
                      : ""}
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmEntry && doRevert(confirmEntry)}>
              Confirmar reversão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}