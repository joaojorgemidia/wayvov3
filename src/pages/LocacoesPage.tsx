import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { localToday } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Rental, Motorcycle, Client, FinancialEntry, OilChangeRecord } from "@/lib/types";
import { saveRentals, saveMotos, loadFinancial, saveFinancial, loadMotos, loadClients, loadRentals, saveClients } from "@/lib/store";
import { lastOilChange } from "@/lib/oil-kpis";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { resolveAssociations, AssociationContext } from "@/lib/financial-associations";
import { computeSemanaPeriodo } from "@/lib/cobranca-week-stats";
import { addWeeks, addDays, addMonths, isBefore, isEqual, parseISO, differenceInDays } from "date-fns";
import { useCompany } from "@/contexts/CompanyContext";
import { DEFAULT_COBRANCA_CONFIG } from "@/lib/companies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, FileText, Eye, Trash2, Pencil, XCircle, History, CheckCircle2, MoreHorizontal, Wallet, AlertTriangle, Flag, CalendarClock, Copy, Bike, EyeOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RentalWizard from "@/components/locacoes/RentalWizard";
import HistoricalRentalDialog from "@/components/locacoes/HistoricalRentalDialog";
import { toast } from "sonner";
import { ImportExportBar } from "@/components/ImportExportBar";
import { usePermissions } from "@/hooks/usePermissions";

const statusLabel: Record<string, string> = { ativa: "Ativa", finalizada: "Finalizada", cancelada: "Cancelada" };
const statusColor: Record<string, string> = { ativa: "bg-success/10 text-success", finalizada: "bg-muted text-muted-foreground", cancelada: "bg-destructive/10 text-destructive" };
const planoLabel: Record<string, string> = { aluguel: "Só Aluguel", moto_no_final: "Moto no Final" };

/**
 * Decide o que fazer com uma cobrança pendente de aluguel ao encerrar o contrato:
 * - período já totalmente usado (fim do período < data de encerramento) → preserva como está (dívida real, já vencida).
 * - período nem começou (início do período > data de encerramento) → remove (cobrança futura, contrato já não existe mais).
 * - contrato termina NO MEIO do período (pré ou pós-pago, tanto faz) → preserva e corrige o
 *   valor para diária real × dias efetivamente usados, sinalizando na observação.
 * Para categorias fora de aluguel (ou frequência não semanal, sem período calculável), usa
 * só a data de vencimento: vencida preserva, futura remove.
 * OBS: `valorDiario` no cadastro da locação guarda o valor do PERÍODO (semana), não de 1 dia
 * — a diária real é valorDiario / 7.
 */
function classifyPendenciaEncerramento(
  rental: Rental,
  entry: FinancialEntry,
  encerrarDataISO: string,
): { action: "preserve" | "remove"; novoValor?: number; nota?: string } {
  const dueStr = entry.dataPrevista || entry.data;
  if (!dueStr) return { action: "preserve" };
  const categoria = (entry.categoria || "").toLowerCase();
  if (categoria === "aluguel" && rental.frequenciaPagamento === "semanal" && (rental.valorDiario || 0) > 0) {
    const { inicio, fim } = computeSemanaPeriodo(rental, parseISO(dueStr));
    if (inicio && fim) {
      if (fim < encerrarDataISO) return { action: "preserve" };
      if (inicio > encerrarDataISO) return { action: "remove" };
      // Straddle: o contrato termina dentro do período desta cobrança.
      const diasUsados = Math.max(0, differenceInDays(parseISO(encerrarDataISO), parseISO(inicio)) + 1);
      const diariaReal = rental.valorDiario / 7;
      const novoValor = Math.round(Math.min(entry.valor, diariaReal * diasUsados) * 100) / 100;
      if (novoValor >= entry.valor) return { action: "preserve" };
      const dataFmt = new Date(encerrarDataISO + "T00:00:00").toLocaleDateString("pt-BR");
      const nota = `Cobrança recalculada ao encerrar o contrato (${dataFmt}): cobrando apenas ${diasUsados} diária${diasUsados !== 1 ? "s" : ""} (R$ ${diariaReal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/dia) até a data final do contrato, em vez do período completo.`;
      return { action: "preserve", novoValor, nota };
    }
  }
  return dueStr <= encerrarDataISO ? { action: "preserve" } : { action: "remove" };
}

// Calcula total de pagamentos esperados para o plano "Moto no Final"
function totalPagamentosEsperados(rental: Rental): number | null {
  if (!rental.tempoMinimoContrato || !rental.frequenciaPagamento) return null;
  const meses = rental.tempoMinimoContrato;
  if (rental.frequenciaPagamento === "semanal")    return Math.round(meses * 4.345);
  if (rental.frequenciaPagamento === "quinzenal")  return Math.round(meses * 2.17);
  if (rental.frequenciaPagamento === "mensal")     return meses;
  return null;
}

// Retorna alertas relevantes para exibição nas locações ativas
function computeContratoAlerta(
  rental: Rental,
  pagas: number,
): { tipo: "periodo_encerrado" | "ultima_parcela" | "plano_concluido"; texto: string; diasExpirado?: number } | null {
  const today = new Date().toISOString().slice(0, 10);

  if (rental.plano === "aluguel" || !rental.plano || (rental.plano !== "moto_no_final" && rental.plano !== "aluguel")) {
    // Só Aluguel (e qualquer plano não reconhecido): avisa quando período contratado terminou
    if (rental.dataFimContrato && today >= rental.dataFimContrato) {
      const dias = differenceInDays(new Date(today + "T00:00:00"), new Date(rental.dataFimContrato + "T00:00:00"));
      return { tipo: "periodo_encerrado", texto: "Período do contrato encerrado", diasExpirado: dias };
    }
  }

  if (rental.plano === "moto_no_final") {
    const total = totalPagamentosEsperados(rental);
    if (total != null) {
      if (pagas >= total) {
        return { tipo: "plano_concluido", texto: "Plano concluído" };
      }
      if (pagas === total - 1) {
        return { tipo: "ultima_parcela", texto: `Última parcela (${pagas + 1}/${total})` };
      }
    }
    // Também avisa pelo prazo de data fim
    if (rental.dataFimContrato && today >= rental.dataFimContrato) {
      const dias = differenceInDays(new Date(today + "T00:00:00"), new Date(rental.dataFimContrato + "T00:00:00"));
      return { tipo: "periodo_encerrado", texto: "Período do contrato encerrado", diasExpirado: dias };
    }
  }

  return null;
}

