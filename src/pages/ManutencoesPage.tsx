import React, { useState, useMemo } from "react";
import { addDays, format } from "date-fns";
import { Maintenance, MaintenanceItem, Motorcycle, FinancialEntry, Rental, Client } from "@/lib/types";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { useMaintenance, useBankAccounts, useMotos } from "@/hooks/useSupabaseData";
import { saveFinancial as storeFinancialAll, loadFinancial, loadMaintenanceConfig, type MaintenanceConfig } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Plus, Search, Wrench, Pencil, Trash2, ClipboardList, X,
  Package, Hammer, ChevronRight, CalendarDays, Building2, Gauge,
  CheckCircle2, Clock, AlertCircle, MoreVertical, SlidersHorizontal,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// ─── Constantes ──────────────────────────────────────────────────

function getTipoLabel(tipo: string): string {
  // fallback para valores legados do banco
  const LEGACY: Record<string, string> = {
    troca_oleo: "Troca de Óleo", revisao: "Revisão", reparo: "Reparo",
    vistoria: "Vistoria", outro: "Outro",
  };
  return LEGACY[tipo] || tipo;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  agendada: { label: "Agendada", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: <Clock className="h-3 w-3" /> },
  em_andamento: { label: "Em Andamento", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <Wrench className="h-3 w-3" /> },
  concluida: { label: "Concluída", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: <CheckCircle2 className="h-3 w-3" /> },
};

