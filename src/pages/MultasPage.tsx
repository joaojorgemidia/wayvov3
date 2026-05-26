import { useState, useMemo, useEffect, useCallback } from "react";
import { Fine, Motorcycle, Client, Rental } from "@/lib/types";
import { saveFines } from "@/lib/store";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, AlertTriangle, Pencil, Trash2, RefreshCw, Car, Loader2, CheckCircle2, XCircle, Info, Settings } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

const statusLabel: Record<string, string> = { pendente: "Pendente", paga: "Paga", contestada: "Contestada", transferida: "Transferida" };
const statusColor: Record<string, string> = { pendente: "bg-warning/10 text-warning", paga: "bg-success/10 text-success", contestada: "bg-primary/10 text-primary", transferida: "bg-muted text-muted-foreground" };

const emptyFine = (): Fine => ({
  id: crypto.randomUUID(), motoId: "", clienteId: null, rentalId: null,
  dataMulta: new Date().toISOString().split("T")[0], dataNotificacao: null,
  valor: 0, descricao: "", status: "pendente", responsavel: "cliente",
  origem: "manual", autoInfracao: null, codigoInfracao: null,
});

// ─── InfoSimples normalizer ────────────────────────────────────────────────────
// O DETRAN-GO retorna datas em DD/MM/YYYY — converte para YYYY-MM-DD
function parseDetranDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

interface DetranDebit {
  tipo: "MULTA" | "IPVA" | "DPVAT" | "LICENCIAMENTO" | string;
  dataInfracao: string | null;
  vencimento: string | null;
  valor: number;
  descricao: string;
  situacao: string;
  autoInfracao: string | null;
  codigoInfracao: string | null;
  raw: Record<string, unknown>;
}

function normalizeDebit(item: Record<string, unknown>): DetranDebit {
  // InfoSimples pode usar tipo_debito ou tipo
  const tipo = String(item.tipo_debito ?? item.tipo ?? "OUTRO").toUpperCase();
  const valorRaw = item.valor ?? item.valor_total ?? 0;
  return {
    tipo,
    dataInfracao: parseDetranDate(String(item.data_infracao ?? item.data ?? "")),
    vencimento: parseDetranDate(String(item.vencimento ?? item.data_vencimento ?? "")),
    valor: Number(valorRaw) || 0,
    descricao: String(
      item.descricao ?? item.descricao_infracao ?? item.infracao ?? item.descricao_debito ?? tipo
    ),
    situacao: String(item.situacao ?? item.status ?? "PENDENTE").toUpperCase(),
    autoInfracao: item.auto_infracao ? String(item.auto_infracao) : null,
    codigoInfracao: item.codigo_infracao ? String(item.codigo_infracao) : null,
    raw: item,
  };
}

// ─── Rental matcher ────────────────────────────────────────────────────────────
function findRentalAtDate(
  motoId: string,
  dateIso: string | null,
  rentals: Rental[],
): Rental | null {
  if (!dateIso) return null;
  const ts = new Date(dateIso).getTime();
  return rentals.find((r) => {
    if (r.motoId !== motoId) return false;
    const inicio = new Date(r.dataInicio).getTime();
    const fim = r.dataFim ? new Date(r.dataFim).getTime() : Date.now();
    return ts >= inicio && ts <= fim;
  }) ?? null;
}

// ─── Types for DETRAN results ──────────────────────────────────────────────────
interface MotoResult {
  motoId: string;
  placa: string;
  data: DetranDebit[];
  error: string | null;
  loading: boolean;
}