// Gera as cobranças de aluguel (semanal/quinzenal/mensal) + a parcela pro-rata final de um
// intervalo [startDate, endDate]. Extraído para ser reaproveitado tanto na regeneração
// completa (handleSaveRental) quanto na auto-renovação (useEffect de topUpAluguelCharges) —
// uma única fórmula evita o tipo de divergência já visto nas edge functions do Asaas quando
// a mesma conta era feita em dois lugares separados.
function buildAluguelCharges(params: {
  rental: Rental; client: Client; motoPlaca: string; numContrato: string; obsExtra: string;
  ctx: AssociationContext; aluguelSerieId: string; aluguelGroupId: string;
  startIdx: number; startDate: Date; endDate: Date;
  existingByDate: Map<string, FinancialEntry>; deletedDates: Set<string>;
  paidDates: Set<string>; isEditing: boolean; today: string;
}): FinancialEntry[] {
  const {
    rental, client, motoPlaca, numContrato, obsExtra, ctx, aluguelSerieId, aluguelGroupId,
    startDate, endDate, existingByDate, deletedDates, paidDates, isEditing, today,
  } = params;
  const out: FinancialEntry[] = [];
  const freq = rental.frequenciaPagamento;
  const prePaga = !!rental.cobrancaPrePaga;
  const freqLabel = freq === "semanal" ? "semana" : freq === "quinzenal" ? "quinzena" : "mês";
  const periodDays = freq === "semanal" ? 7 : freq === "quinzenal" ? 15 : 30;

  const advanceDate = (d: Date): Date => {
    if (freq === "semanal") return addWeeks(d, 1);
    if (freq === "quinzenal") return addDays(d, 15);
    return addMonths(d, 1);
  };
  const fmtBr = (d: Date) => d.toLocaleDateString("pt-BR");

  let current = startDate;
  let lastChargeDate = startDate;
  let idx = params.startIdx;
  while (isBefore(current, endDate) || isEqual(current, endDate)) {
    const dataStr = current.toISOString().split("T")[0];
    const periodStart = prePaga ? current : addDays(current, -periodDays);
    const periodEnd = prePaga ? addDays(current, periodDays - 1) : addDays(current, -1);
    const periodoTxt = `${fmtBr(periodStart)} a ${fmtBr(periodEnd)}`;
    const shouldGenerate = !isEditing || (dataStr >= today && !paidDates.has(dataStr));
    if (shouldGenerate) {
      const existing = existingByDate.get(dataStr);
      if (!deletedDates.has(dataStr)) {
        out.push(resolveAssociations({
          id: existing?.id ?? crypto.randomUUID(),
          tipo: "receita", categoria: "aluguel",
          serieId: existing?.serieId ?? aluguelSerieId,
          recurringGroupId: existing?.recurringGroupId ?? aluguelGroupId,
          descricao: `Aluguel ${idx}ª ${freqLabel} (${periodoTxt}) - ${numContrato} - ${motoPlaca}${obsExtra}`,
          valor: rental.valorDiario, data: dataStr, pago: false,
          dataPrevista: dataStr,
          motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
          placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
        }, ctx));
      }
    }
    lastChargeDate = current;
    current = advanceDate(current);
    idx++;
  }

  // Semana parcial: dias restantes entre a última cobrança e o fim do intervalo
  const remainingDays = differenceInDays(endDate, lastChargeDate);
  if (remainingDays > 0 && remainingDays < periodDays) {
    const proratedValue = parseFloat(((rental.valorDiario / periodDays) * remainingDays).toFixed(2));
    const dataStr = endDate.toISOString().split("T")[0];
    const partialStart = prePaga ? addDays(lastChargeDate, periodDays) : addDays(lastChargeDate, 1);
    const partialEnd = endDate;
    const periodoTxt = `${fmtBr(partialStart)} a ${fmtBr(partialEnd)}`;
    const shouldGenerate = !isEditing || (dataStr >= today && !paidDates.has(dataStr));
    if (shouldGenerate) {
      const existingPartial = existingByDate.get(dataStr);
      if (!deletedDates.has(dataStr)) {
        out.push(resolveAssociations({
          id: existingPartial?.id ?? crypto.randomUUID(),
          tipo: "receita", categoria: "aluguel",
          serieId: existingPartial?.serieId ?? aluguelSerieId,
          recurringGroupId: existingPartial?.recurringGroupId ?? aluguelGroupId,
          descricao: `Aluguel ${idx}ª ${freqLabel} (${periodoTxt}, ${remainingDays}d) - ${numContrato} - ${motoPlaca}${obsExtra}`,
          valor: proratedValue, data: dataStr, pago: false,
          dataPrevista: dataStr,
          motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
          placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
        }, ctx));
      }
    }
  }

  return out;
}

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

const MOTIVOS_TROCA_MOTO = [
  "Quebra / Pane mecânica",
  "Acidente / Sinistro",
  "Manutenção prolongada",
  "Solicitação do cliente",
  "Upgrade / Downgrade de plano",
  "Venda da moto anterior",
  "Outro",
];

function makeEmptyRental(defaults?: { multaAtraso?: number; jurosAtrasoMes?: number }): Rental {
  return {
    id: crypto.randomUUID(), motoId: "", clienteId: "", vendedor: "",
    dataInicio: localToday(), horaInicio: "08:00",
    dataFim: null, dataFimContrato: null, proximoPagamento: null,
    tempoMinimoContrato: null, frequenciaPagamento: "", cobrancaPrePaga: false,
    valorDiario: 0, valorCaucao: 0, caucaoPendente: false, caucaoParcelado: false, parcelasCaucao: [],
    multaAtraso: defaults?.multaAtraso ?? DEFAULT_COBRANCA_CONFIG.multaAtraso,
    jurosAtrasoMes: defaults?.jurosAtrasoMes ?? DEFAULT_COBRANCA_CONFIG.jurosMes,
    localRetirada: "", localDevolucao: "",
    kmInicio: 0, kmFim: null, nivelCombustivel: "", plano: "",
    raioCirculacao: "", seguroTerceiros: false,
    gerarCobrancaCaucao: true, gerarCobrancaPagamento: true,
    status: "ativa", checklistRetirada: [], checklistDevolucao: [],
    observacoes: "", createdAt: localToday(),
  };
}

