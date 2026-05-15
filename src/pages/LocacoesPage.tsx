import { useState, useMemo, useEffect } from "react";
import { Rental, Motorcycle, Client, FinancialEntry, OilChangeRecord } from "@/lib/types";
import { saveRentals, saveMotos, loadFinancial, saveFinancial, loadMotos, loadClients, loadRentals, saveClients } from "@/lib/store";
import { lastOilChange } from "@/lib/oil-kpis";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { resolveAssociations } from "@/lib/financial-associations";
import { addWeeks, addDays, addMonths, isBefore, isEqual, parseISO, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, FileText, Eye, Trash2, Pencil, XCircle, History } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RentalWizard from "@/components/locacoes/RentalWizard";
import HistoricalRentalDialog from "@/components/locacoes/HistoricalRentalDialog";
import { toast } from "sonner";
import { ImportExportBar } from "@/components/ImportExportBar";
import { usePermissions } from "@/hooks/usePermissions";

const statusLabel: Record<string, string> = { ativa: "Ativa", finalizada: "Finalizada", cancelada: "Cancelada" };
const statusColor: Record<string, string> = { ativa: "bg-success/10 text-success", finalizada: "bg-muted text-muted-foreground", cancelada: "bg-destructive/10 text-destructive" };
const planoLabel: Record<string, string> = { aluguel: "Só Aluguel", moto_no_final: "Moto no Final" };

const MOTIVOS_ENCERRAMENTO = [
  "Fim do contrato",
  "Solicitação do cliente",
  "Inadimplência",
  "Acidente / Sinistro",
  "Venda da moto",
  "Manutenção prolongada",
  "Descumprimento de contrato",
  "Outro",
];

function makeEmptyRental(): Rental {
  return {
    id: crypto.randomUUID(), motoId: "", clienteId: "", vendedor: "",
    dataInicio: new Date().toISOString().split("T")[0], horaInicio: "08:00",
    dataFim: null, dataFimContrato: null, proximoPagamento: null,
    tempoMinimoContrato: null, frequenciaPagamento: "",
    valorDiario: 0, valorCaucao: 0, caucaoPendente: false, caucaoParcelado: false, parcelasCaucao: [],
    multaAtraso: 0, jurosAtrasoMes: 0,
    localRetirada: "", localDevolucao: "",
    kmInicio: 0, kmFim: null, nivelCombustivel: "", plano: "",
    raioCirculacao: "", seguroTerceiros: false,
    gerarCobrancaCaucao: true, gerarCobrancaPagamento: true,
    status: "ativa", checklistRetirada: [], checklistDevolucao: [],
    observacoes: "", createdAt: new Date().toISOString().split("T")[0],
  };
}