const NATUREZA_CONFIG: Record<string, { label: string; color: string }> = {
  corretiva: { label: "Corretiva", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  preventiva: { label: "Preventiva", color: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
};

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : null;

// ─── Helpers ─────────────────────────────────────────────────────

function generateOSNumber(existing: Maintenance[]): string {
  const max = existing.reduce((m, item) => {
    const n = parseInt(item.numeroOS?.replace(/\D/g, "") || "0", 10);
    return Math.max(m, n);
  }, 0);
  return `MVL-${String(max + 1).padStart(4, "0")}`;
}

function computeCusto(itens: MaintenanceItem[]): number {
  return itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
}

function emptyItem(): MaintenanceItem {
  return { id: crypto.randomUUID(), classificacao: "Reparo", tipo: "servico", descricao: "", quantidade: 1, valorUnitario: 0 };
}

function emptyForm(): Maintenance {
  return {
    id: crypto.randomUUID(),
    motoId: "",
    numeroOS: null,
    tipo: "Reparo",
    natureza: "corretiva",
    data: new Date().toISOString().split("T")[0],
    dataFim: null,
    km: null,
    custo: 0,
    descricao: "",
    fornecedor: "",
    oficina: "",
    conta: "",
    dataPagamentoPrevisto: null,
    pagamentoRealizado: false,
    quemPaga: "locadora",
    valorLocatario: null,
    cobrarParcelado: false,
    entradaLocatario: null,
    numeroParcelas: null,
    status: "agendada",
    itens: [],
  };
}

function findRentalAtDate(rentals: Rental[], motoId: string, date: string): Rental | undefined {
  return rentals.find(
    (r) =>
      r.motoId === motoId &&
      r.dataInicio <= date &&
      (r.dataFim === null || r.dataFim >= date),
  );
}

function buildReceitaLocatarioEntries(os: Maintenance, motos: Motorcycle[], rentals: Rental[]): FinancialEntry[] {
  const moto = motos.find((m) => m.id === os.motoId);
  const rental = findRentalAtDate(rentals, os.motoId, os.data);
  if (!rental) return [];

  const valor = (os.valorLocatario != null && os.valorLocatario > 0) ? os.valorLocatario : (os.itens.length > 0 ? computeCusto(os.itens) : os.custo);
  const baseData = os.dataFim || new Date().toISOString().split("T")[0];
  const descBase = [
    os.numeroOS,
    getTipoLabel(os.tipo),
    os.natureza === "preventiva" ? "Preventiva" : "Corretiva",
    os.descricao || undefined,
  ].filter(Boolean).join(" – ");

  const base: Omit<FinancialEntry, "id" | "descricao" | "valor" | "data" | "dataPrevista"> = {
    tipo: "receita",
    categoria: "manutencao_receita",
    subcategoria: os.natureza === "preventiva" ? "Preventiva" : "Corretiva",
    motoId: os.motoId,
    rentalId: rental.id,
    clienteId: rental.clienteId,
    pago: false,
    conta: os.conta,
    natureza: "operacional",
    placa: moto?.placa,
    tags: ["OS", ...(os.numeroOS ? [os.numeroOS] : [])],
    fixedOriginId: os.id,
  };

  if (!os.cobrarParcelado) {
    return [{
      ...base,
      id: crypto.randomUUID(),
      descricao: descBase,
      valor,
      data: baseData,
      dataPrevista: baseData,
    }];
  }

  const entrada = os.entradaLocatario ?? 0;
  const nParcelas = os.numeroParcelas ?? 0;
  const totalParcelas = nParcelas > 0 ? nParcelas : 0;
  const valorParcela = totalParcelas > 0 ? parseFloat(((valor - entrada) / totalParcelas).toFixed(2)) : 0;

  const entries: FinancialEntry[] = [];

  if (entrada > 0) {
    entries.push({
      ...base,
      id: crypto.randomUUID(),
      descricao: `${descBase} – Entrada`,
      valor: entrada,
      data: baseData,
      dataPrevista: baseData,
    });
  }

  for (let i = 0; i < totalParcelas; i++) {
    const data = format(addDays(new Date(baseData + "T00:00:00"), (i + 1) * 7), "yyyy-MM-dd");
    entries.push({
      ...base,
      id: crypto.randomUUID(),
      descricao: `${descBase} – Parcela ${i + 1}/${totalParcelas}`,
      valor: valorParcela,
      data,
      dataPrevista: data,
    });
  }

  return entries;
}

function buildFinancialEntry(os: Maintenance, motos: Motorcycle[], rentals: Rental[]): FinancialEntry {
  const moto = motos.find((m) => m.id === os.motoId);
  const rental = findRentalAtDate(rentals, os.motoId, os.data);
  const custo = os.itens.length > 0 ? computeCusto(os.itens) : os.custo;
  const data = os.dataFim || os.data;
  const dataPrevista = os.dataPagamentoPrevisto || data;
  return {
    id: crypto.randomUUID(),
    tipo: "despesa",
    categoria: "manutencao_despesa",
    subcategoria: os.natureza === "preventiva" ? "Preventiva" : "Corretiva",
    descricao: `${os.numeroOS ? os.numeroOS + " – " : ""}${os.oficina || "Manutenção"}`,
    valor: custo,
    data: dataPrevista,
    dataPrevista,
    motoId: os.motoId,
    rentalId: rental?.id ?? null,
    clienteId: rental?.clienteId ?? null,
    pago: os.pagamentoRealizado ?? false,
    conta: os.conta,
    natureza: "operacional",
    placa: moto?.placa,
    observacao: [
      os.itens.map((i) => `${i.descricao}${i.quantidade > 1 ? ` (${i.quantidade}x)` : ""}`).filter(Boolean).join(", "),
      os.descricao,
    ].filter(Boolean).join(" — ") || undefined,
    tags: ["OS", ...(os.numeroOS ? [os.numeroOS] : [])],
    fixedOriginId: os.id,
  };
}

// ─── Componente principal ─────────────────────────────────────────

export default function ManutencoesPage() {
  const cache = useDataCacheSnapshot();
  const { data: items, save, remove } = useMaintenance();
  const { save: saveMoto } = useMotos();
  const { data: bankAccounts } = useBankAccounts();
  const motos: Motorcycle[] = cache.motos;
  const rentals: Rental[] = cache.rentals;
  const clients: Client[] = (cache as any).clients ?? [];
  const { canCreate, canEdit, canDelete } = usePermissions();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterNatureza, setFilterNatureza] = useState<string>("todos");
  const [filterDataDe, setFilterDataDe] = useState("");
  const [filterDataAte, setFilterDataAte] = useState("");
  const [filterPlaca, setFilterPlaca] = useState("todos");
  const [filterLocatario, setFilterLocatario] = useState("todos");
  const [filterPagamento, setFilterPagamento] = useState<"todos" | "pago" | "pendente">("todos");
  const [filterQuemPaga, setFilterQuemPaga] = useState<"todos" | "locadora" | "locatario">("todos");

  const [maintConfig, setMaintConfig] = useState<MaintenanceConfig>(loadMaintenanceConfig);

  const [detailOS, setDetailOS] = useState<Maintenance | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Maintenance>(emptyForm());
  const [valorLocatarioTipo, setValorLocatarioTipo] = useState<"reais" | "percentual">("reais");
  const [valorLocatarioPercent, setValorLocatarioPercent] = useState<string>("");

  const getMoto = (id: string) => motos.find((m) => m.id === id);
  const getMotoLabel = (id: string) => {
    const m = getMoto(id);
    return m ? `${m.placa}${m.modelo ? ` · ${m.modelo}` : ""}` : "—";
  };

  // Filtro
  const filtered = useMemo(() => {
    return (items || []).filter((m) => {
      const moto = getMoto(m.motoId);
      const text = search.toLowerCase();
      const matchText =
        !text ||
        (moto?.placa || "").toLowerCase().includes(text) ||
        m.oficina.toLowerCase().includes(text) ||
        m.descricao.toLowerCase().includes(text) ||
        (m.numeroOS || "").toLowerCase().includes(text);
      const matchStatus = filterStatus === "todos" || m.status === filterStatus;
      const matchNatureza = filterNatureza === "todos" || m.natureza === filterNatureza;
      const matchDataDe = !filterDataDe || m.data >= filterDataDe;
      const matchDataAte = !filterDataAte || m.data <= filterDataAte;
      const matchPlaca = filterPlaca === "todos" || m.motoId === filterPlaca;
      const rental = filterLocatario !== "todos" ? findRentalAtDate(rentals, m.motoId, m.data) : null;
      const matchLocatario = filterLocatario === "todos" || rental?.clienteId === filterLocatario;
      const matchPagamento =
        filterPagamento === "todos" ||
        (filterPagamento === "pago" && m.pagamentoRealizado) ||
        (filterPagamento === "pendente" && !m.pagamentoRealizado);
      const matchQuemPaga = filterQuemPaga === "todos" || m.quemPaga === filterQuemPaga;
      return matchText && matchStatus && matchNatureza && matchDataDe && matchDataAte && matchPlaca && matchLocatario && matchPagamento && matchQuemPaga;
    });
  }, [items, search, filterStatus, filterNatureza, filterDataDe, filterDataAte, filterPlaca, filterLocatario, filterPagamento, filterQuemPaga, motos, rentals]);

  // Métricas
  const totalCusto = useMemo(
    () => (items || []).reduce((s, m) => s + (m.itens.length > 0 ? computeCusto(m.itens) : m.custo), 0),
    [items],
  );
  const emAndamento = useMemo(() => (items || []).filter((m) => m.status === "em_andamento").length, [items]);
  const concluidas = useMemo(() => (items || []).filter((m) => m.status === "concluida").length, [items]);

  // ─── Handlers ────────────────────────────────────────────────

  const openNew = () => {
    setForm({ ...emptyForm(), numeroOS: generateOSNumber(items || []) });
    setValorLocatarioTipo("reais");
    setValorLocatarioPercent("");
    setFormOpen(true);
  };

  const openEdit = (os: Maintenance) => {
    setForm({ ...os });
    setValorLocatarioTipo("reais");
    setValorLocatarioPercent("");
    setDetailOS(null);
    setFormOpen(true);
  };

  const syncFinancial = async (os: Maintenance) => {
    const custo = os.itens.length > 0 ? computeCusto(os.itens) : os.custo;

    // Leitura única — evita condição de corrida entre múltiplas gravações
    const all = loadFinancial();
    const linkedDespesa = all.find((e) => e.fixedOriginId === os.id && e.categoria === "manutencao_despesa");
    const linkedReceitas = all.filter((e) => e.fixedOriginId === os.id && e.categoria === "manutencao_receita");

    // Remove todas as entradas vinculadas a esta OS
    let next = all.filter((e) => e.fixedOriginId !== os.id);

    if (os.status === "concluida" && custo > 0 && os.conta) {
      // Despesa da oficina — preserva ID existente
      next.push({
        ...buildFinancialEntry(os, motos, rentals),
        id: linkedDespesa?.id || crypto.randomUUID(),
      });

      // Receitas do locatário
      if (os.quemPaga === "locatario") {
        const novas = buildReceitaLocatarioEntries(os, motos, rentals);

        if (linkedReceitas.length === 0) {
          // Primeira sincronização: cria todas as entradas
          novas.forEach(n => next.push(n));
        } else {
          // Re-sincronização: preserva exclusões manuais usando correspondência por data
          // Build de-duplicated map (keeps first entry per date)
          const existingByDate = new Map<string, FinancialEntry>();
          linkedReceitas.forEach(e => {
            const d = e.dataPrevista || e.data;
            if (!existingByDate.has(d)) existingByDate.set(d, e);
          });

          const matchCount = novas.filter(n => existingByDate.has(n.dataPrevista || n.data)).length;

          if (matchCount === 0) {
            // Datas mudaram (ex.: dataFim alterada) → regenera por índice
            const sortedExisting = [...linkedReceitas].sort((a, b) =>
              (a.dataPrevista || a.data).localeCompare(b.dataPrevista || b.data)
            );
            novas.forEach((n, i) => next.push({ ...n, id: sortedExisting[i]?.id || n.id }));
          } else {
            // Atualiza entradas existentes; pula datas excluídas pelo usuário
            novas.forEach(n => {
              const nDate = n.dataPrevista || n.data;
              const existing = existingByDate.get(nDate);
              if (existing) next.push({ ...n, id: existing.id });
              // Data sem correspondência = excluída pelo usuário → não recriar
            });
          }
        }
      }
    }

    // Gravação única
    await storeFinancialAll(next);
  };

  const handleSave = async () => {
    if (!form.motoId) { toast.error("Selecione a moto"); return; }
    if (!form.oficina.trim()) { toast.error("Informe a oficina"); return; }
    if (form.status === "concluida" && !form.conta) {
      toast.error("Selecione a conta de débito para concluir a OS");
      return;
    }
    try {
      await save(form);
      await syncFinancial(form);
      // Atualiza kmAtual da moto se o KM informado for maior
      if (form.km !== null && form.km > 0) {
        const moto = motos.find((m) => m.id === form.motoId);
        if (moto && (moto.kmAtual === null || form.km > moto.kmAtual)) {
          await saveMoto({ ...moto, kmAtual: form.km });
        }
      }
      toast.success(form.numeroOS ? `${form.numeroOS} salva` : "OS salva");
      setFormOpen(false);
    } catch {
      toast.error("Erro ao salvar OS");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      const all = loadFinancial();
      const linked = all.filter((e) => e.fixedOriginId === id);
      if (linked.length > 0) {
        await storeFinancialAll(all.filter((e) => e.fixedOriginId !== id));
      }
      toast.success("OS removida");
      setDetailOS(null);
    } catch {
      toast.error("Erro ao remover OS");
    }
  };

  const handleQuickStatus = async (os: Maintenance, status: Maintenance["status"]) => {
    if (status === "concluida" && !os.conta) {
      setForm({ ...os, status });
      setFormOpen(true);
      toast.info("Selecione a conta de débito para concluir a OS");
      return;
    }
    try {
      const updated = { ...os, status };
      await save(updated);
      await syncFinancial(updated);
      if (detailOS?.id === os.id) setDetailOS(updated);
      toast.success(`Status atualizado para "${STATUS_CONFIG[status].label}"`);
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  // ─── Itens do formulário ──────────────────────────────────────

  const addItem = () => setForm((f) => ({ ...f, itens: [...f.itens, emptyItem()] }));

  const updateItem = (index: number, patch: Partial<MaintenanceItem>) =>
    setForm((f) => {
      const itens = f.itens.map((it, i) => (i === index ? { ...it, ...patch } : it));
      return { ...f, itens };
    });

  const removeItem = (index: number) =>
    setForm((f) => ({ ...f, itens: f.itens.filter((_, i) => i !== index) }));

  const formTotal = computeCusto(form.itens);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Manutenções / OS</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {(items || []).length} ordens de serviço
          </p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Nova OS
            </Button>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total de OS" value={String((items || []).length)} icon={<ClipboardList className="h-4 w-4" />} />
        <MetricCard label="Em andamento" value={String(emAndamento)} icon={<Wrench className="h-4 w-4" />} color="blue" />
        <MetricCard label="Concluídas" value={String(concluidas)} icon={<CheckCircle2 className="h-4 w-4" />} color="green" />
        <MetricCard label="Custo total" value={fmt(totalCusto)} icon={<AlertCircle className="h-4 w-4" />} color="amber" />
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar placa, OS, oficina..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status OS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterNatureza} onValueChange={setFilterNatureza}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Natureza" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="corretiva">Corretiva</SelectItem>
              <SelectItem value="preventiva">Preventiva</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="w-36 h-9 text-sm"
              value={filterDataDe}
              onChange={(e) => setFilterDataDe(e.target.value)}
              title="Data de entrada a partir de"
            />
            <span className="text-muted-foreground text-xs">até</span>
            <Input
              type="date"
              className="w-36 h-9 text-sm"
              value={filterDataAte}
              onChange={(e) => setFilterDataAte(e.target.value)}
              title="Data de entrada até"
            />
          </div>
          <Select value={filterPlaca} onValueChange={setFilterPlaca}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Placa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as placas</SelectItem>
              {motos.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.placa}{m.modelo ? ` · ${m.modelo}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLocatario} onValueChange={setFilterLocatario}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Locatário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os locatários</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPagamento} onValueChange={(v) => setFilterPagamento(v as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterQuemPaga} onValueChange={(v) => setFilterQuemPaga(v as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Quem paga" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Quem paga: todos</SelectItem>
              <SelectItem value="locadora">Locadora</SelectItem>
              <SelectItem value="locatario">Locatário</SelectItem>
            </SelectContent>
          </Select>
          {(filterDataDe || filterDataAte || filterPlaca !== "todos" || filterLocatario !== "todos" || filterPagamento !== "todos" || filterQuemPaga !== "todos") && (
            <button
              onClick={() => {
                setFilterDataDe(""); setFilterDataAte("");
                setFilterPlaca("todos"); setFilterLocatario("todos");
                setFilterPagamento("todos"); setFilterQuemPaga("todos");
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Lista de OS */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <Wrench className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-base font-medium text-muted-foreground">Nenhuma OS encontrada</p>
          {canCreate && (
            <Button variant="outline" className="mt-4 gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" /> Criar primeira OS
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered
            .slice()
            .sort((a, b) => {
              const na = parseInt(a.numeroOS?.replace(/\D/g, "") || "0", 10);
              const nb = parseInt(b.numeroOS?.replace(/\D/g, "") || "0", 10);
              return nb - na;
            })
            .map((os) => (
              <OSCard
                key={os.id}
                os={os}
                motoLabel={getMotoLabel(os.motoId)}
                onView={() => setDetailOS(os)}
                onEdit={canEdit ? () => openEdit(os) : undefined}
                onDelete={canDelete ? () => handleDelete(os.id) : undefined}
                onStatusChange={(s) => handleQuickStatus(os, s)}
              />
            ))}
        </div>
      )}

      {/* Sheet de detalhe */}
      <Sheet open={!!detailOS} onOpenChange={(o) => { if (!o) setDetailOS(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailOS && (
            <OSDetail
              os={detailOS}
              motoLabel={getMotoLabel(detailOS.motoId)}
              onEdit={canEdit ? () => openEdit(detailOS) : undefined}
              onDelete={canDelete ? () => handleDelete(detailOS.id) : undefined}
              onStatusChange={(s) => handleQuickStatus(detailOS, s)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog de formulário */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {form.numeroOS ? `Editar ${form.numeroOS}` : "Nova Ordem de Serviço"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">

            {/* Linha 1: OS number */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold tracking-wide text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5 shrink-0">
                {form.numeroOS || "MVL-—"}
              </span>
            </div>

            {/* Linha 2: Status como pills */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["agendada", "em_andamento", "concluida"] as const).map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const active = form.status === s;
                  const activeClass = s === "agendada"
                    ? "border-amber-500 bg-amber-500/10 text-amber-600"
                    : s === "em_andamento"
                    ? "border-blue-500 bg-blue-500/10 text-blue-600"
                    : "border-emerald-500 bg-emerald-500/10 text-emerald-600";
                  return (
                    <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${active ? activeClass : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}>
                      {cfg.icon}{cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Natureza */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Natureza</Label>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {(["corretiva", "preventiva"] as const).map((n) => (
                  <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, natureza: n }))}
                    className={`rounded-lg border-2 py-2 text-sm font-medium transition-colors ${form.natureza === n ? (n === "corretiva" ? "border-red-500 bg-red-500/10 text-red-600" : "border-violet-500 bg-violet-500/10 text-violet-600") : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}>
                    {NATUREZA_CONFIG[n].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Linha 4: Moto ↔ Locatário */}
            {(() => {
              const rentalNaData = form.motoId ? findRentalAtDate(rentals, form.motoId, form.data) : undefined;
              const locatarioId = rentalNaData?.clienteId || "";
              const handleLocatarioChange = (clienteId: string) => {
                const rental = rentals.find((r) => r.clienteId === clienteId && r.status === "ativa");
                if (rental) setForm((f) => ({ ...f, motoId: rental.motoId }));
              };
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Moto (placa)</Label>
                    <SearchableSelect
                      options={motos.map((m) => ({ value: m.id, label: `${m.placa}${m.modelo ? ` · ${m.modelo}` : ""}` }))}
                      value={form.motoId}
                      onValueChange={(v) => setForm((f) => ({ ...f, motoId: v }))}
                      placeholder="Buscar placa..."
                      searchPlaceholder="Buscar placa..."
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Locatário</Label>
                    <SearchableSelect
                      options={clients.map((c) => ({ value: c.id, label: c.nome }))}
                      value={locatarioId}
                      onValueChange={handleLocatarioChange}
                      placeholder="Buscar locatário..."
                      searchPlaceholder="Buscar locatário..."
                    />
                  </div>
                </div>
              );
            })()}

            {/* Linha 5: Oficina */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Oficina</Label>
                <button
                  type="button"
                  onClick={() => window.open("/manutencoes/config", "_blank")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <SlidersHorizontal className="h-3 w-3" /> Gerenciar
                </button>
              </div>
              <SearchableSelect
                options={maintConfig.oficinas.map((o) => ({ value: o.nome, label: o.nome }))}
                value={form.oficina}
                onValueChange={(v) => setForm((f) => ({ ...f, oficina: v }))}
                placeholder="Buscar oficina..."
                searchPlaceholder="Buscar oficina..."
                emptyText="Nenhuma oficina cadastrada. Use o link Gerenciar acima."
              />
            </div>

            {/* Linha 5: Entrada | Retorno | KM */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Entrada</Label>
                <Input type="date" value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Retorno</Label>
                <Input type="date" value={form.dataFim || ""}
                  onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value || null }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">KM atual</Label>
                <Input type="number" value={form.km ?? ""} placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, km: e.target.value ? Number(e.target.value) : null }))} />
                <p className="text-[11px] text-muted-foreground leading-tight">Atualiza a moto.</p>
              </div>
            </div>

            {/* Linha 6: Conta + Previsão pagamento + Pago */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">
                  Conta de débito{form.status === "concluida" && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Select value={form.conta} onValueChange={(v) => setForm((f) => ({ ...f, conta: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(bankAccounts || []).filter((a) => a.tipo !== "cartao").map((a) => (
                      <SelectItem key={a.id} value={a.nome}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Previsão de pagamento</Label>
                <Input type="date" value={form.dataPagamentoPrevisto || ""}
                  onChange={(e) => setForm((f) => ({ ...f, dataPagamentoPrevisto: e.target.value || null }))} />
                <div className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                  form.pagamentoRealizado
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border bg-muted/30"
                }`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${form.pagamentoRealizado ? "text-emerald-600" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${form.pagamentoRealizado ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {form.pagamentoRealizado ? "Pagamento realizado" : "Aguardando pagamento"}
                    </span>
                  </div>
                  <Switch
                    checked={form.pagamentoRealizado ?? false}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, pagamentoRealizado: v }))}
                  />
                </div>
              </div>
            </div>

            {/* Itens da OS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Itens da OS</p>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Adicionar item
                </Button>
              </div>

              {form.itens.length === 0 ? (
                <div className="rounded-lg border border-dashed py-6 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum item adicionado</p>
                  <button
                    type="button"
                    onClick={addItem}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    Clique para adicionar peça ou serviço
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-[120px_90px_1fr_65px_100px_28px] gap-2 px-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Classificação</span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tipo</span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Descrição</span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Qtd</span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Valor unit.</span>
                    <span />
                  </div>
                  {form.itens.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-[120px_90px_1fr_65px_100px_28px] items-center gap-2">
                      <Select
                        value={item.classificacao ?? "Reparo"}
                        onValueChange={(v) => updateItem(idx, { classificacao: v as MaintenanceItem["classificacao"] })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Reparo">Reparo</SelectItem>
                          <SelectItem value="Troca de Óleo">Troca de Óleo</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={item.tipo}
                        onValueChange={(v) => updateItem(idx, { tipo: v as any })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="peca">
                            <span className="flex items-center gap-1.5"><Package className="h-3 w-3" /> Peça</span>
                          </SelectItem>
                          <SelectItem value="servico">
                            <span className="flex items-center gap-1.5"><Hammer className="h-3 w-3" /> Serviço</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 text-sm"
                        value={item.descricao}
                        onChange={(e) => updateItem(idx, { descricao: e.target.value })}
                        placeholder="Ex: Filtro de óleo"
                      />
                      <Input
                        className="h-8 text-sm"
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => updateItem(idx, { quantidade: Number(e.target.value) || 1 })}
                      />
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                        <Input
                          className="h-8 pl-7 text-sm"
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.valorUnitario || ""}
                          onChange={(e) => updateItem(idx, { valorUnitario: Number(e.target.value) || 0 })}
                          placeholder="0,00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex justify-end border-t pt-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-mono text-base font-bold">{fmt(formTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Observações */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Observações</Label>
              <Input value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva o problema ou serviço..." />
            </div>

            <Separator />

            {/* Cobrança */}
            {(() => {
              const custo = form.itens.length > 0 ? computeCusto(form.itens) : form.custo;
              const rentalNaData = form.motoId ? findRentalAtDate(rentals, form.motoId, form.data) : undefined;
              return (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold">Quem paga</Label>
                    <div className="grid grid-cols-2 gap-2 max-w-xs">
                      {(["locadora", "locatario"] as const).map((p) => (
                        <button key={p} type="button"
                          onClick={() => setForm((f) => ({ ...f, quemPaga: p, cobrarParcelado: false, valorLocatario: null, entradaLocatario: null, numeroParcelas: null }))}
                          className={`rounded-lg border-2 py-2 text-sm font-medium transition-colors ${form.quemPaga === p ? (p === "locadora" ? "border-blue-500 bg-blue-500/10 text-blue-600" : "border-orange-500 bg-orange-500/10 text-orange-600") : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}>
                          {p === "locadora" ? "Locadora" : "Locatário"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.quemPaga === "locatario" && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3 space-y-3 dark:border-orange-900/40 dark:bg-orange-950/20">
                      {form.motoId && !rentalNaData && (
                        <p className="text-[11px] text-amber-600 leading-tight">Nenhum locatário ativo nessa data.</p>
                      )}

                      {/* Valor a cobrar com toggle R$/% */}
                      <div className="grid gap-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Valor a cobrar</Label>
                          <div className="flex rounded-md border text-xs overflow-hidden">
                            <button type="button"
                              onClick={() => setValorLocatarioTipo("reais")}
                              className={`px-2.5 py-0.5 transition-colors ${valorLocatarioTipo === "reais" ? "bg-orange-500 text-white font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                              R$
                            </button>
                            <button type="button"
                              onClick={() => {
                                setValorLocatarioTipo("percentual");
                                if (custo > 0 && form.valorLocatario) {
                                  setValorLocatarioPercent(((form.valorLocatario / custo) * 100).toFixed(1));
                                }
                              }}
                              className={`px-2.5 py-0.5 transition-colors ${valorLocatarioTipo === "percentual" ? "bg-orange-500 text-white font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                              %
                            </button>
                          </div>
                        </div>

                        {valorLocatarioTipo === "reais" ? (
                          <Input
                            type="number" min={0} step={0.01}
                            placeholder={custo > 0 ? `${custo.toFixed(2)} (custo OS)` : "0,00"}
                            value={form.valorLocatario ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, valorLocatario: e.target.value ? Number(e.target.value) : null }))}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <div className="space-y-1">
                            <div className="relative">
                              <Input
                                type="number" min={0} max={200} step={0.1}
                                value={valorLocatarioPercent}
                                onChange={(e) => {
                                  setValorLocatarioPercent(e.target.value);
                                  const pct = parseFloat(e.target.value);
                                  setForm((f) => ({ ...f, valorLocatario: !isNaN(pct) && custo > 0 ? parseFloat((custo * pct / 100).toFixed(2)) : null }));
                                }}
                                className="h-8 text-sm pr-7"
                                placeholder="ex: 50"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                            </div>
                            {form.valorLocatario != null && custo > 0 && (
                              <p className="text-[11px] text-muted-foreground">= R$ {form.valorLocatario.toFixed(2)} sobre custo de R$ {custo.toFixed(2)}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Parcelamento */}
                      <div className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${form.cobrarParcelado ? "border-orange-400 bg-orange-100/60 dark:border-orange-700 dark:bg-orange-900/30" : "border-border bg-background"}`}>
                        <span className="text-xs font-medium">Parcelado</span>
                        <Switch checked={!!form.cobrarParcelado} onCheckedChange={(v) => setForm((f) => ({ ...f, cobrarParcelado: v }))} />
                      </div>

                      {form.cobrarParcelado && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label className="text-xs">Entrada (R$)</Label>
                            <Input
                              type="number" min={0} step={0.01}
                              value={form.entradaLocatario ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, entradaLocatario: e.target.value ? Number(e.target.value) : null }))}
                              className="h-8 text-sm" placeholder="0,00"
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Nº de parcelas</Label>
                            <Input
                              type="number" min={1} max={52} step={1}
                              value={form.numeroParcelas ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, numeroParcelas: e.target.value ? Number(e.target.value) : null }))}
                              className="h-8 text-sm" placeholder="ex: 4"
                            />
                          </div>
                          {(form.numeroParcelas ?? 0) > 0 && (() => {
                            const total = form.valorLocatario ?? custo;
                            const entrada = form.entradaLocatario ?? 0;
                            const n = form.numeroParcelas!;
                            const parcela = ((total - entrada) / n).toFixed(2);
                            const baseData = form.dataFim || form.data;
                            return (
                              <div className="col-span-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground space-y-0.5">
                                {entrada > 0 && <div>• Entrada R$ {entrada.toFixed(2)} na conclusão</div>}
                                {Array.from({ length: n }).map((_, i) => {
                                  const d = format(addDays(new Date(baseData + "T00:00:00"), (i + 1) * 7), "dd/MM/yyyy");
                                  return <div key={i}>• Parcela {i + 1}/{n} — R$ {parcela} em {d}</div>;
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {!form.cobrarParcelado && rentalNaData && (
                        <p className="text-[11px] text-emerald-600 leading-tight">Cobrança à vista gerada ao concluir.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.motoId || !form.oficina.trim()}>
              Salvar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Componente: MetricCard ───────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  color = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color?: "default" | "blue" | "green" | "amber";
}) {
  const iconColors = {
    default: "bg-muted text-muted-foreground",
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColors[color]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-base font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente: OSCard ───────────────────────────────────────────

function OSCard({
  os,
  motoLabel,
  onView,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  os: Maintenance;
  motoLabel: string;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange: (s: Maintenance["status"]) => void;
}) {
  const status = STATUS_CONFIG[os.status];
  const natureza = NATUREZA_CONFIG[os.natureza];
  const custo = os.itens.length > 0 ? computeCusto(os.itens) : os.custo;
  const entradaLabel = fmtDate(os.data);
  const retornoLabel = fmtDate(os.dataFim);

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Topo: OS number + menu */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {os.numeroOS || "—"}
            </span>
            <span className="text-sm font-semibold text-foreground">{motoLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {os.status !== "agendada" && (
                  <DropdownMenuItem onClick={() => onStatusChange("agendada")}>
                    <Clock className="mr-2 h-3.5 w-3.5" /> Marcar Agendada
                  </DropdownMenuItem>
                )}
                {os.status !== "em_andamento" && (
                  <DropdownMenuItem onClick={() => onStatusChange("em_andamento")}>
                    <Wrench className="mr-2 h-3.5 w-3.5" /> Marcar Em Andamento
                  </DropdownMenuItem>
                )}
                {os.status !== "concluida" && (
                  <DropdownMenuItem onClick={() => onStatusChange("concluida")}>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Marcar Concluída
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.color}`}>
            {status.icon} {status.label}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${natureza.color}`}>
            {natureza.label}
          </span>
          {[...new Set(os.itens.map((i) => i.classificacao ?? "Reparo"))].map((cat) => (
            <span key={cat} className="inline-flex items-center rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {cat}
            </span>
          ))}
        </div>

        {/* Oficina */}
        {os.oficina && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{os.oficina}</span>
          </div>
        )}

        {/* Datas + KM */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {entradaLabel}
            {retornoLabel && <> → {retornoLabel}</>}
            {!retornoLabel && os.status !== "concluida" && (
              <span className="text-amber-500 font-medium"> · em aberto</span>
            )}
          </span>
          {os.km && (
            <span className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" />
              {os.km.toLocaleString("pt-BR")} km
            </span>
          )}
        </div>

        <Separator />

        {/* Rodapé: itens + custo + status pagamento */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {os.itens.length > 0
              ? `${os.itens.length} ${os.itens.length === 1 ? "item" : "itens"}`
              : "Sem itens"}
          </span>
          <div className="flex items-center gap-2">
            {os.dataPagamentoPrevisto && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                os.pagamentoRealizado
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-700 border-amber-500/20"
              }`}>
                <CheckCircle2 className="h-2.5 w-2.5" />
                {os.pagamentoRealizado ? "Pago" : "A pagar"}
              </span>
            )}
            <span className="font-mono text-sm font-bold">{fmt(custo)}</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={onView}
        >
          Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Componente: OSDetail ─────────────────────────────────────────

function OSDetail({
  os,
  motoLabel,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  os: Maintenance;
  motoLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange: (s: Maintenance["status"]) => void;
}) {
  const status = STATUS_CONFIG[os.status];
  const natureza = NATUREZA_CONFIG[os.natureza];
  const custo = os.itens.length > 0 ? computeCusto(os.itens) : os.custo;
  const entradaLabel = fmtDate(os.data);
  const retornoLabel = fmtDate(os.dataFim);

  return (
    <div className="flex flex-col gap-5 pt-2">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          {os.numeroOS || "OS sem número"}
        </SheetTitle>
      </SheetHeader>

      {/* Badges + ações */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${status.color}`}>
            {status.icon} {status.label}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${natureza.color}`}>
            {natureza.label}
          </span>
        </div>
        <div className="flex gap-1.5">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="sm" onClick={onDelete} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Mudança rápida de status */}
      {os.status !== "concluida" && (
        <div className="flex gap-2">
          {os.status === "agendada" && (
            <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => onStatusChange("em_andamento")}>
              <Wrench className="h-3.5 w-3.5" /> Iniciar serviço
            </Button>
          )}
          <Button size="sm" className="gap-1.5 flex-1" onClick={() => onStatusChange("concluida")}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Concluir OS
          </Button>
        </div>
      )}

      <Separator />

      {/* Informações */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Moto" value={motoLabel} />
          <InfoRow label="Tipo" value={getTipoLabel(os.tipo)} />
          <InfoRow label="Oficina" value={os.oficina || "—"} />
          <InfoRow label="Conta de débito" value={os.conta || "—"} />
          <InfoRow
            label="Pagamento previsto"
            value={fmtDate(os.dataPagamentoPrevisto) || "—"}
            badge={os.dataPagamentoPrevisto ? (
              <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                os.pagamentoRealizado
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-700 border-amber-500/20"
              }`}>
                <CheckCircle2 className="h-2.5 w-2.5" />
                {os.pagamentoRealizado ? "Pago" : "A pagar"}
              </span>
            ) : undefined}
          />
          <InfoRow label="KM" value={os.km ? `${os.km.toLocaleString("pt-BR")} km` : "—"} />
          <InfoRow label="Entrada" value={entradaLabel || "—"} />
          <InfoRow label="Retorno" value={retornoLabel || (os.status !== "concluida" ? "Em aberto" : "—")} />
        </div>
        {os.descricao && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {os.descricao}
          </div>
        )}
      </div>

      <Separator />

      {/* Itens */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Itens da OS
        </p>
        {os.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item registrado.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Classificação</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descrição</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qtd</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unit.</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {os.itens.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {item.classificacao ?? "Reparo"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        item.tipo === "peca"
                          ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                          : "bg-sky-500/10 text-sky-600 border-sky-500/20"
                      }`}>
                        {item.tipo === "peca" ? <Package className="h-2.5 w-2.5" /> : <Hammer className="h-2.5 w-2.5" />}
                        {item.tipo === "peca" ? "Peça" : "Serviço"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.descricao || "—"}</td>
                    <td className="px-3 py-2 text-center font-mono">{item.quantidade}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(item.valorUnitario)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmt(item.quantidade * item.valorUnitario)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-base font-bold">
                    {fmt(custo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {os.itens.length === 0 && os.custo > 0 && (
          <div className="flex justify-between border-t pt-2">
            <span className="text-sm text-muted-foreground">Custo registrado</span>
            <span className="font-mono font-bold">{fmt(os.custo)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente: InfoRow ─────────────────────────────────────────

function InfoRow({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium">{value}</span>
        {badge}
      </div>
    </div>
  );
}