interface SelectableDebit extends DetranDebit {
  _key: string;
  motoId: string;
  placa: string;
  suggestedRental: Rental | null;
  suggestedClient: Client | null;
  alreadyImported: boolean;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function MultasPage() {
  const cache = useDataCacheSnapshot();
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [fines, setFines] = useState<Fine[]>([]);
  const motos = cache.motos;
  const clients = cache.clients;
  const rentals = cache.rentals as Rental[];
  useEffect(() => { setFines(cache.fines); }, [cache.fines]);

  const detranConfigurado = !!activeCompany?.detranConfig?.login;

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Fine>(emptyFine());
  const [mode, setMode] = useState<"add" | "edit">("add");

  // DETRAN sheet state
  const [detranOpen, setDetranOpen] = useState(false);
  const [selectedMotoIds, setSelectedMotoIds] = useState<Set<string>>(new Set());
  const [motoResults, setMotoResults] = useState<MotoResult[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const { canCreate, canEdit, canDelete } = usePermissions();
  const persist = (d: Fine[]) => { setFines(d); saveFines(d); };
  const getMotoPlaca = (id: string) => motos.find(m => m.id === id)?.placa || "—";
  const getClientName = (id: string | null) => id ? (clients.find(c => c.id === id)?.nome || "—") : "—";

  const filtered = useMemo(() => fines.filter(f =>
    getMotoPlaca(f.motoId).toLowerCase().includes(search.toLowerCase()) ||
    f.descricao.toLowerCase().includes(search.toLowerCase())
  ), [fines, search, motos]);

  const handleSave = () => {
    if (!form.motoId) return;
    const exists = fines.find(f => f.id === form.id);
    if (exists) persist(fines.map(f => f.id === form.id ? form : f));
    else persist([...fines, form]);
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Remover esta multa?")) persist(fines.filter(f => f.id !== id));
  };

  const totalPendente = fines.filter(f => f.status === "pendente").reduce((s, f) => s + f.valor, 0);

  // ─── DETRAN logic ────────────────────────────────────────────────────────────

  const frotaAtiva = useMemo(
    () => motos.filter(m => m.status !== "vendida" && m.status !== "inativa"),
    [motos],
  );

  const openDetran = () => {
    setDetranOpen(true);
    setSelectedMotoIds(new Set(frotaAtiva.map(m => m.id)));
    setMotoResults([]);
    setHasQueried(false);
    setSelected(new Set());
  };

  const toggleMoto = (id: string) => {
    setSelectedMotoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConsultar = useCallback(async () => {
    const ids = [...selectedMotoIds];
    if (ids.length === 0) { toast.warning("Selecione ao menos uma moto."); return; }

    setMotoResults(ids.map(id => ({
      motoId: id,
      placa: motos.find(m => m.id === id)?.placa ?? id,
      data: [], error: null, loading: true,
    })));
    setHasQueried(true);
    setSelected(new Set());

    const { data, error } = await supabase.functions.invoke("detran-go-debitos", {
      body: { motoIds: ids, companyId: activeCompany?.id },
    });

    if (error) {
      toast.error("Falha ao consultar DETRAN: " + error.message);
      setMotoResults(prev => prev.map(r => ({ ...r, loading: false, error: error.message })));
      return;
    }

    const results: Array<{ motoId: string; placa: string; data: Record<string, unknown>[]; error: string | null }> =
      data?.results ?? [];

    setMotoResults(results.map(r => ({
      motoId: r.motoId,
      placa: r.placa,
      loading: false,
      error: r.error,
      data: (r.data ?? []).map(normalizeDebit),
    })));
  }, [selectedMotoIds, motos]);

  // Flatten all debits into selectable rows with rental suggestions
  const allDebits = useMemo<SelectableDebit[]>(() => {
    const existingKeys = new Set(
      fines
        .filter(f => f.autoInfracao)
        .map(f => f.autoInfracao!),
    );
    return motoResults.flatMap(mr =>
      mr.data.map((d, i) => {
        const key = `${mr.motoId}::${d.autoInfracao || d.dataInfracao || i}`;
        const rental = d.tipo === "MULTA" ? findRentalAtDate(mr.motoId, d.dataInfracao, rentals) : null;
        const client = rental ? clients.find(c => c.id === rental.clienteId) ?? null : null;
        return {
          ...d,
          _key: key,
          motoId: mr.motoId,
          placa: mr.placa,
          suggestedRental: rental,
          suggestedClient: client,
          alreadyImported: d.autoInfracao ? existingKeys.has(d.autoInfracao) : false,
        };
      }),
    );
  }, [motoResults, fines, rentals, clients]);

  const multas = useMemo(() => allDebits.filter(d => d.tipo === "MULTA"), [allDebits]);
  const taxas = useMemo(() => allDebits.filter(d => d.tipo !== "MULTA"), [allDebits]);

  const toggleDebit = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllMultas = () => {
    setSelected(prev => {
      const next = new Set(prev);
      multas.filter(d => !d.alreadyImported).forEach(d => next.add(d._key));
      return next;
    });
  };

  const handleImport = async () => {
    const toImport = allDebits.filter(d => selected.has(d._key) && !d.alreadyImported);
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const newFines: Fine[] = toImport.map(d => ({
        id: crypto.randomUUID(),
        motoId: d.motoId,
        clienteId: d.suggestedClient?.id ?? null,
        rentalId: d.suggestedRental?.id ?? null,
        dataMulta: d.dataInfracao ?? d.vencimento ?? today,
        dataNotificacao: null,
        valor: d.valor,
        descricao: d.descricao,
        status: "pendente" as const,
        responsavel: (d.tipo === "MULTA" && d.suggestedClient ? "cliente" : "locadora") as "locadora" | "cliente",
        origem: "detran" as const,
        autoInfracao: d.autoInfracao,
        codigoInfracao: d.codigoInfracao,
      }));

      persist([...fines, ...newFines]);
      toast.success(`${newFines.length} item(ns) importado(s) com sucesso.`);
      setDetranOpen(false);
    } finally {
      setImporting(false);
    }
  };

  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Multas</h2>
          <p className="text-sm text-muted-foreground">{fines.length} multas · R$ {totalPendente.toFixed(2)} pendente</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <Button variant="outline" onClick={openDetran} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Consultar DETRAN
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => { setForm(emptyFine()); setMode("add"); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Multa
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar placa ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma multa registrada</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Moto</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Cliente</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Data</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Valor</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Responsável</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-3 text-right font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 font-mono font-bold">
                      {getMotoPlaca(f.motoId)}
                      {f.origem === "detran" && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">DETRAN</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">{getClientName(f.clienteId)}</td>
                    <td className="px-3 py-3">{new Date(f.dataMulta + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-3 font-semibold">R$ {f.valor.toFixed(2)}</td>
                    <td className="px-3 py-3 text-muted-foreground max-w-[200px] truncate">{f.descricao || "—"}</td>
                    <td className="px-3 py-3">
                      <Badge variant={f.responsavel === "cliente" ? "default" : "secondary"}>
                        {f.responsavel === "cliente" ? "Cliente" : "Locadora"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[f.status]}`}>{statusLabel[f.status]}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => { setForm({ ...f }); setMode("edit"); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                        {canDelete && <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Formulário manual ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Nova Multa" : "Editar Multa"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Moto</Label>
                <SearchableSelect
                  options={motos.map(m => ({ value: m.id, label: m.placa }))}
                  value={form.motoId}
                  onValueChange={v => setForm({ ...form, motoId: v })}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar placa..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Cliente (opcional)</Label>
                <SearchableSelect
                  options={[{ value: "none", label: "Nenhum" }, ...clients.map(c => ({ value: c.id, label: c.nome }))]}
                  value={form.clienteId || "none"}
                  onValueChange={v => setForm({ ...form, clienteId: v === "none" ? null : v })}
                  placeholder="Nenhum"
                  searchPlaceholder="Buscar cliente..."
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Data da Multa</Label>
                <Input type="date" value={form.dataMulta} onChange={e => setForm({ ...form, dataMulta: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Responsável</Label>
                <SearchableSelect
                  options={[{ value: "cliente", label: "Cliente" }, { value: "locadora", label: "Locadora" }]}
                  value={form.responsavel}
                  onValueChange={v => setForm({ ...form, responsavel: v as "locadora" | "cliente" })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Status</Label>
                <SearchableSelect
                  options={Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v }))}
                  value={form.status}
                  onValueChange={v => setForm({ ...form, status: v as any })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Data Notificação</Label>
                <Input type="date" value={form.dataNotificacao || ""} onChange={e => setForm({ ...form, dataNotificacao: e.target.value || null })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Avanço de sinal, velocidade..." />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Sheet DETRAN ─────────────────────────────────────────────────────── */}
      <Sheet open={detranOpen} onOpenChange={setDetranOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" /> Consultar DETRAN-GO
            </SheetTitle>
            <p className="text-sm text-muted-foreground">Busca multas e débitos diretamente no portal do DETRAN-GO via InfoSimples.</p>
          </SheetHeader>

          {/* Banner: DETRAN não configurado */}
          {!detranConfigurado && (
            <div className="mx-6 mt-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                  Credenciais do DETRAN-GO não configuradas
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Para consultar multas e débitos, informe o login e senha do portal DETRAN-GO nas configurações da locadora.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-yellow-400 text-yellow-800 hover:bg-yellow-100 dark:border-yellow-700 dark:text-yellow-300"
                  onClick={() => { setDetranOpen(false); navigate("/configuracoes"); }}
                >
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Ir para Configurações
                </Button>
              </div>
            </div>
          )}

          {/* Seleção de motos */}
          <div className="px-6 py-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Motos a consultar</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedMotoIds(new Set(frotaAtiva.map(m => m.id)))}>
                  Todas
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedMotoIds(new Set())}>
                  Nenhuma
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {frotaAtiva.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMoto(m.id)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border transition-colors ${
                    selectedMotoIds.has(m.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-muted-foreground/30"
                  }`}
                >
                  {m.placa}
                </button>
              ))}
            </div>
            <Button
              onClick={handleConsultar}
              disabled={!detranConfigurado || selectedMotoIds.size === 0 || motoResults.some(r => r.loading)}
              className="gap-2"
            >
              {motoResults.some(r => r.loading) ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Consultando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Consultar {selectedMotoIds.size > 0 ? `(${selectedMotoIds.size})` : ""}</>
              )}
            </Button>
          </div>

          {/* Status por moto */}
          {hasQueried && motoResults.length > 0 && (
            <div className="px-6 py-3 border-b flex flex-wrap gap-2">
              {motoResults.map(r => (
                <span
                  key={r.motoId}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono ${
                    r.loading
                      ? "border-muted-foreground/30 text-muted-foreground"
                      : r.error
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-success/30 bg-success/10 text-success"
                  }`}
                >
                  {r.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : r.error ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {r.placa} {!r.loading && !r.error && `(${r.data.length})`}
                </span>
              ))}
            </div>
          )}

          {/* Resultados */}
          <div className="flex-1 px-6 py-4 space-y-6 overflow-y-auto">
            {!hasQueried && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                <RefreshCw className="h-10 w-10 opacity-30" />
                <p className="text-sm">Selecione as motos e clique em <strong>Consultar</strong> para buscar os débitos no DETRAN-GO.</p>
              </div>
            )}

            {/* Multas de trânsito */}
            {multas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Multas de trânsito ({multas.length})</h3>
                  <Button variant="ghost" size="sm" onClick={selectAllMultas} className="text-xs h-7">
                    Selecionar todas
                  </Button>
                </div>
                <div className="space-y-2">
                  {multas.map(d => (
                    <DetranDebitCard
                      key={d._key}
                      debit={d}
                      checked={selected.has(d._key)}
                      onToggle={() => toggleDebit(d._key)}
                      fmt={fmt}
                      fmtDate={fmtDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* IPVA / taxas */}
            {taxas.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">IPVA / Taxas ({taxas.length})</h3>
                <div className="space-y-2">
                  {taxas.map(d => (
                    <DetranDebitCard
                      key={d._key}
                      debit={d}
                      checked={selected.has(d._key)}
                      onToggle={() => toggleDebit(d._key)}
                      fmt={fmt}
                      fmtDate={fmtDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Erros por moto */}
            {motoResults.filter(r => r.error).map(r => (
              <div key={r.motoId} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>{r.placa}:</strong> {r.error}</span>
              </div>
            ))}

            {hasQueried && !motoResults.some(r => r.loading) && allDebits.length === 0 && motoResults.every(r => !r.error) && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
                <CheckCircle2 className="h-8 w-8 text-success opacity-60" />
                <p className="text-sm">Nenhum débito pendente encontrado.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {selected.size > 0 && (
            <div className="px-6 py-4 border-t flex items-center justify-between bg-background">
              <span className="text-sm text-muted-foreground">
                {selected.size} item(ns) selecionado(s)
              </span>
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Importar selecionados
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Subcomponente de card de débito ──────────────────────────────────────────
function DetranDebitCard({
  debit, checked, onToggle, fmt, fmtDate,
}: {
  debit: SelectableDebit;
  checked: boolean;
  onToggle: () => void;
  fmt: (v: number) => string;
  fmtDate: (iso: string | null) => string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
        debit.alreadyImported
          ? "opacity-50 bg-muted/30 cursor-default"
          : checked
          ? "border-primary/40 bg-primary/5 cursor-pointer"
          : "hover:bg-muted/30 cursor-pointer"
      }`}
      onClick={() => !debit.alreadyImported && onToggle()}
    >
      <Checkbox
        checked={checked}
        disabled={debit.alreadyImported}
        onCheckedChange={() => !debit.alreadyImported && onToggle()}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-sm">{debit.placa}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{debit.tipo}</Badge>
          {debit.situacao === "PAGO" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pago</Badge>
          )}
          {debit.alreadyImported && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Já importado</Badge>
          )}
          <span className="font-semibold text-sm ml-auto">{fmt(debit.valor)}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{debit.descricao}</p>
        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
          {debit.dataInfracao && <span>Infração: {fmtDate(debit.dataInfracao)}</span>}
          {debit.vencimento && <span>Vencimento: {fmtDate(debit.vencimento)}</span>}
          {debit.codigoInfracao && <span>Cód: {debit.codigoInfracao}</span>}
        </div>
        {debit.suggestedClient && (
          <div className="flex items-center gap-1 text-xs text-primary font-medium">
            <Info className="h-3 w-3" />
            Locatário na época: <strong>{debit.suggestedClient.nome}</strong>
            {" — "}será atribuída como responsável
          </div>
        )}
      </div>
    </div>
  );
}