export default function LocacoesPage() {
  const cache = useDataCacheSnapshot();
  const { activeCompany } = useCompany();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const motos = cache.motos;
  const clients = cache.clients;
  const [search, setSearch] = useState("");

  const cobrancaCfg = activeCompany?.cobrancaConfig ?? DEFAULT_COBRANCA_CONFIG;

  useEffect(() => { setRentals(cache.rentals); }, [cache.rentals]);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRental, setEditRental] = useState<Rental | null>(null);
  const [viewRental, setViewRental] = useState<Rental | null>(null);
  const [encerrarRental, setEncerrarRental] = useState<Rental | null>(null);
  const [historicalOpen, setHistoricalOpen] = useState(false);

  // Encerramento form
  const [encerrarMotivo, setEncerrarMotivo] = useState("");
  const [encerrarData, setEncerrarData] = useState(localToday());
  const [encerrarKmFim, setEncerrarKmFim] = useState("");
  const [encerrarObs, setEncerrarObs] = useState("");
  const [encerrarPendencias, setEncerrarPendencias] = useState<FinancialEntry[]>([]);
  const [encerrarSelectedIds, setEncerrarSelectedIds] = useState<Set<string>>(new Set());

  // Troca de moto (mesma locação continua, só o veículo muda)
  const [trocarMotoRental, setTrocarMotoRental] = useState<Rental | null>(null);
  const [trocarMotoNovaId, setTrocarMotoNovaId] = useState("");
  const [trocarMotoData, setTrocarMotoData] = useState(localToday());
  const [trocarMotoMotivo, setTrocarMotoMotivo] = useState("");
  const [trocarMotoKmAntiga, setTrocarMotoKmAntiga] = useState("");
  const [trocarMotoKmNova, setTrocarMotoKmNova] = useState("");
  const [trocarMotoObs, setTrocarMotoObs] = useState("");

  const { canCreate, canEdit, canDelete } = usePermissions();
  const navigate = useNavigate();
  const persist = (d: Rental[]) => { setRentals(d); saveRentals(d); };

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelection = (id: string) =>
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  // Simulação de troca de vencimento
  const [trocaVencimentoRental, setTrocaVencimentoRental] = useState<Rental | null>(null);
  const [novoDiaVencimento, setNovoDiaVencimento] = useState<number | null>(null);

  // Excluir individual (com modal)
  const [deleteTarget, setDeleteTarget] = useState<Rental | null>(null);

  // Ações em massa
  const [bulkFinalizarOpen, setBulkFinalizarOpen] = useState(false);
  const [bulkFinalizarData, setBulkFinalizarData] = useState(localToday());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const getMotoPlaca = (id: string) => motos.find(m => m.id === id)?.placa || "—";
  const getMotoModelo = (id: string) => motos.find(m => m.id === id)?.modelo || "—";

  // Auto-renovação: mantém um "estoque" de cobranças de aluguel geradas até 12 meses à
  // frente para locações ativas, sem depender de alguém abrir/salvar o assistente de edição.
  // Dispara quando só sobra 1 período (a "última parcela") de cobranças futuras já geradas.
  useEffect(() => {
    if (!cache.initialized || rentals.length === 0) return;
    const today = localToday();
    const novoHorizonte = addMonths(new Date(), 12);
    const novasEntradas: FinancialEntry[] = [];

    // Indexa uma vez só — evita filtrar o array inteiro de lançamentos para cada locação
    const aluguelPorRental = new Map<string, FinancialEntry[]>();
    for (const e of cache.financial) {
      if (e.categoria !== "aluguel" || !e.rentalId) continue;
      const arr = aluguelPorRental.get(e.rentalId);
      if (arr) arr.push(e); else aluguelPorRental.set(e.rentalId, [e]);
    }

    for (const rental of rentals) {
      if (rental.status !== "ativa" || !rental.gerarCobrancaPagamento || rental.valorDiario <= 0) continue;
      if (rental.plano === "moto_no_final") continue; // fim natural pelo nº de parcelas

      const aluguelDoRental = aluguelPorRental.get(rental.id) || [];
      const futuras = aluguelDoRental.filter(e => !e.pago && e.data >= today);
      if (futuras.length === 0) continue; // locação nova — handleSaveRental já cuida disso

      const maxDate = futuras.reduce((max, e) => (e.data > max ? e.data : max), futuras[0].data);
      const periodDays = rental.frequenciaPagamento === "quinzenal" ? 15 : rental.frequenciaPagamento === "mensal" ? 30 : 7;
      const diasRestantes = differenceInDays(parseISO(maxDate), parseISO(today));
      if (diasRestantes > periodDays) continue; // ainda sobra mais de um período — não precisa renovar ainda

      const advance = (d: Date): Date => {
        if (rental.frequenciaPagamento === "semanal") return addWeeks(d, 1);
        if (rental.frequenciaPagamento === "quinzenal") return addDays(d, 15);
        return addMonths(d, 1);
      };
      const startDate = advance(parseISO(maxDate));
      if (isBefore(novoHorizonte, startDate)) continue; // nada de novo a gerar nesse horizonte

      const client = clients.find(c => c.id === rental.clienteId);
      if (!client) continue;
      const motoPlaca = getMotoPlaca(rental.motoId);
      const numContrato = !rental.numero
        ? `#${rental.id.slice(0, 6).toUpperCase()}`
        : rental.createdAt >= "2026-06-01" ? `L${String(rental.numero).padStart(5, "0")}MV` : `#${String(rental.numero).padStart(5, "0")}`;
      const obsExtra = rental.observacoes ? ` - ${rental.observacoes}` : "";
      const ctx: AssociationContext = { motos, clients, rentals };
      const aluguelSerieId = `aluguel-${rental.id}`;
      const aluguelGroupId = aluguelDoRental.find(e => e.recurringGroupId)?.recurringGroupId ?? crypto.randomUUID();

      // Mapeia as cobranças de aluguel já existentes por data: se `startDate` (calculado
      // a partir de um `cache.financial` que pode estar momentaneamente desatualizado)
      // cair numa data que já tem cobrança gerada, buildAluguelCharges reaproveita o id
      // existente em vez de criar uma linha nova duplicada.
      const existingByDate = new Map(aluguelDoRental.map(e => [e.data, e]));

      // O número da semana/quinzena/mês tem que vir da DATA, nunca da contagem de
      // lançamentos existentes (`aluguelDoRental.length`) — excluir uma cobrança antiga
      // reduz essa contagem e fazia esse efeito renumerar as cobranças seguintes (ex.:
      // apagar a "Semana 10" virava a "Semana 11" em "Semana 10" na próxima geração).
      const prePaga = !!rental.cobrancaPrePaga;
      const advanceFromStart = (d: Date): Date => {
        if (rental.frequenciaPagamento === "semanal") return addWeeks(d, 1);
        if (rental.frequenciaPagamento === "quinzenal") return addDays(d, 15);
        return addMonths(d, 1);
      };
      const firstCharge = prePaga ? parseISO(rental.dataInicio) : advanceFromStart(parseISO(rental.dataInicio));
      const periodosDesdeInicio = Math.round(differenceInDays(startDate, firstCharge) / periodDays);
      const startIdxCalculado = Math.max(1, periodosDesdeInicio + 1);

      novasEntradas.push(...buildAluguelCharges({
        rental, client, motoPlaca, numContrato, obsExtra, ctx,
        aluguelSerieId, aluguelGroupId,
        startIdx: startIdxCalculado, startDate, endDate: novoHorizonte,
        existingByDate, deletedDates: new Set(),
        paidDates: new Set(), isEditing: false, today,
      }));
    }

    if (novasEntradas.length > 0) {
      saveFinancial([...loadFinancial(), ...novasEntradas]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache.initialized, rentals, cache.financial, motos, clients]);
  const getClientName = (id: string) => {
    const all = loadClients();
    return all.find(c => c.id === id)?.nome || clients.find(c => c.id === id)?.nome || "—";
  };
  const getRentalClientLabel = (r: Rental) => {
    if (r.clienteId) return getClientName(r.clienteId);
    if (r.vendedor && r.vendedor.trim()) return r.vendedor.trim();
    return "—";
  };

  const getNumero = (r: Rental) => {
    if (!r.numero) return `#${r.id.slice(0, 6).toUpperCase()}`;
    if (r.createdAt >= "2026-06-01") return `L${String(r.numero).padStart(5, "0")}MV`;
    return `#${String(r.numero).padStart(5, "0")}`;
  };

  const matchSearch = (r: Rental) =>
    !search ||
    getMotoPlaca(r.motoId).toLowerCase().includes(search.toLowerCase()) ||
    getRentalClientLabel(r).toLowerCase().includes(search.toLowerCase()) ||
    getNumero(r).toLowerCase().includes(search.toLowerCase());

  const ativas = useMemo(() => rentals.filter(r => r.status === "ativa" && matchSearch(r)), [rentals, search, motos, clients]);
  const finalizadas = useMemo(() => rentals.filter(r => (r.status === "finalizada" || r.status === "cancelada") && matchSearch(r)), [rentals, search, motos, clients]);

  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [emailSaving, setEmailSaving] = useState<Set<string>>(new Set());

  const handleSaveEmail = async (clientId: string) => {
    const email = (emailDrafts[clientId] || "").trim();
    if (!email || !email.includes("@")) { toast.error("E-mail inválido"); return; }
    setEmailSaving(prev => new Set(prev).add(clientId));
    try {
      const allClients = loadClients();
      const updated = allClients.map(c => c.id === clientId ? { ...c, email } : c);
      saveClients(updated);
      await supabase.from("clients").update({ email }).eq("id", clientId);
      setEmailDrafts(prev => { const n = { ...prev }; delete n[clientId]; return n; });
      toast.success("E-mail salvo");
    } catch {
      toast.error("Erro ao salvar e-mail");
    } finally {
      setEmailSaving(prev => { const n = new Set(prev); n.delete(clientId); return n; });
    }
  };

  const clientesSemEmail = useMemo(() => {
    const clientsMap = new Map(clients.map(c => [c.id, c]));
    const motosMap = new Map(motos.map(m => [m.id, m]));
    return rentals
      .filter(r => r.status === "ativa")
      .map(r => ({ rental: r, client: clientsMap.get(r.clienteId), moto: motosMap.get(r.motoId) }))
      .filter(({ client }) => !client?.email);
  }, [rentals, clients, motos]);

  const handleSaveRental = async (rental: Rental, client: Client) => {
    const allClients = loadClients();
    if (!allClients.find(c => c.id === client.id)) {
      // Client will be added through saveClients in the wizard
    }

    const motoPlaca = getMotoPlaca(rental.motoId);
    const allMotosForCtx = loadMotos();
    const allRentals = loadRentals();
    const ctx = { motos: allMotosForCtx, clients: [...allClients, client], rentals: [...allRentals, rental] };

    const isEditing = !!rentals.find(r => r.id === rental.id);

    // Load financial entries ONCE and accumulate all changes before a single save.
    // saveFn now updates the cache synchronously at call time, but a single
    // consolidated save is still safer and produces a cleaner diff.
    const currentFinancial = loadFinancial();

    // On edit: preserve past entries (paid or unpaid) — only future unpaid entries
    // are removed and regenerated so gaps are filled without touching history.
    // Future pending entries are merged by date so their IDs are preserved
    // (no duplicate or broken series when re-saving with updated values).
    const today = localToday();

    // Dates the user explicitly deleted (soft-deleted in DB) — reconciler must not regenerate them.
    const deletedAluguelDates = new Set<string>();
    if (isEditing) {
      const { data: deletedRows } = await supabase
        .from("financial_entries")
        .select("data")
        .eq("rental_id", rental.id)
        .eq("categoria", "aluguel")
        .not("deleted_at", "is", null);
      deletedRows?.forEach(r => r.data && deletedAluguelDates.add(r.data));
    }

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

    const numContrato = !rental.numero ? `#${rental.id.slice(0, 6).toUpperCase()}` : rental.createdAt >= "2026-06-01" ? `L${String(rental.numero).padStart(5, "0")}MV` : `#${String(rental.numero).padStart(5, "0")}`;
    const obsExtra = rental.observacoes ? ` - ${rental.observacoes}` : "";

    const caucaoJaExiste = isEditing && baseEntries.some(e => e.rentalId === rental.id && e.categoria === "caucao");

    if (!caucaoJaExiste && rental.gerarCobrancaCaucao && rental.valorCaucao > 0 && !rental.caucaoParcelado) {
      newFinancialEntries.push(resolveAssociations({
        id: crypto.randomUUID(), tipo: "receita", categoria: "caucao",
        descricao: `Caução - ${numContrato} - ${motoPlaca}${obsExtra}`,
        valor: rental.valorCaucao, data: rental.dataInicio, pago: false,
        motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
        placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
      }, ctx));
    }

    if (!caucaoJaExiste && rental.gerarCobrancaCaucao && rental.caucaoParcelado) {
      const caucaoSerieId = `caucao-${rental.id}`;
      const totalParcelas = rental.parcelasCaucao.length;
      rental.parcelasCaucao.forEach((p, pIdx) => {
        newFinancialEntries.push(resolveAssociations({
          id: crypto.randomUUID(), tipo: "receita" as const, categoria: "caucao",
          subcategoria: "Parcela",
          serieId: caucaoSerieId,
          descricao: `Caução - Parcela ${pIdx + 1}/${totalParcelas} - ${numContrato} - ${motoPlaca}${obsExtra}`,
          valor: p.valor, data: p.data, pago: p.status === "recebido",
          dataPrevista: p.data,
          motoId: rental.motoId, rentalId: rental.id, clienteId: client.id,
          placa: motoPlaca, clienteNome: client.nome, natureza: "operacional",
        }, ctx));
      });
    }

    if (rental.gerarCobrancaPagamento && rental.valorDiario > 0 && rental.dataFimContrato) {
      const startDate = parseISO(rental.dataInicio);
      const contratoEnd = parseISO(rental.dataFimContrato);
      // Locações continuam gerando cobrança além do fim do contrato enquanto ativas — só
      // "Moto no Final" tem fim natural pelo nº de parcelas (mesmo critério de computeContratoAlerta).
      const horizonte12m = addMonths(new Date(), 12);
      const endDate = rental.plano !== "moto_no_final" && rental.status === "ativa"
        ? (contratoEnd > horizonte12m ? contratoEnd : horizonte12m)
        : contratoEnd;
      const prePaga = !!rental.cobrancaPrePaga;
      const aluguelSerieId = `aluguel-${rental.id}`;

      // Datas com entrada paga já estão em baseEntries — não duplicar
      const paidAluguelDates = new Set(
        baseEntries
          .filter(e => e.rentalId === rental.id && e.categoria === "aluguel" && e.pago)
          .map(e => e.data),
      );

      // Pré-pago: 1ª cobrança vence na data de início (cobre [início, início+período-1]).
      // Pós-pago: 1ª cobrança vence em início+período (cobre [início, início+período-1]).
      const advanceFromStart = (d: Date): Date => {
        if (rental.frequenciaPagamento === "semanal") return addWeeks(d, 1);
        if (rental.frequenciaPagamento === "quinzenal") return addDays(d, 15);
        return addMonths(d, 1);
      };
      const firstCharge = prePaga ? startDate : advanceFromStart(startDate);

      newFinancialEntries.push(...buildAluguelCharges({
        rental, client, motoPlaca, numContrato, obsExtra, ctx,
        aluguelSerieId, aluguelGroupId,
        startIdx: 1, startDate: firstCharge, endDate,
        existingByDate: existingAluguelByDate, deletedDates: deletedAluguelDates,
        paidDates: paidAluguelDates, isEditing, today,
      }));
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

    const currentRentals = loadRentals();
    const exists = currentRentals.find(r => r.id === rental.id);
    if (exists) persist(currentRentals.map(r => r.id === rental.id ? rental : r));
    else persist([...currentRentals, rental]);

    setDialogOpen(false);
    setEditRental(null);
  };

  const openEncerrar = (r: Rental) => {
    setEncerrarRental(r);
    setEncerrarMotivo("");
    const hoje = localToday();
    setEncerrarData(hoje);
    setEncerrarKmFim(r.kmFim ? String(r.kmFim) : "");
    setEncerrarObs("");
    const pendentes = loadFinancial().filter(e => e.rentalId === r.id && e.tipo === "receita" && !e.pago && !e.ignorada);
    pendentes.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
    setEncerrarPendencias(pendentes);
    // Padrão: só marca para exclusão as cobranças "futuras" (período ainda não alcançado
    // pela data de encerramento). Vencidas e a cobrança que abrange a data de encerramento
    // ficam desmarcadas (preservadas) — o usuário ainda pode marcar manualmente se quiser.
    const toSelect = pendentes.filter(e => classifyPendenciaEncerramento(r, e, hoje).action === "remove");
    setEncerrarSelectedIds(new Set(toSelect.map(e => e.id)));
  };

  const ASAAS_TERMINAL = ["RECEIVED", "CANCELLED", "REFUNDED", "REFUND_REQUESTED"];
  const cancelAsaasEntries = async (entriesToCancel: FinancialEntry[]) => {
    const cancellable = entriesToCancel.filter(e => !!e.asaasPaymentId && !ASAAS_TERMINAL.includes(e.asaasStatus || ""));
    if (cancellable.length === 0) return;
    const results = await Promise.allSettled(
      cancellable.map(e =>
        supabase.functions.invoke("asaas-cancel-payment", {
          body: { asaasPaymentId: e.asaasPaymentId, companyId: activeCompany?.id },
        }),
      ),
    );
    const failures = results.filter(r => r.status === "fulfilled" && r.value.error).length
      + results.filter(r => r.status === "rejected").length;
    if (failures > 0) {
      toast.warning(`${failures} boleto(s) não puderam ser cancelados no Asaas — cancele manualmente lá.`);
    }
  };

  const confirmEncerrar = async () => {
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
    persist(loadRentals().map(x => x.id === encerrarRental.id ? updated : x));

    if (encerrarRental.motoId) {
      const allMotos = loadMotos();
      const updatedMotos = allMotos.map(m => m.id === encerrarRental.motoId ? { ...m, status: "disponivel" as const } : m);
      saveMotos(updatedMotos);
    }

    const allEntries = loadFinancial();

    // ── Ao encerrar: preserva vencidas, exclui futuras, corrige a cobrança que
    // abrange a data de encerramento (pré ou pós-pago) para cobrar só os dias
    // usados. A cobrança corrigida nunca é excluída, mesmo se estava marcada —
    // depois de corrigida, ela É a cobrança certa a receber.
    let ajusteCount = 0;
    const forcedPreserveIds = new Set<string>();
    const entriesBase = allEntries.map(e => {
      if (e.rentalId !== encerrarRental.id || e.tipo !== "receita" || e.pago || e.ignorada) return e;
      const cls = classifyPendenciaEncerramento(encerrarRental, e, encerrarData);
      if (cls.action === "preserve" && cls.novoValor != null) {
        forcedPreserveIds.add(e.id);
        ajusteCount++;
        return { ...e, valor: cls.novoValor, observacao: [e.observacao, cls.nota].filter(Boolean).join(" — ") };
      }
      return e;
    });

    // Excluir apenas as pendências selecionadas pelo usuário
    const toRemove = entriesBase.filter(e => encerrarSelectedIds.has(e.id) && !forcedPreserveIds.has(e.id));
    const remaining = entriesBase.filter(e => !encerrarSelectedIds.has(e.id) || forcedPreserveIds.has(e.id));
    const removedCount = toRemove.length;
    if (removedCount > 0) {
      await cancelAsaasEntries(toRemove);
    }
    if (removedCount > 0 || ajusteCount > 0) {
      saveFinancial(remaining);
    }

    toast.success(
      [
        "Locação encerrada.",
        removedCount > 0 ? `${removedCount} cobrança(s) pendente(s) removida(s).` : "",
        ajusteCount > 0 ? `${ajusteCount} cobrança(s) recalculada(s) pró-rata.` : "",
      ].filter(Boolean).join(" "),
    );
    setEncerrarRental(null);
    setEncerrarPendencias([]);
    setEncerrarSelectedIds(new Set());
  };

  const openTrocarMoto = (r: Rental) => {
    setTrocarMotoRental(r);
    setTrocarMotoNovaId("");
    setTrocarMotoData(localToday());
    setTrocarMotoMotivo("");
    const moto = motos.find(m => m.id === r.motoId);
    setTrocarMotoKmAntiga(moto?.kmAtual ? String(moto.kmAtual) : "");
    setTrocarMotoKmNova("");
    setTrocarMotoObs("");
  };

  // Motos disponíveis para receber a locação (exclui a moto atual da própria locação)
  const motosDisponiveisParaTroca = trocarMotoRental
    ? motos.filter(m => m.status === "disponivel" && m.id !== trocarMotoRental.motoId)
    : [];

  const confirmTrocarMoto = async () => {
    if (!trocarMotoRental) return;
    if (!trocarMotoNovaId) { toast.error("Selecione a nova moto"); return; }
    if (!trocarMotoMotivo) { toast.error("Selecione o motivo da troca"); return; }
    if (!trocarMotoData) { toast.error("Informe a data da troca"); return; }

    const motoAntiga = motos.find(m => m.id === trocarMotoRental.motoId);
    const motoNova = motos.find(m => m.id === trocarMotoNovaId);
    if (!motoNova) { toast.error("Moto selecionada não encontrada"); return; }

    const placaAntiga = motoAntiga?.placa || "—";
    const placaNova = motoNova.placa || "—";
    const today = localToday();

    // 1) Registra a narrativa da troca nas observações da locação (mesmo padrão do encerramento)
    // e atualiza o veículo vinculado — a locação em si continua a mesma.
    const obsBlock = [
      `--- Troca de Moto ---`,
      `De: ${placaAntiga} (${motoAntiga?.modelo || "—"}) → Para: ${placaNova} (${motoNova.modelo || "—"})`,
      `Data: ${new Date(trocarMotoData + "T00:00:00").toLocaleDateString("pt-BR")}`,
      `Motivo: ${trocarMotoMotivo}`,
      trocarMotoKmAntiga ? `KM final (moto anterior): ${trocarMotoKmAntiga}` : "",
      trocarMotoKmNova ? `KM inicial (moto nova): ${trocarMotoKmNova}` : "",
      trocarMotoObs ? `Obs: ${trocarMotoObs}` : "",
    ].filter(Boolean).join("\n");

    const updatedRental: Rental = {
      ...trocarMotoRental,
      motoId: trocarMotoNovaId,
      observacoes: [trocarMotoRental.observacoes, obsBlock].filter(Boolean).join("\n"),
    };
    persist(loadRentals().map(r => r.id === trocarMotoRental.id ? updatedRental : r));

    // 2) Atualiza as duas motos: a antiga volta a ficar disponível, a nova passa a "alugada"
    // (mesmo padrão explícito usado em handleSaveRental/confirmEncerrar — não depende do
    // efeito de sincronização de MotosPage, que só roda com a página aberta).
    const kmAntigaNum = trocarMotoKmAntiga ? Number(trocarMotoKmAntiga) : null;
    const kmNovaNum = trocarMotoKmNova ? Number(trocarMotoKmNova) : null;
    const allMotos = loadMotos();
    const updatedMotos = allMotos.map(m => {
      if (m.id === trocarMotoRental.motoId) {
        const updates: Partial<Motorcycle> = { status: "disponivel" as const };
        if (kmAntigaNum && (!m.kmAtual || m.kmAtual < kmAntigaNum)) updates.kmAtual = kmAntigaNum;
        return { ...m, ...updates };
      }
      if (m.id === trocarMotoNovaId) {
        const updates: Partial<Motorcycle> = { status: "alugada" as const };
        if (kmNovaNum) {
          const lastChange = lastOilChange(m);
          if (!lastChange || lastChange.km < kmNovaNum) {
            updates.historicoOleo = [...(m.historicoOleo || []), { id: crypto.randomUUID(), data: trocarMotoData, km: kmNovaNum } as OilChangeRecord];
          }
          if (!m.kmAtual || m.kmAtual < kmNovaNum) updates.kmAtual = kmNovaNum;
        }
        return { ...m, ...updates };
      }
      return m;
    });
    saveMotos(updatedMotos);

    // 3) Lançamentos financeiros: "o que passou não mexe" — só cobranças ainda não vencidas
    // (pendentes, com vencimento hoje ou no futuro) passam a referenciar a moto nova.
    const allEntries = loadFinancial();
    let atualizados = 0;
    const updatedEntries = allEntries.map(e => {
      if (e.rentalId !== trocarMotoRental.id) return e;
      if (e.pago) return e;
      const vencimento = e.dataPrevista || e.data;
      if (!vencimento || vencimento < today) return e;
      atualizados++;
      return {
        ...e,
        motoId: trocarMotoNovaId,
        placa: placaNova,
        descricao: placaAntiga !== "—" ? e.descricao.split(placaAntiga).join(placaNova) : e.descricao,
      };
    });
    if (atualizados > 0) saveFinancial(updatedEntries);

    toast.success(
      `Moto trocada: ${placaAntiga} → ${placaNova}.` +
      (atualizados > 0 ? ` ${atualizados} cobrança(s) futura(s) atualizada(s).` : ""),
    );
    setTrocarMotoRental(null);
  };

  const handleDelete = async (rental: Rental) => {
    persist(loadRentals().filter(r => r.id !== rental.id));
    const allEntries = loadFinancial();
    const toRemove = allEntries.filter(e => e.rentalId === rental.id);
    const remaining = allEntries.filter(e => e.rentalId !== rental.id);
    if (toRemove.length > 0) {
      await cancelAsaasEntries(toRemove);
      saveFinancial(remaining);
    }
    if (rental.status === "ativa" && rental.motoId) {
      const allMotos = loadMotos();
      saveMotos(allMotos.map(m => m.id === rental.motoId ? { ...m, status: "disponivel" as const } : m));
    }
    setSelectedIds(prev => { const next = new Set(prev); next.delete(rental.id); return next; });
    setDeleteTarget(null);
    toast.success("Locação excluída.");
  };

  const handleBulkFinalizar = () => {
    const toFinalize = rentals.filter(r => selectedIds.has(r.id) && r.status === "ativa");
    if (!toFinalize.length) { toast.error("Nenhuma locação ativa selecionada."); return; }
    const motoIds = toFinalize.map(r => r.motoId).filter(Boolean);
    persist(loadRentals().map(r => selectedIds.has(r.id) && r.status === "ativa"
      ? { ...r, status: "finalizada" as const, dataFim: bulkFinalizarData } : r));
    if (motoIds.length > 0) {
      const allMotos = loadMotos();
      saveMotos(allMotos.map(m => motoIds.includes(m.id) ? { ...m, status: "disponivel" as const } : m));
    }
    setSelectedIds(new Set());
    setBulkFinalizarOpen(false);
    toast.success(`${toFinalize.length} locação(ões) finalizada(s).`);
  };

  const handleBulkSetCobranca = (prePaga: boolean) => {
    const targets = rentals.filter(r => selectedIds.has(r.id));
    if (!targets.length) { toast.error("Nenhuma locação selecionada."); return; }
    persist(loadRentals().map(r => selectedIds.has(r.id) ? { ...r, cobrancaPrePaga: prePaga } : r));
    setSelectedIds(new Set());
    toast.success(`${targets.length} locação(ões) marcada(s) como ${prePaga ? "Pré-paga" : "Pós-paga"}.`);
  };

  const handleBulkDelete = async () => {
    const toDelete = rentals.filter(r => selectedIds.has(r.id));
    const activeMotoIds = toDelete.filter(r => r.status === "ativa").map(r => r.motoId).filter(Boolean);
    const deleteIds = new Set(toDelete.map(r => r.id));
    persist(loadRentals().filter(r => !deleteIds.has(r.id)));
    const allEntries = loadFinancial();
    const toRemove = allEntries.filter(e => deleteIds.has(e.rentalId || ""));
    const remaining = allEntries.filter(e => !deleteIds.has(e.rentalId || ""));
    if (toRemove.length > 0) {
      await cancelAsaasEntries(toRemove);
      saveFinancial(remaining);
    }
    if (activeMotoIds.length > 0) {
      const allMotos = loadMotos();
      saveMotos(allMotos.map(m => activeMotoIds.includes(m.id) ? { ...m, status: "disponivel" as const } : m));
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    toast.success(`${toDelete.length} locação(ões) excluída(s).`);
  };

  const openEdit = (r: Rental) => {
    setEditRental(r);
    setDialogOpen(true);
  };

  const RentalTable = ({ data, showActions }: { data: Rental[]; showActions: "ativa" | "finalizada" }) => {
    const allSelected = data.length > 0 && data.every(r => selectedIds.has(r.id));
    const someSelected = data.some(r => selectedIds.has(r.id));
    const toggleAll = () => {
      if (allSelected) {
        setSelectedIds(prev => { const next = new Set(prev); data.forEach(r => next.delete(r.id)); return next; });
      } else {
        setSelectedIds(prev => { const next = new Set(prev); data.forEach(r => next.add(r.id)); return next; });
      }
    };
    // Conta semanas de aluguel pagas vs pendentes por locação
    const semanasPorRental = (() => {
      const m = new Map<string, { pagas: number; pendentes: number }>();
      for (const e of cache.financial) {
        if (e.categoria !== "aluguel" || !e.rentalId) continue;
        const cur = m.get(e.rentalId) || { pagas: 0, pendentes: 0 };
        if (e.pago) cur.pagas += 1; else cur.pendentes += 1;
        m.set(e.rentalId, cur);
      }
      return m;
    })();
    // Total pendente por locação — usado no selo de contratos encerrados com cobranças
    // ocultadas da fila de Pagamentos (ver CobrancasSemanaPage.tsx).
    const pendenteTotalPorRental = (() => {
      const m = new Map<string, number>();
      for (const e of cache.financial) {
        if (e.tipo !== "receita" || e.pago || !e.rentalId) continue;
        m.set(e.rentalId, (m.get(e.rentalId) || 0) + (e.valor || 0));
      }
      return m;
    })();
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="w-[90px]">Nº</TableHead>
              <TableHead className="w-[90px]">Placa</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim Contrato</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-center" title="Semanas pagas / pendentes">Pagas/Pend.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma locação encontrada
                </TableCell>
              </TableRow>
            ) : data.map(r => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewRental(r)}>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelection(r.id)} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{getNumero(r)}</TableCell>
                <TableCell className="font-mono font-bold text-xs">{getMotoPlaca(r.motoId)}</TableCell>
                <TableCell className="text-xs">{getRentalClientLabel(r)}</TableCell>
                <TableCell className="text-xs">
                  <div className="space-y-0.5">
                    <div>{planoLabel[r.plano] || r.plano || "—"}</div>
                    {r.status === "ativa" && (() => {
                      const s = semanasPorRental.get(r.id) || { pagas: 0, pendentes: 0 };
                      const alerta = computeContratoAlerta(r, s.pagas);
                      if (!alerta) return null;
                      const isRed = alerta.tipo === "plano_concluido" || alerta.tipo === "ultima_parcela";
                      return (
                        <div className={`flex items-center gap-1 text-[10px] font-medium ${isRed ? "text-amber-600" : "text-orange-600"}`}>
                          {alerta.tipo === "ultima_parcela" || alerta.tipo === "plano_concluido"
                            ? <Flag className="h-3 w-3 shrink-0" />
                            : <AlertTriangle className="h-3 w-3 shrink-0" />}
                          {alerta.texto}
                          {alerta.diasExpirado != null && alerta.diasExpirado > 0 && ` (há ${alerta.diasExpirado}d)`}
                        </div>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{(() => { const d = new Date(r.dataInicio + "T00:00:00"); const dias = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]; return `${dias[d.getDay()]} ${d.toLocaleDateString("pt-BR")}`; })()}</TableCell>
                <TableCell className="text-xs">{(() => {
                  if (r.status === "ativa") {
                    const d = r.dataFimContrato;
                    return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
                  }
                  const fim = r.dataFim;
                  const contrato = r.dataFimContrato;
                  const fimAnticipado = fim && contrato && fim !== contrato;
                  return (
                    <div className="flex flex-col gap-0.5">
                      <span>{fim ? new Date(fim + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                      {fimAnticipado && (
                        <span className="text-[10px] text-muted-foreground">Contrato: {new Date(contrato + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      )}
                    </div>
                  );
                })()}</TableCell>
                <TableCell className="text-xs text-right font-medium">R$ {r.valorDiario.toFixed(2)}</TableCell>
                <TableCell className="text-xs text-center">
                  {(() => {
                    const s = semanasPorRental.get(r.id) || { pagas: 0, pendentes: 0 };
                    return (
                      <span className="font-mono">
                        <span className="text-success">{s.pagas}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className={s.pendentes > 0 ? "text-warning" : "text-muted-foreground"}>{s.pendentes}</span>
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[r.status]}`}>
                      {statusLabel[r.status]}
                    </span>
                    {r.status !== "ativa" && r.pagamentosOcultos && (pendenteTotalPorRental.get(r.id) || 0) > 0 && (
                      <button
                        title="Cobrança oculta da fila de Pagamentos — clique para ver e resolver"
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/cobrancas/semana?cliente=${r.clienteId}`);
                        }}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        <EyeOff className="h-2.5 w-2.5" />
                        R$ {(pendenteTotalPorRental.get(r.id) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pendente
                      </button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Ver detalhes" onClick={() => setViewRental(r)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {showActions === "ativa" && canEdit && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar locação" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {showActions === "ativa" && canEdit && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                        title="Trocar moto"
                        onClick={() => openTrocarMoto(r)}
                      >
                        <Bike className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {showActions === "ativa" && canEdit && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Encerrar locação (completo)"
                        onClick={() => openEncerrar(r)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {showActions === "ativa" && r.frequenciaPagamento === "semanal" && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                        title="Simular troca de vencimento"
                        onClick={() => { setTrocaVencimentoRental(r); setNovoDiaVencimento(null); }}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Excluir locação"
                        onClick={() => setDeleteTarget(r)}
                      >
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
  };

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

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} locação(ões) selecionada(s)</span>
          <div className="flex gap-2 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <MoreHorizontal className="h-3.5 w-3.5" /> Ações em massa
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Cobrança</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleBulkSetCobranca(true)} className="gap-2">
                  <Wallet className="h-4 w-4" /> Marcar como Pré-paga
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkSetCobranca(false)} className="gap-2">
                  <Wallet className="h-4 w-4" /> Marcar como Pós-paga
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => { setBulkFinalizarData(localToday()); setBulkFinalizarOpen(true); }}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" /> Finalizar selecionadas
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setBulkDeleteOpen(true)}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Excluir selecionadas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {clientesSemEmail.length > 0 && (
        <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex-1">
              {clientesSemEmail.length} locatário{clientesSemEmail.length !== 1 ? "s" : ""} sem e-mail cadastrado
            </span>
            <span className="text-xs text-orange-600/80 dark:text-orange-500">Boleto Asaas bloqueado</span>
          </div>
          <div className="border-t border-orange-200 dark:border-orange-800 divide-y divide-orange-100 dark:divide-orange-900">
            {clientesSemEmail.map(({ rental, client, moto }) => {
              const clientId = client?.id || "";
              const draft = emailDrafts[clientId] ?? "";
              const saving = emailSaving.has(clientId);
              return (
                <div key={rental.id} className="flex items-center gap-3 px-4 py-2.5 bg-background/60">
                  <div className="min-w-0 w-36 shrink-0">
                    <span className="text-sm font-medium truncate block">{client?.nome || "—"}</span>
                    {moto && (
                      <span className="font-mono text-[10px] bg-muted border border-border/50 rounded px-1.5 py-px text-muted-foreground">
                        {moto.placa}
                      </span>
                    )}
                  </div>
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={draft}
                    onChange={e => setEmailDrafts(prev => ({ ...prev, [clientId]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleSaveEmail(clientId)}
                    className="h-8 text-sm flex-1"
                    disabled={saving}
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 shrink-0"
                    disabled={saving || !draft.includes("@")}
                    onClick={() => handleSaveEmail(clientId)}
                  >
                    {saving ? "Salvando…" : "Salvar"}
                  </Button>
                  {client?.telefone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 shrink-0 gap-1.5"
                      title="Copiar telefone"
                      onClick={() => {
                        navigator.clipboard.writeText(client.telefone);
                        toast.success("Telefone copiado");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Telefone
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            rental={editRental || makeEmptyRental({ multaAtraso: cobrancaCfg.multaAtraso, jurosAtrasoMes: cobrancaCfg.jurosMes })}
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

      {/* Trocar Moto — a locação continua a mesma, só o veículo muda */}
      <Dialog open={!!trocarMotoRental} onOpenChange={() => setTrocarMotoRental(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Bike className="h-5 w-5" />
              Trocar Moto {trocarMotoRental ? getNumero(trocarMotoRental) : ""}
            </DialogTitle>
          </DialogHeader>
          {trocarMotoRental && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Moto atual:</span> <span className="font-mono font-bold">{getMotoPlaca(trocarMotoRental.motoId)}</span> — {getMotoModelo(trocarMotoRental.motoId)}</p>
                <p><span className="text-muted-foreground">Cliente:</span> {getRentalClientLabel(trocarMotoRental)}</p>
              </div>

              <div className="space-y-2">
                <Label>Nova moto *</Label>
                <Select value={trocarMotoNovaId} onValueChange={setTrocarMotoNovaId}>
                  <SelectTrigger>
                    <SelectValue placeholder={motosDisponiveisParaTroca.length ? "Selecione a moto" : "Nenhuma moto disponível"} />
                  </SelectTrigger>
                  <SelectContent>
                    {motosDisponiveisParaTroca.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.placa} — {m.modelo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {motosDisponiveisParaTroca.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma moto com status "disponível" na frota no momento.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Motivo da troca *</Label>
                <Select value={trocarMotoMotivo} onValueChange={setTrocarMotoMotivo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_TROCA_MOTO.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label>Data da troca *</Label>
                  <Input type="date" value={trocarMotoData} onChange={e => setTrocarMotoData(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>KM final (moto anterior)</Label>
                  <Input type="number" placeholder="Ex: 45000" value={trocarMotoKmAntiga} onChange={e => setTrocarMotoKmAntiga(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>KM inicial (moto nova)</Label>
                  <Input type="number" placeholder="Ex: 12000" value={trocarMotoKmNova} onChange={e => setTrocarMotoKmNova(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Detalhes sobre a troca..." value={trocarMotoObs} onChange={e => setTrocarMotoObs(e.target.value)} rows={3} />
              </div>

              <p className="text-xs text-muted-foreground border-t pt-2">
                A moto atual volta a ficar disponível na frota. Cobranças já pagas ou já vencidas
                não são alteradas — só as cobranças futuras desta locação passam a referenciar a
                moto nova.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrocarMotoRental(null)}>Cancelar</Button>
            <Button onClick={confirmTrocarMoto} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Bike className="h-4 w-4" /> Confirmar Troca
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
                <div><span className="text-muted-foreground">Plano:</span> {planoLabel[viewRental.plano] || viewRental.plano}
                  {viewRental.status === "ativa" && (() => {
                    const financial = cache.financial;
                    const pagasView = financial.filter(e => e.categoria === "aluguel" && e.rentalId === viewRental.id && e.pago).length;
                    const alerta = computeContratoAlerta(viewRental, pagasView);
                    if (!alerta) return null;
                    const isFlag = alerta.tipo === "ultima_parcela" || alerta.tipo === "plano_concluido";
                    return (
                      <span className={`ml-2 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${isFlag ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"}`}>
                        {isFlag ? <Flag className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {alerta.texto}
                        {alerta.diasExpirado != null && alerta.diasExpirado > 0 && ` · ${alerta.diasExpirado}d`}
                      </span>
                    );
                  })()}
                </div>
                <div><span className="text-muted-foreground">Início:</span> {new Date(viewRental.dataInicio + "T00:00:00").toLocaleDateString("pt-BR")} {viewRental.horaInicio}</div>
                <div><span className="text-muted-foreground">Fim contrato:</span> {viewRental.dataFimContrato ? new Date(viewRental.dataFimContrato + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
                {viewRental.status !== "ativa" && viewRental.dataFim && viewRental.dataFim !== viewRental.dataFimContrato && (
                  <div><span className="text-muted-foreground">Encerrado em:</span> <span className="text-amber-600 font-medium">{new Date(viewRental.dataFim + "T00:00:00").toLocaleDateString("pt-BR")}</span> <span className="text-[10px] text-muted-foreground">(antecipado)</span></div>
                )}
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
                    <Button variant="outline" size="sm" className="gap-1 text-blue-600 border-blue-200 hover:text-blue-700" onClick={() => { setViewRental(null); openTrocarMoto(viewRental); }}>
                      <Bike className="h-3.5 w-3.5" /> Trocar Moto
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

      {/* Excluir Locação (individual) */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Excluir Locação {deleteTarget ? getNumero(deleteTarget) : ""}
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Placa:</span> <span className="font-mono font-bold">{getMotoPlaca(deleteTarget.motoId)}</span></p>
                <p><span className="text-muted-foreground">Cliente:</span> {getRentalClientLabel(deleteTarget)}</p>
              </div>
              <p className="text-sm text-destructive font-medium">
                Esta ação é irreversível. O registro e todos os lançamentos financeiros associados serão removidos permanentemente.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" className="gap-2" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              <Trash2 className="h-4 w-4" /> Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalizar selecionadas (em massa) */}
      <Dialog open={bulkFinalizarOpen} onOpenChange={setBulkFinalizarOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Finalizar {selectedIds.size} locação(ões)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Data de encerramento</Label>
            <Input type="date" value={bulkFinalizarData} onChange={e => setBulkFinalizarData(e.target.value)} />
            <p className="text-xs text-muted-foreground">Somente locações ativas serão finalizadas.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkFinalizarOpen(false)}>Cancelar</Button>
            <Button className="gap-2" onClick={handleBulkFinalizar}>
              <CheckCircle2 className="h-4 w-4" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir selecionadas (em massa) */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Excluir {selectedIds.size} locação(ões)
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-destructive font-medium">
            Esta ação é irreversível. Os {selectedIds.size} registro(s) e todos os lançamentos financeiros associados serão removidos permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" className="gap-2" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4" /> Excluir {selectedIds.size} registro(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historical (encerrada) rental quick-add */}
      <HistoricalRentalDialog
        open={historicalOpen}
        onOpenChange={setHistoricalOpen}
        motos={motos}
        clients={clients}
        onSaved={(rental) => persist([...loadRentals(), rental])}
      />

      {/* Simulação de Troca de Vencimento */}
      {(() => {
        const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const DIAS_FULL  = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

        const r = trocaVencimentoRental;
        const todayIso = localToday();
        const today = new Date(); today.setHours(0, 0, 0, 0);

        // Usa o primeiro pagamento pendente ou em atraso como referência
        const nextPending = r
          ? cache.financial
              .filter(e => e.rentalId === r.id && e.categoria === "aluguel" && !e.pago)
              .sort((a, b) => a.data.localeCompare(b.data))[0]
          : null;

        let refDate: Date | null = null;
        if (nextPending) {
          refDate = new Date(nextPending.data + "T00:00:00");
        } else {
          const fallbackStr = r?.proximoPagamento || r?.dataInicio;
          refDate = fallbackStr ? new Date(fallbackStr + "T00:00:00") : null;
          if (refDate && refDate < today) {
            while (refDate < today) refDate = addDays(refDate, 7);
          }
        }

        const diaAtual = refDate ? refDate.getDay() : null;

        // Juros e multa por atraso — lidos da própria locação (definidos no contrato)
        const isOverdue = !!nextPending && nextPending.data < todayIso;
        const diasAtraso = isOverdue
          ? differenceInDays(new Date(todayIso + "T00:00:00"), new Date(nextPending!.data + "T00:00:00"))
          : 0;
        const multa = isOverdue && r ? r.multaAtraso : 0;
        // jurosAtrasoMes é % ao mês → taxa diária = %/100/30
        const taxaDiaria = r ? r.jurosAtrasoMes / 100 / 30 : 0;
        const juros = isOverdue && r ? r.valorDiario * taxaDiaria * diasAtraso : 0;

        const forwardDiff = (novoDiaVencimento !== null && diaAtual !== null && novoDiaVencimento !== diaAtual)
          ? (novoDiaVencimento - diaAtual + 7) % 7
          : null;

        const calc = (r && refDate && forwardDiff !== null && forwardDiff > 0) ? (() => {
          const dataTransicao = addDays(refDate, forwardDiff);
          const dataPrimeiraNormal = addDays(dataTransicao, 7);
          const valorSemanal  = r.valorDiario;
          const valorDiarias  = (r.valorDiario / 7) * forwardDiff;
          const valorCorrecao = valorSemanal + valorDiarias + multa + juros;
          return { dataTransicao, dataPrimeiraNormal, valorSemanal, valorDiarias, valorCorrecao, multa, juros };
        })() : null;

        const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
        const toIso = (d: Date) => d.toISOString().split("T")[0];

        const handleAplicarTroca = async () => {
          if (!r || !calc || novoDiaVencimento === null) return;

          const allFinancial = loadFinancial();
          const todayStr = localToday();

          const pendingEntries = allFinancial
            .filter(e => e.rentalId === r.id && !e.pago && e.categoria === "aluguel")
            .sort((a, b) => a.data.localeCompare(b.data));

          if (pendingEntries.length === 0) {
            toast.error("Nenhuma cobrança pendente encontrada para esta locação");
            return;
          }

          const transicaoStr = toIso(calc.dataTransicao);
          const primeiraNormalStr = toIso(calc.dataPrimeiraNormal);
          const pendingIds = new Set(pendingEntries.map(e => e.id));

          const updatedFinancial = allFinancial.map(e => {
            if (!pendingIds.has(e.id)) return e;
            const rank = pendingEntries.findIndex(p => p.id === e.id);
            if (rank === 0) {
              return { ...e, valor: calc.valorCorrecao, data: transicaoStr, dataPrevista: transicaoStr };
            }
            const newDate = addDays(calc.dataPrimeiraNormal, (rank - 1) * 7);
            return { ...e, data: toIso(newDate), dataPrevista: toIso(newDate) };
          });

          const updatedRentals = loadRentals().map(ren =>
            ren.id === r.id ? { ...ren, proximoPagamento: primeiraNormalStr } : ren
          );

          await saveFinancial(updatedFinancial);
          persist(updatedRentals);

          const correctionId = pendingEntries[0].id;
          const asaasEnabled = activeCompany?.asaasConfig?.enabled && activeCompany?.asaasConfig?.apiKey;
          if (asaasEnabled) {
            try {
              const { data: asaasData, error: asaasError } = await supabase.functions.invoke("asaas-charge", {
                body: { entryId: correctionId },
              });
              if (!asaasError && asaasData && !asaasData.error) {
                const withAsaas = updatedFinancial.map(e =>
                  e.id === correctionId
                    ? { ...e, asaasPaymentId: asaasData.paymentId, asaasStatus: asaasData.status, asaasBoletoUrl: asaasData.boletoUrl, asaasInvoiceUrl: asaasData.invoiceUrl }
                    : e
                );
                await saveFinancial(withAsaas);
                toast.success("Troca aplicada e cobrança enviada ao cliente!");
              } else {
                toast.success("Troca aplicada. Não foi possível enviar a cobrança Asaas.");
              }
            } catch {
              toast.success("Troca aplicada. Não foi possível enviar a cobrança Asaas.");
            }
          } else {
            toast.success("Troca de vencimento aplicada com sucesso");
          }

          setTrocaVencimentoRental(null);
          setNovoDiaVencimento(null);
        };

        return (
          <Dialog open={!!r} onOpenChange={open => { if (!open) { setTrocaVencimentoRental(null); setNovoDiaVencimento(null); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-blue-500" />
                  Simulação — Troca de Vencimento
                </DialogTitle>
              </DialogHeader>

              {r && (
                <div className="space-y-4">
                  {/* Resumo da locação */}
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Locatário</span>
                      <span className="font-medium">{getRentalClientLabel(r)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Placa</span>
                      <span className="font-mono font-bold">{getMotoPlaca(r.motoId)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor semanal</span>
                      <span className="font-medium">
                        R$ {r.valorDiario.toFixed(2)}
                        <span className="ml-1 text-xs text-muted-foreground">(R$ {(r.valorDiario / 7).toFixed(2)}/dia)</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cobrança</span>
                      <span className="font-medium">{r.cobrancaPrePaga ? "Antecipada" : "Pós-paga"}</span>
                    </div>
                    {diaAtual !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vence toda</span>
                        <span className="font-medium text-blue-600">{DIAS_FULL[diaAtual]}</span>
                      </div>
                    )}
                    {refDate && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {isOverdue ? "Vencimento em atraso" : "Próximo vencimento"}
                        </span>
                        <span className={`font-medium ${isOverdue ? "text-destructive" : ""}`}>
                          {fmt(refDate)}
                          {isOverdue && <span className="ml-1 text-xs">({diasAtraso}d)</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Seletor do novo dia */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Novo dia de vencimento</Label>
                    <div className="grid grid-cols-7 gap-1">
                      {DIAS_LABEL.map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={i === diaAtual}
                          onClick={() => setNovoDiaVencimento(i)}
                          className={[
                            "rounded-md py-1.5 text-xs font-medium border transition-colors",
                            i === diaAtual
                              ? "opacity-30 cursor-not-allowed bg-muted text-muted-foreground border-border"
                              : novoDiaVencimento === i
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-background hover:bg-accent border-border",
                          ].join(" ")}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    {diaAtual !== null && (
                      <p className="text-[11px] text-muted-foreground">
                        Dia atual ({DIAS_LABEL[diaAtual]}) desabilitado
                      </p>
                    )}
                  </div>

                  {/* Resultado */}
                  {calc && novoDiaVencimento !== null && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-3 space-y-3">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                        Resultado da simulação
                      </p>

                      {/* Motivo */}
                      <p className="text-xs text-muted-foreground leading-snug">
                        Para trocar o vencimento de <strong className="text-foreground">{DIAS_FULL[diaAtual!]}</strong> para <strong className="text-foreground">{DIAS_FULL[novoDiaVencimento]}</strong>, será cobrado um período proporcional de <strong className="text-foreground">{forwardDiff} {forwardDiff === 1 ? "dia" : "dias"}</strong> no lugar da semana normal.
                      </p>

                      {/* Breakdown */}
                      <div className="rounded-md bg-white dark:bg-blue-950/60 border border-blue-200 dark:border-blue-700 divide-y divide-blue-100 dark:divide-blue-800 text-sm overflow-hidden">

                        {/* Pagamento de correção (único) */}
                        <div className="px-3 py-3 bg-blue-100/60 dark:bg-blue-900/40">
                          <div className="flex justify-between items-baseline mb-2">
                            <div>
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wide">Pagamento de correção</span>
                              <span className="ml-1.5 text-[11px] text-muted-foreground">{fmt(calc.dataTransicao)}</span>
                            </div>
                            <span className="text-2xl font-extrabold text-blue-700 dark:text-blue-300">R$ {calc.valorCorrecao.toFixed(2)}</span>
                          </div>
                          <div className="space-y-0.5 text-[11px] text-muted-foreground border-t border-blue-200 dark:border-blue-700 pt-1.5">
                            <div className="flex justify-between">
                              <span>Semana normal</span>
                              <span className="font-medium">R$ {calc.valorSemanal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>+ {forwardDiff} diária(s) de correção (R$ {(r.valorDiario / 7).toFixed(2)}/dia)</span>
                              <span className="font-medium">R$ {calc.valorDiarias.toFixed(2)}</span>
                            </div>
                            {calc.multa > 0 && (
                              <div className="flex justify-between text-destructive">
                                <span>+ Multa por atraso</span>
                                <span className="font-medium">R$ {calc.multa.toFixed(2)}</span>
                              </div>
                            )}
                            {calc.juros > 0 && r && (
                              <div className="flex justify-between text-destructive">
                                <span>+ Juros ({r.jurosAtrasoMes}%/mês × {diasAtraso}d)</span>
                                <span className="font-medium">R$ {calc.juros.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Pagamentos seguintes */}
                        <div className="px-3 py-2.5 bg-muted/30">
                          <div className="flex justify-between items-baseline">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Pagamentos seguintes</span>
                              <span className="ml-1.5 text-[11px] text-muted-foreground">a partir de {fmt(calc.dataPrimeiraNormal)}</span>
                            </div>
                            <span className="font-semibold text-base">R$ {calc.valorSemanal.toFixed(2)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Toda {DIAS_FULL[novoDiaVencimento]}</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {r.cobrancaPrePaga
                          ? `Cobrança antecipada: o locatário paga adiantado pelos próximos dias de uso.`
                          : `Cobrança pós-paga: o locatário paga pelos dias já utilizados.`
                        }
                      </p>
                    </div>
                  )}

                  {novoDiaVencimento !== null && !calc && novoDiaVencimento === diaAtual && (
                    <p className="text-sm text-center text-muted-foreground">Selecione um dia diferente do atual.</p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setTrocaVencimentoRental(null); setNovoDiaVencimento(null); }}>
                  Fechar
                </Button>
                {calc && novoDiaVencimento !== null && (
                  <Button onClick={handleAplicarTroca} className="gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Aplicar troca
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