export default function LocacoesPage() {
  const cache = useDataCacheSnapshot();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const motos = cache.motos;
  const clients = cache.clients;
  const [search, setSearch] = useState("");

  useEffect(() => { setRentals(cache.rentals); }, [cache.rentals]);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRental, setEditRental] = useState<Rental | null>(null);
  const [viewRental, setViewRental] = useState<Rental | null>(null);
  const [encerrarRental, setEncerrarRental] = useState<Rental | null>(null);
  const [historicalOpen, setHistoricalOpen] = useState(false);

  // Encerramento form
  const [encerrarMotivo, setEncerrarMotivo] = useState("");
  const [encerrarData, setEncerrarData] = useState(new Date().toISOString().split("T")[0]);
  const [encerrarKmFim, setEncerrarKmFim] = useState("");
  const [encerrarObs, setEncerrarObs] = useState("");
  const [encerrarPendencias, setEncerrarPendencias] = useState<FinancialEntry[]>([]);
  const [encerrarSelectedIds, setEncerrarSelectedIds] = useState<Set<string>>(new Set());

  const { canCreate, canEdit, canDelete } = usePermissions();
  const persist = (d: Rental[]) => { setRentals(d); saveRentals(d); };

  const getMotoPlaca = (id: string) => motos.find(m => m.id === id)?.placa || "—";
  const getMotoModelo = (id: string) => motos.find(m => m.id === id)?.modelo || "—";
  const getClientName = (id: string) => {
    const all = loadClients();
    return all.find(c => c.id === id)?.nome || clients.find(c => c.id === id)?.nome || "—";
  };
  const getRentalClientLabel = (r: Rental) => {
    if (r.clienteId) return getClientName(r.clienteId);
    if (r.vendedor && r.vendedor.trim()) return r.vendedor.trim();
    return "—";
  };

  const getNumero = (r: Rental) => r.numero ? `#${String(r.numero).padStart(5, "0")}` : `#${r.id.slice(0, 6).toUpperCase()}`;

  const matchSearch = (r: Rental) =>
    !search ||
    getMotoPlaca(r.motoId).toLowerCase().includes(search.toLowerCase()) ||
    getRentalClientLabel(r).toLowerCase().includes(search.toLowerCase()) ||
    getNumero(r).toLowerCase().includes(search.toLowerCase());

  const ativas = useMemo(() => rentals.filter(r => r.status === "ativa" && matchSearch(r)), [rentals, search, motos, clients]);
  const finalizadas = useMemo(() => rentals.filter(r => (r.status === "finalizada" || r.status === "cancelada") && matchSearch(r)), [rentals, search, motos, clients]);

  const handleSaveRental = (rental: Rental, client: Client) => {
    const allClients = loadClients();
    if (!allClients.find(c => c.id === client.id)) {
      // Client will be added through saveClients in the wizard
    }

    const motoPlaca = getMotoPlaca(rental.motoId);
    const allMotosForCtx = loadMotos();
    const allRentals = loadRentals();
    const ctx = { motos: allMotosForCtx, clients: [...allClients, client], rentals: [...allRentals, rental] };

    const isEditing = !!rentals.find(r => r.id === rental.id);

    // Load financial entries ONCE — multiple loadFinancial()/saveFinancial() calls
    // in the same synchronous block would race: the DataContext save queue uses a
    // version-gate that silently skips all but the last save to the same table, and
    // the optimistic cache update only fires inside the async closure, so subsequent
    // loadFinancial() calls would still see the stale snapshot. Accumulate all
    // changes in memory and issue a single saveFinancial() at the end.
    const currentFinancial = loadFinancial();

    // On edit: preserve past entries (paid or unpaid) — only future unpaid entries
    // are removed and regenerated so gaps are filled without touching history.
    // Future pending entries are merged by date so their IDs are preserved
    // (no duplicate or broken series when re-saving with updated values).
    const today = new Date().toISOString().split("T")[0];

    // Index existing future unpaid aluguel entries by date for ID-preserving merge
    const existingAluguelByDate = new Map<string, FinancialEntry>();
    if (isEditing) {
      currentFinancial.forEach(e => {
        if (e.rentalId === rental.id && e.categoria === "aluguel" && !e.pago && e.data >= today) {
          existingAluguelByDate.set(e.data, e);
        }
      });
    }

    // UUID compartilhado por todas as cobranças de aluguel desta locação.
    // Se já existe alguma entrada com recurringGroupId, reutiliza; senão gera novo.
    const aluguelGroupId = (() => {
      if (isEditing) {
        for (const e of currentFinancial) {
          if (e.rentalId === rental.id && e.categoria === "aluguel" && e.recurringGroupId) {
            return e.recurringGroupId;
          }
        }
      }
      return crypto.randomUUID();
    })();

    let baseEntries = currentFinancial;
    if (isEditing) {
      baseEntries = currentFinancial.filter(e => {
        if (e.rentalId !== rental.id) return true;
        if (e.pago) return true;
        // "o que passou não mexe" — past unpaid entries stay as-is
        if ((e.categoria === "aluguel" || e.categoria === "caucao") && e.data < today) return true;
        if (e.categoria === "aluguel") return false;
        if (e.categoria === "caucao") return false;
        return true;
      });
    }

    const newFinancialEntries: FinancialEntry[] = [];

    if (rental.gerarCobrancaCaucao && rental.valorCaucao > 0 && !rental.caucaoParcelado) {
      newFinancialEntries.push(resolveAssociations({
        id: crypto.randomUUID(), tipo: "receita", categoria: "caucao",
        descricao: `Caução - ${motoPlaca} - ${client.nome}`,
        valor: rental.valorCaucao, data: rental.dataInicio, pago: true,
        motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
        placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
      }, ctx));
    }

    if (rental.gerarCobrancaCaucao && rental.caucaoParcelado) {
      const caucaoSerieId = `caucao-${rental.id}`;
      rental.parcelasCaucao.forEach(p => {
        newFinancialEntries.push(resolveAssociations({
          id: crypto.randomUUID(), tipo: "receita" as const, categoria: "caucao",
          subcategoria: "Parcela",
          serieId: caucaoSerieId,
          descricao: `Caução Parcela - ${motoPlaca} - ${client.nome}`,
          valor: p.valor, data: p.data, pago: p.status === "recebido",
          dataPrevista: p.data,
          motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
          placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
        }, ctx));
      });
    }

    if (rental.gerarCobrancaPagamento && rental.valorDiario > 0 && rental.dataFimContrato) {
      const startDate = parseISO(rental.dataInicio);
      const endDate = parseISO(rental.dataFimContrato);
      const freq = rental.frequenciaPagamento;
      const aluguelSerieId = `aluguel-${rental.id}`;

      // Dias do período base (usado para pro-rata da última semana parcial)
      const periodDays = freq === "semanal" ? 7 : freq === "quinzenal" ? 15 : 30;

      // Datas com entrada paga já estão em baseEntries — não duplicar
      const paidAluguelDates = new Set(
        baseEntries
          .filter(e => e.rentalId === rental.id && e.categoria === "aluguel" && e.pago)
          .map(e => e.data),
      );

      const advanceDate = (d: Date): Date => {
        if (freq === "semanal") return addWeeks(d, 1);
        if (freq === "quinzenal") return addDays(d, 15);
        return addMonths(d, 1);
      };

      let current = advanceDate(startDate);
      let lastChargeDate = startDate; // rastreia data da última cobrança gerada
      let idx = 1;
      while (isBefore(current, endDate) || isEqual(current, endDate)) {
        const dataStr = current.toISOString().split("T")[0];
        // Ao editar: só gera entradas futuras (preenche lacunas sem mexer no passado)
        const shouldGenerate = !isEditing || (dataStr >= today && !paidAluguelDates.has(dataStr));
        if (shouldGenerate) {
          // Reutiliza ID, serieId e recurringGroupId da entrada existente para não quebrar a série
          const existing = existingAluguelByDate.get(dataStr);
          newFinancialEntries.push(resolveAssociations({
            id: existing?.id ?? crypto.randomUUID(),
            tipo: "receita", categoria: "aluguel",
            serieId: existing?.serieId ?? aluguelSerieId,
            recurringGroupId: existing?.recurringGroupId ?? aluguelGroupId,
            descricao: `Aluguel ${idx}ª semana - ${motoPlaca} - ${client.nome}`,
            valor: rental.valorDiario, data: dataStr, pago: false,
            dataPrevista: dataStr,
            motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
            placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
          }, ctx));
        }
        lastChargeDate = current;
        current = advanceDate(current);
        idx++;
      }

      // Semana parcial: dias restantes entre a última cobrança e o fim do contrato
      const remainingDays = differenceInDays(endDate, lastChargeDate);
      if (remainingDays > 0 && remainingDays < periodDays) {
        const proratedValue = parseFloat(
          ((rental.valorDiario / periodDays) * remainingDays).toFixed(2),
        );
        const dataStr = endDate.toISOString().split("T")[0];
        const shouldGenerate = !isEditing || (dataStr >= today && !paidAluguelDates.has(dataStr));
        if (shouldGenerate) {
          const existingPartial = existingAluguelByDate.get(dataStr);
          newFinancialEntries.push(resolveAssociations({
            id: existingPartial?.id ?? crypto.randomUUID(),
            tipo: "receita", categoria: "aluguel",
            serieId: existingPartial?.serieId ?? aluguelSerieId,
            recurringGroupId: existingPartial?.recurringGroupId ?? aluguelGroupId,
            descricao: `Aluguel ${idx}ª semana (${remainingDays}d) - ${motoPlaca} - ${client.nome}`,
            valor: proratedValue, data: dataStr, pago: false,
            dataPrevista: dataStr,
            motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
            placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
          }, ctx));
        }
      }
    }

    // Single save — avoids version-gate skipping intermediate saves
    if (newFinancialEntries.length > 0 || baseEntries.length !== currentFinancial.length) {
      saveFinancial([...baseEntries, ...newFinancialEntries]);
    }

    if (rental.status === "ativa" && rental.motoId) {
      const allMotos = loadMotos();
      const updatedMotos = allMotos.map(m => {
        if (m.id !== rental.motoId) return m;
        const updates: Partial<Motorcycle> = { status: "alugada" as const };
        if (!isEditing && rental.kmInicio > 0) {
          const lastChange = lastOilChange(m);
          if (!lastChange || lastChange.km < rental.kmInicio) {
            const oilRecord: OilChangeRecord = {
              id: crypto.randomUUID(),
              data: rental.dataInicio,
              km: rental.kmInicio,
            };
            updates.historicoOleo = [...(m.historicoOleo || []), oilRecord];
          }
          if (!m.kmAtual || m.kmAtual < rental.kmInicio) {
            updates.kmAtual = rental.kmInicio;
          }
        }
        return { ...m, ...updates };
      });
      saveMotos(updatedMotos);
    }

    const exists = rentals.find(r => r.id === rental.id);
    if (exists) persist(rentals.map(r => r.id === rental.id ? rental : r));
    else persist([...rentals, rental]);

    setDialogOpen(false);
    setEditRental(null);
  };

  const openEncerrar = (r: Rental) => {
    setEncerrarRental(r);
    setEncerrarMotivo("");
    setEncerrarData(new Date().toISOString().split("T")[0]);
    setEncerrarKmFim(r.kmFim ? String(r.kmFim) : "");
    setEncerrarObs("");
    const pendentes = loadFinancial().filter(e => e.rentalId === r.id && !e.pago);
    pendentes.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
    setEncerrarPendencias(pendentes);
    setEncerrarSelectedIds(new Set(pendentes.map(e => e.id)));
  };

  const confirmEncerrar = () => {
    if (!encerrarRental) return;
    if (!encerrarMotivo) {
      toast.error("Selecione o motivo do encerramento");
      return;
    }
    if (!encerrarData) {
      toast.error("Informe a data de encerramento");
      return;
    }

    const obs = [
      encerrarRental.observacoes,
      `--- Encerramento ---`,
      `Motivo: ${encerrarMotivo}`,
      `Data: ${new Date(encerrarData + "T00:00:00").toLocaleDateString("pt-BR")}`,
      encerrarKmFim ? `KM Final: ${encerrarKmFim}` : "",
      encerrarObs ? `Obs: ${encerrarObs}` : "",
    ].filter(Boolean).join("\n");

    const updated: Rental = {
      ...encerrarRental,
      status: "finalizada",
      dataFim: encerrarData,
      kmFim: encerrarKmFim ? Number(encerrarKmFim) : null,
      observacoes: obs,
      checklistDevolucao: [],
    };
    persist(rentals.map(x => x.id === encerrarRental.id ? updated : x));

    if (encerrarRental.motoId) {
      const allMotos = loadMotos();
      const updatedMotos = allMotos.map(m => m.id === encerrarRental.motoId ? { ...m, status: "disponivel" as const } : m);
      saveMotos(updatedMotos);
    }

    // Excluir apenas as pendências selecionadas pelo usuário
    const allEntries = loadFinancial();
    const remaining = allEntries.filter(e => !encerrarSelectedIds.has(e.id));
    const removedCount = allEntries.length - remaining.length;
    if (removedCount > 0) saveFinancial(remaining);

    toast.success(
      removedCount > 0
        ? `Locação encerrada. ${removedCount} cobrança(s) pendente(s) removida(s).`
        : "Locação encerrada com sucesso",
    );
    setEncerrarRental(null);
    setEncerrarPendencias([]);
    setEncerrarSelectedIds(new Set());
  };

  const deleteRental = (r: Rental) => {
    if (confirm("Tem certeza que deseja excluir esta locação?")) {
      persist(rentals.filter(x => x.id !== r.id));
    }
  };

  const openEdit = (r: Rental) => {
    setEditRental(r);
    setDialogOpen(true);
  };

  const RentalTable = ({ data, showActions }: { data: Rental[]; showActions: "ativa" | "finalizada" }) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[90px]">Nº</TableHead>
            <TableHead className="w-[90px]">Placa</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Início</TableHead>
            <TableHead>Fim Contrato</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Nenhuma locação encontrada
              </TableCell>
            </TableRow>
          ) : data.map(r => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewRental(r)}>
              <TableCell className="font-mono text-xs text-muted-foreground">{getNumero(r)}</TableCell>
              <TableCell className="font-mono font-bold text-xs">{getMotoPlaca(r.motoId)}</TableCell>
              <TableCell className="text-xs">{getMotoModelo(r.motoId)}</TableCell>
              <TableCell className="text-xs">{getRentalClientLabel(r)}</TableCell>
              <TableCell className="text-xs">{new Date(r.dataInicio + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
              <TableCell className="text-xs">{(() => { const d = r.status === "ativa" ? r.dataFimContrato : r.dataFim; return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"; })()}</TableCell>
              <TableCell className="text-xs text-right font-medium">R$ {r.valorDiario.toFixed(2)}</TableCell>
              <TableCell className="text-xs">{planoLabel[r.plano] || r.plano || "—"}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
              </TableCell>
              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Ver detalhes" onClick={() => setViewRental(r)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {showActions === "ativa" && (
                    <>
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar locação" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Encerrar locação"
                          onClick={() => openEncerrar(r)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                  {showActions === "finalizada" && canDelete && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteRental(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Locações</h2>
          <p className="text-sm text-muted-foreground">{ativas.length} ativas · {rentals.length} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportExportBar
            kind="locacoes"
            items={rentals}
            motos={motos}
            clients={clients}
            onImport={(rows) => {
              // Persist any new clients created on the fly
              const allClients = loadClients();
              const clientsMap = new Map(allClients.map(c => [c.id, c]));
              rows.forEach(r => {
                const pending = (r.data as any).__pendingClient;
                if (pending && !clientsMap.has(pending.id)) clientsMap.set(pending.id, pending);
              });
              saveClients(Array.from(clientsMap.values()));

              // Persist rentals (strip helper field)
              const map = new Map(rentals.map(r => [r.id, r]));
              rows.forEach(r => {
                const { __pendingClient, ...clean } = r.data as any;
                map.set(clean.id, clean);
              });
              persist(Array.from(map.values()));
            }}
          />
          {canCreate && (
            <Button onClick={() => { setEditRental(null); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Locação
            </Button>
          )}
          <Button variant="outline" onClick={() => setHistoricalOpen(true)} className="gap-2">
            <History className="h-4 w-4" /> Locação Encerrada
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar nº, placa ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="ativas">
        <TabsList>
          <TabsTrigger value="ativas">Ativas ({ativas.length})</TabsTrigger>
          <TabsTrigger value="finalizadas">Finalizadas ({finalizadas.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="ativas" className="mt-3">
          <RentalTable data={ativas} showActions="ativa" />
        </TabsContent>
        <TabsContent value="finalizadas" className="mt-3">
          <RentalTable data={finalizadas} showActions="finalizada" />
        </TabsContent>
      </Tabs>

      {/* New / Edit Rental Wizard */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditRental(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRental ? `Editar Locação ${getNumero(editRental)}` : "Nova Locação"}</DialogTitle>
          </DialogHeader>
          <RentalWizard
            rental={editRental || makeEmptyRental()}
            motos={motos}
            activeRentalMotoIds={rentals.filter(r => r.status === "ativa" && r.id !== editRental?.id).map(r => r.motoId)}
            activeRentalClientIds={rentals.filter(r => r.status === "ativa" && r.id !== editRental?.id).map(r => r.clienteId)}
            onSave={handleSaveRental}
            onCancel={() => { setDialogOpen(false); setEditRental(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Encerrar Locação Dialog */}
      <Dialog open={!!encerrarRental} onOpenChange={() => { setEncerrarRental(null); setEncerrarPendencias([]); setEncerrarSelectedIds(new Set()); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Encerrar Locação {encerrarRental ? getNumero(encerrarRental) : ""}
            </DialogTitle>
          </DialogHeader>
          {encerrarRental && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Placa:</span> <span className="font-mono font-bold">{getMotoPlaca(encerrarRental.motoId)}</span></p>
                <p><span className="text-muted-foreground">Cliente:</span> {getRentalClientLabel(encerrarRental)}</p>
              </div>

              <div className="space-y-2">
                <Label>Motivo do encerramento *</Label>
                <Select value={encerrarMotivo} onValueChange={setEncerrarMotivo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_ENCERRAMENTO.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data de encerramento *</Label>
                  <Input type="date" value={encerrarData} onChange={e => setEncerrarData(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>KM Final</Label>
                  <Input type="number" placeholder="Ex: 45000" value={encerrarKmFim} onChange={e => setEncerrarKmFim(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Observações sobre o encerramento..." value={encerrarObs} onChange={e => setEncerrarObs(e.target.value)} rows={3} />
              </div>

              {/* Pendências */}
              {encerrarPendencias.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Cobranças pendentes ({encerrarPendencias.length})</Label>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => setEncerrarSelectedIds(new Set(encerrarPendencias.map(e => e.id)))}
                      >
                        Marcar todas
                      </button>
                      <span className="text-muted-foreground">·</span>
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => setEncerrarSelectedIds(new Set())}
                      >
                        Desmarcar todas
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Marque as cobranças que devem ser excluídas ao encerrar.</p>
                  <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                    {(() => {
                      // Separate aluguel entries (sorted by date) from others
                      const aluguelEntries = encerrarPendencias.filter(e => e.categoria === "aluguel");
                      const otherEntries = encerrarPendencias.filter(e => e.categoria !== "aluguel");

                      const toggleId = (id: string) => {
                        setEncerrarSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id); else next.add(id);
                          return next;
                        });
                      };

                      const selectFromIndex = (idx: number) => {
                        setEncerrarSelectedIds(prev => {
                          const next = new Set(prev);
                          aluguelEntries.slice(idx).forEach(e => next.add(e.id));
                          return next;
                        });
                      };

                      const rows: JSX.Element[] = [];

                      if (otherEntries.length > 0) {
                        otherEntries.forEach(e => {
                          const checked = encerrarSelectedIds.has(e.id);
                          rows.push(
                            <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                              <Checkbox
                                id={`pend-${e.id}`}
                                checked={checked}
                                onCheckedChange={() => toggleId(e.id)}
                              />
                              <label htmlFor={`pend-${e.id}`} className="flex-1 cursor-pointer leading-tight">
                                <span className="font-medium">{e.descricao || e.categoria}</span>
                                <span className="ml-2 text-muted-foreground text-xs">
                                  {e.data ? new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                </span>
                              </label>
                              <span className="font-mono text-xs tabular-nums">
                                R$ {(e.valor ?? 0).toFixed(2)}
                              </span>
                            </div>
                          );
                        });
                      }

                      if (aluguelEntries.length > 0) {
                        aluguelEntries.forEach((e, idx) => {
                          const checked = encerrarSelectedIds.has(e.id);
                          rows.push(
                            <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm group">
                              <Checkbox
                                id={`pend-${e.id}`}
                                checked={checked}
                                onCheckedChange={() => toggleId(e.id)}
                              />
                              <label htmlFor={`pend-${e.id}`} className="flex-1 cursor-pointer leading-tight">
                                <span className="font-medium">{e.descricao || `Aluguel ${idx + 1}ª cobrança`}</span>
                                <span className="ml-2 text-muted-foreground text-xs">
                                  {e.data ? new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                </span>
                              </label>
                              <span className="font-mono text-xs tabular-nums mr-2">
                                R$ {(e.valor ?? 0).toFixed(2)}
                              </span>
                              <button
                                type="button"
                                className="text-[10px] text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity underline-offset-2 hover:underline"
                                title="Marcar esta e todas as seguintes"
                                onClick={() => selectFromIndex(idx)}
                              >
                                daqui em diante
                              </button>
                            </div>
                          );
                        });
                      }

                      return rows;
                    })()}
                  </div>
                  {encerrarSelectedIds.size > 0 && (
                    <p className="text-xs text-destructive font-medium">
                      {encerrarSelectedIds.size} cobrança(s) serão excluídas ao confirmar.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Nenhuma cobrança pendente para esta locação.
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setEncerrarRental(null); setEncerrarPendencias([]); setEncerrarSelectedIds(new Set()); }}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmEncerrar} className="gap-2">
              <XCircle className="h-4 w-4" /> Confirmar Encerramento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Rental Dialog */}
      <Dialog open={!!viewRental} onOpenChange={() => setViewRental(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Locação {viewRental ? getNumero(viewRental) : ""} — {viewRental ? getMotoPlaca(viewRental.motoId) : ""}</DialogTitle>
          </DialogHeader>
          {viewRental && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Moto:</span> <span className="font-bold">{getMotoPlaca(viewRental.motoId)}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-bold">{getRentalClientLabel(viewRental)}</span></div>
                <div><span className="text-muted-foreground">Vendedor:</span> {viewRental.vendedor || "—"}</div>
                <div><span className="text-muted-foreground">Plano:</span> {planoLabel[viewRental.plano] || viewRental.plano}</div>
                <div><span className="text-muted-foreground">Início:</span> {new Date(viewRental.dataInicio + "T00:00:00").toLocaleDateString("pt-BR")} {viewRental.horaInicio}</div>
                <div><span className="text-muted-foreground">Fim contrato:</span> {(() => { const d = viewRental.status === "ativa" ? viewRental.dataFimContrato : viewRental.dataFim; return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"; })()}</div>
                <div><span className="text-muted-foreground">Valor:</span> R$ {viewRental.valorDiario.toFixed(2)}</div>
                <div><span className="text-muted-foreground">Caução:</span> R$ {viewRental.valorCaucao.toFixed(2)} {viewRental.caucaoParcelado ? "(Parcelado)" : ""}</div>
                <div><span className="text-muted-foreground">Multa atraso:</span> R$ {(viewRental.multaAtraso || 0).toFixed(2)}</div>
                <div><span className="text-muted-foreground">Juros atraso:</span> {(viewRental.jurosAtrasoMes || 0).toFixed(2)}%/mês</div>
                <div><span className="text-muted-foreground">KM entrega:</span> {viewRental.kmInicio.toLocaleString("pt-BR")}</div>
                <div><span className="text-muted-foreground">Combustível:</span> {viewRental.nivelCombustivel || "—"}</div>
                <div><span className="text-muted-foreground">Frequência:</span> {viewRental.frequenciaPagamento}</div>
                <div><span className="text-muted-foreground">Seguro 3ºs:</span> {viewRental.seguroTerceiros ? "Sim" : "Não"}</div>
                {viewRental.raioCirculacao && <div className="col-span-2"><span className="text-muted-foreground">Raio circulação:</span> {viewRental.raioCirculacao}</div>}
                {viewRental.localRetirada && <div><span className="text-muted-foreground">Retirada:</span> {viewRental.localRetirada}</div>}
                {viewRental.localDevolucao && <div><span className="text-muted-foreground">Devolução:</span> {viewRental.localDevolucao}</div>}
              </div>

              {viewRental.caucaoParcelado && viewRental.parcelasCaucao.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Parcelas do Caução</h4>
                  <div className="space-y-1 text-sm">
                    {viewRental.parcelasCaucao.map((p, i) => (
                      <div key={p.id} className="flex gap-4">
                        <span>Parcela {i + 1}: R$ {p.valor.toFixed(2)}</span>
                        <span>{new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                        <span className={p.status === "recebido" ? "text-success" : "text-warning"}>{p.status === "recebido" ? "Recebido" : "Pendente"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewRental.checklistRetirada.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Checklist Retirada</h4>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    {viewRental.checklistRetirada.map(c => (
                      <div key={c.id} className={`flex items-center gap-2 ${c.ok ? "text-success" : "text-destructive"}`}>
                        <span>{c.ok ? "✓" : "✗"}</span> {c.item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewRental.observacoes && <p className="text-sm text-muted-foreground border-t pt-2 whitespace-pre-line">{viewRental.observacoes}</p>}

              {/* Action buttons at bottom of view */}
              {viewRental.status === "ativa" && (
                <div className="flex gap-2 border-t pt-3">
                  {canEdit && (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => { setViewRental(null); openEdit(viewRental); }}>
                      <Pencil className="h-3.5 w-3.5" /> Editar Locação
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="destructive" size="sm" className="gap-1" onClick={() => { setViewRental(null); openEncerrar(viewRental); }}>
                      <XCircle className="h-3.5 w-3.5" /> Encerrar Locação
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Historical (encerrada) rental quick-add */}
      <HistoricalRentalDialog
        open={historicalOpen}
        onOpenChange={setHistoricalOpen}
        motos={motos}
        clients={clients}
        onSaved={(rental) => persist([...rentals, rental])}
      />
    </div>
  );
}
