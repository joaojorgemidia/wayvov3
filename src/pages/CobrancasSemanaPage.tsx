import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarDays, AlertTriangle, CheckCircle2, User, Bike,
  Wallet, ShieldCheck, Receipt, Coins, Tag, MessageCircle,
  Bell, Wrench, MoreHorizontal, Phone, Copy,
  CalendarClock, ExternalLink, Search, TrendingUp,
  LayoutDashboard, SlidersHorizontal, Check, ChevronDown, ChevronUp, AlertCircle,
  Scissors, X, Pencil, Loader2, FileText, Handshake,
} from "lucide-react";
import { toast } from "sonner";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { saveFinancial, loadFinancial } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { FinancialEntry } from "@/lib/types";
import { MessagePopup } from "@/components/MessagePopup";
import { applyTokens, buildAllTokens } from "@/lib/message-tokens";
import { buildCobrancaEvent, computeSemanaPeriodo, computeSemanaNumero } from "@/lib/cobranca-week-stats";
import { useCompany } from "@/contexts/CompanyContext";
import { DEFAULT_COBRANCA_CONFIG } from "@/lib/companies";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { localToday } from "@/lib/utils";

const SNOOZE_LS_KEY = "wayvo-cobranca-snooze";
function readSnoozeMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SNOOZE_LS_KEY) || "{}"); } catch { return {}; }
}
function writeSnoozeMap(map: Record<string, string>) {
  localStorage.setItem(SNOOZE_LS_KEY, JSON.stringify(map));
}

const WEEK_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const CAT_META: Record<string, { label: string; icon: any; tone: { bg: string; text: string; border: string; stripe: string } }> = {
  aluguel:                  { label: "Aluguel",            icon: Wallet,     tone: { bg: "bg-primary/10",     text: "text-primary",     border: "border-primary/30",     stripe: "bg-primary" } },
  caucao:                   { label: "Caução",             icon: ShieldCheck, tone: { bg: "bg-accent/30",      text: "text-accent-foreground", border: "border-accent", stripe: "bg-accent-foreground" } },
  multa_transito_receita:   { label: "Multa de trânsito",  icon: Receipt,    tone: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", stripe: "bg-destructive" } },
  multa_transito:           { label: "Multa de trânsito",  icon: Receipt,    tone: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", stripe: "bg-destructive" } },
  multa:                    { label: "Multa repassada",    icon: Receipt,    tone: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", stripe: "bg-destructive" } },
  manutencao_receita:       { label: "Manutenção",         icon: Wrench,     tone: { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800", stripe: "bg-amber-500" } },
  manutencao_despesa:       { label: "Manutenção",         icon: Wrench,     tone: { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800", stripe: "bg-amber-500" } },
  venda_moto:               { label: "Venda de moto",      icon: TrendingUp, tone: { bg: "bg-success/10",     text: "text-success",     border: "border-success/30",     stripe: "bg-success" } },
  pecas_receita:            { label: "Peças",              icon: Coins,      tone: { bg: "bg-muted/50",       text: "text-foreground",  border: "border-border",         stripe: "bg-muted-foreground" } },
  juros_atraso:             { label: "Juros por atraso",   icon: Receipt,    tone: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", stripe: "bg-destructive" } },
  ajuste_saldo:             { label: "Ajuste de saldo",        icon: Coins,      tone: { bg: "bg-muted/50",       text: "text-foreground",  border: "border-border",         stripe: "bg-muted-foreground" } },
  outro_receita:            { label: "Outros",                 icon: Coins,      tone: { bg: "bg-success/10",     text: "text-success",     border: "border-success/30",     stripe: "bg-success" } },
  outro:                    { label: "Outras receitas",        icon: Coins,      tone: { bg: "bg-success/10",     text: "text-success",     border: "border-success/30",     stripe: "bg-success" } },
  // Categorias customizadas com typo no banco
  custom_ecerramento_de_contrato:   { label: "Encerramento de contrato", icon: Receipt, tone: { bg: "bg-muted/50", text: "text-foreground", border: "border-border", stripe: "bg-muted-foreground" } },
  custom_encerramento_de_contrato:  { label: "Encerramento de contrato", icon: Receipt, tone: { bg: "bg-muted/50", text: "text-foreground", border: "border-border", stripe: "bg-muted-foreground" } },
};

function metaFor(catKey: string) {
  if (!catKey) return { label: "Receita", icon: Tag, tone: { bg: "bg-muted/50", text: "text-foreground", border: "border-border", stripe: "bg-muted-foreground" } };
  if (CAT_META[catKey]) return CAT_META[catKey];
  // Limpa chave bruta: remove prefixo "custom_", substitui _ por espaço e capitaliza
  const label = catKey
    .replace(/^custom_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  return { label, icon: Tag, tone: { bg: "bg-muted/50", text: "text-foreground", border: "border-border", stripe: "bg-muted-foreground" } };
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function parseISO(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface MsgType {
  key: string;
  label: string;
  icon: React.ElementType;
  template: string;
  tone: "primary" | "warning" | "danger";
  highlights: (item: RowItem) => { label: string; value: string; tone: "primary" | "warning" | "danger" }[];
}

interface RowItem {
  entry: FinancialEntry;
  due: Date | null;       // data de ação (dataPrevista ou data)
  daysLate: number;       // baseado na data de ação (para display)
  originalDaysLate: number; // baseado na data original (para classificar atraso real)
  catKey: string;
  clienteNome: string;
  clienteId: string | null;
  telefoneCliente: string | null;
  placa: string | null;
  modelo: string | null;
  motoId: string | null;
  totalPendente: number;
  semanasEmAtraso: number;
  pendingCount: number;
  ultimoPagamento: string | null;
}

const MSG_TYPES: MsgType[] = [
  {
    key: "pagamento-dia",
    label: "Dia do pagamento",
    icon: CalendarDays,
    tone: "primary",
    template: "Olá {NOME}! Passando para lembrar que hoje é o dia do seu pagamento de *{VALOR}* referente ao aluguel da moto *{PLACA}*. Qualquer dúvida é só chamar!",
    highlights: (item) => [{ label: "Valor", value: fmtBRL(item.entry.valor || 0), tone: "primary" }],
  },
  {
    key: "pagamento-atraso",
    label: "Atraso de pagamento",
    icon: AlertTriangle,
    tone: "danger",
    template: "Olá {NOME}! Identificamos que seu pagamento de *{VALOR}*, com vencimento em *{DATA_VENCIMENTO}*, está em aberto há *{DIAS_ATRASO} dia(s)*. Por favor, regularize o quanto antes. Estamos à disposição!",
    highlights: (item) => [
      { label: "Valor em aberto", value: fmtBRL(item.entry.valor || 0), tone: "danger" },
      ...(item.daysLate > 0 ? [{ label: "Atraso", value: `${item.daysLate} dia(s)`, tone: "danger" as const }] : []),
    ],
  },
  {
    key: "lembrete",
    label: "Lembrete de pagamento",
    icon: Bell,
    tone: "warning",
    template: "Olá {NOME}! Passando para lembrar do pagamento de *{VALOR}* referente à moto *{PLACA}*, com vencimento em *{DATA_VENCIMENTO}*. Se já tiver pago, desconsidere. Obrigado!",
    highlights: (item) => [
      { label: "Valor", value: fmtBRL(item.entry.valor || 0), tone: "primary" },
      { label: "Vencimento", value: item.due?.toLocaleDateString("pt-BR") || "—", tone: "warning" },
    ],
  },
  {
    key: "manutencao",
    label: "Moto em manutenção",
    icon: Wrench,
    tone: "warning",
    template: "Olá {NOME}! Informamos que a moto *{PLACA}* está em manutenção no momento. Assim que estiver pronta entraremos em contato. Agradecemos a compreensão!",
    highlights: (item) => [{ label: "Moto", value: item.placa || "—", tone: "warning" }],
  },
  {
    key: "encerramento-manutencao",
    label: "Encerramento de manutenção",
    icon: CheckCircle2,
    tone: "primary",
    template: "Olá {NOME}! Boa notícia! A moto *{PLACA}* está pronta e já pode ser retirada. Aguardamos você!",
    highlights: (item) => [{ label: "Moto", value: item.placa || "—", tone: "primary" }],
  },
];

function tokensFor(item: RowItem): Record<string, string> {
  return {
    "{NOME}": item.clienteNome,
    "{PLACA}": item.placa || "—",
    "{VALOR}": fmtBRL(item.entry.valor || 0),
    "{DATA_VENCIMENTO}": item.due?.toLocaleDateString("pt-BR") || "—",
    "{DIAS_ATRASO}": String(item.daysLate),
  };
}

export default function CobrancasSemanaPage() {
  const { activeCompany } = useCompany();
  const cache = useDataCacheSnapshot();
  const [confirmItem, setConfirmItem] = useState<RowItem | null>(null);
  const [confirmValor, setConfirmValor] = useState("");
  const [confirmValorEditado, setConfirmValorEditado] = useState(false);
  const [form, setForm] = useState({ data: localToday(), conta: "", observacao: "" });
  const [msgState, setMsgState] = useState<{ item: RowItem; type: MsgType } | null>(null);
  const [payConfirmPopup, setPayConfirmPopup] = useState<{
    mensagem: string; placa: string; cliente: string; telefone: string;
    highlights: { label: string; value: string; tone: "primary" | "warning" | "danger" }[];
    tokens: Record<string, string>;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<number | "all">("all");
  const [reschedItem, setReschedItem] = useState<RowItem | null>(null);
  const [reschedDate, setReschedDate] = useState("");
  const [missingExpanded, setMissingExpanded] = useState(false);
  const [snoozedExpanded, setSnoozedExpanded] = useState(false);
  const [debtDetailClientId, setDebtDetailClientId] = useState<string | null>(null);
  const [adiarEntry, setAdiarEntry] = useState<FinancialEntry | null>(null);
  const [adiarDate, setAdiarDate] = useState("");
  const [adiarAtrasadas, setAdiarAtrasadas] = useState<FinancialEntry[]>([]);
  const [snoozeMap, setSnoozeMap] = useState<Record<string, string>>(() => readSnoozeMap());
  const [loadingBoleto, setLoadingBoleto] = useState<string | null>(null);
  const [generatingBoleto, setGeneratingBoleto] = useState<string | null>(null);
  const [parcelandoEntry, setParcelandoEntry] = useState<FinancialEntry | null>(null);
  const [parcelForm, setParcelForm] = useState({ entrada: "", primeiraData: new Date().toISOString().slice(0, 10), nParcelas: "2" });
  const [parcelSalvando, setParcelSalvando] = useState(false);
  const [parcelandoGrupo, setParcelandoGrupo] = useState<FinancialEntry[] | null>(null);
  const [parcelGrupoSelected, setParcelGrupoSelected] = useState<Set<string>>(new Set());
  const [parcelGrupoForm, setParcelGrupoForm] = useState({ entrada: "", valorParcela: "", primeiraData: "" });
  const [parcelGrupoSalvando, setParcelGrupoSalvando] = useState(false);
  const [debtFuturasOpen, setDebtFuturasOpen] = useState(false);
  const [debtPagasOpen, setDebtPagasOpen] = useState(false);
  const [reschedClientItems, setReschedClientItems] = useState<RowItem[]>([]);
  const [reschedClientDate, setReschedClientDate] = useState("");
  const [editRefEntry, setEditRefEntry] = useState<FinancialEntry | null>(null);
  const [editRefDate, setEditRefDate] = useState("");

  const handleMessage = (item: RowItem, type: MsgType) => setMsgState({ item, type });

  const handleGerarBoleto = async (e: FinancialEntry) => {
    setGeneratingBoleto(e.id);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-charge", {
        body: { entryId: e.id },
      });
      if (error || data?.error) {
        if (data?.paymentId) {
          // Boleto já existia (cache local desatualizado) — busca o link em vez de só avisar.
          const next = loadFinancial().map(f => f.id === e.id ? { ...f, asaasPaymentId: data.paymentId } : f);
          await saveFinancial(next);
          setGeneratingBoleto(null);
          await fetchAndOpenBoleto({ ...e, asaasPaymentId: data.paymentId });
          return;
        }
        throw new Error(data?.error || error?.message || "Erro ao gerar boleto");
      }
      const next = loadFinancial().map(f =>
        f.id === e.id
          ? { ...f, asaasPaymentId: data.paymentId, asaasStatus: data.status, asaasBoletoUrl: data.boletoUrl || null, asaasInvoiceUrl: data.invoiceUrl || null }
          : f
      );
      await saveFinancial(next);
      const url = data.invoiceUrl || data.boletoUrl;
      if (url) window.open(url, "_blank");
      toast.success("Boleto gerado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar boleto");
    } finally {
      setGeneratingBoleto(null);
    }
  };

  const fetchAndOpenBoleto = async (e: FinancialEntry) => {
    const url = e.asaasInvoiceUrl || e.asaasBoletoUrl;
    if (url) { window.open(url, "_blank"); return; }
    if (!e.asaasPaymentId) return;
    setLoadingBoleto(e.id);
    try {
      await supabase.functions.invoke("asaas-sync-status");
      const { data } = await supabase.from("financial_entries")
        .select("asaas_boleto_url, asaas_invoice_url")
        .eq("id", e.id)
        .single();
      const freshUrl = data?.asaas_invoice_url || data?.asaas_boleto_url;
      if (freshUrl) { window.open(freshUrl, "_blank"); }
      else { toast.error("Link do boleto não disponível no momento"); }
    } catch {
      toast.error("Erro ao buscar link do boleto");
    } finally {
      setLoadingBoleto(null);
    }
  };

  const [today, setToday] = useState(() => startOfDay(new Date()));
  // Atualiza `today` automaticamente no 1º minuto de cada dia
  React.useEffect(() => {
    const msUntilMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 1, 0, 0); // 00:01 do dia seguinte
      return midnight.getTime() - now.getTime();
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setToday(startOfDay(new Date()));
        schedule();
      }, msUntilMidnight());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  const monday = useMemo(() => {
    const d = new Date(today);
    const dow = d.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offset);
    return d;
  }, [today]);
  const sunday = useMemo(() => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return d;
  }, [monday]);

  const clientsById = useMemo(
    () => new Map(cache.clients.map((c) => [c.id, c])),
    [cache.clients],
  );
  const motosById = useMemo(
    () => new Map(cache.motos.map((m) => [m.id, m])),
    [cache.motos],
  );
  const rentalsById = useMemo(
    () => new Map(cache.rentals.map((r) => [r.id, r])),
    [cache.rentals],
  );
  const financialById = useMemo(
    () => new Map(cache.financial.map((e) => [e.id, e])),
    [cache.financial],
  );

  // Lançamento de saldo restante de um pagamento parcial anterior: a multa/juros
  // do atraso original já foi somada uma vez ao calcular esse saldo — não pode
  // ganhar multa/juros de novo a cada rodada, senão o encargo dobra a cada
  // pagamento parcial subsequente do mesmo débito.
  const isSaldoRestanteEntry = (e: FinancialEntry) =>
    (e.observacao || "").startsWith("Saldo devedor de pagamento parcial");

  const calcValorAtualizado = (e: FinancialEntry, days: number) => {
    if (days <= 0 || e.categoria === "juros_atraso" || isSaldoRestanteEntry(e)) return e.valor || 0;
    // encargos de atraso só se aplicam a aluguel e caução
    if (!["aluguel", "caucao"].includes((e.categoria || "").toLowerCase())) return e.valor || 0;
    const cfg = activeCompany?.cobrancaConfig ?? { multaAtraso: 15, jurosDiario: 7, jurosMes: 0 };
    const rental = e.rentalId ? rentalsById.get(e.rentalId) : undefined;
    const valor = e.valor || 0;
    const multa = rental?.multaAtraso ?? cfg.multaAtraso ?? 0;
    const jurosMes = rental?.jurosAtrasoMes ?? cfg.jurosMes ?? 0;
    const jurosDiario = cfg.jurosDiario ?? 0;
    const juros = valor * (jurosMes / 100 / 30) * days + jurosDiario * days + multa;
    return parseFloat((valor + juros).toFixed(2));
  };

  const valorAtualDe = (e: FinancialEntry) => {
    const due = parseISO(e.dataPrevista || e.data);
    const days = due ? diffDays(today, due) : 0;
    return calcValorAtualizado(e, days);
  };

  const pending: RowItem[] = useMemo(() => {
    // Passo 1: estatísticas por locação (dívida total, semanas em atraso, último pagamento)
    const rentalStats = new Map<string, { totalPendente: number; semanasEmAtraso: number; pendingCount: number; ultimoPagamento: string | null }>();
    for (const e of cache.financial) {
      if (!e.rentalId || e.ignorada) continue;
      if (e.tipo === "receita" && !e.pago) {
        const st = rentalStats.get(e.rentalId) || { totalPendente: 0, semanasEmAtraso: 0, pendingCount: 0, ultimoPagamento: null };
        st.totalPendente += e.valor || 0;
        const due = parseISO(e.dataPrevista || e.data);
        const isOverdueEntry = due && diffDays(today, due) > 0;
        if (isOverdueEntry) st.pendingCount++;
        if (e.categoria === "aluguel" && isOverdueEntry) st.semanasEmAtraso++;
        rentalStats.set(e.rentalId, st);
      } else if (e.tipo === "receita" && e.pago && e.data) {
        const st = rentalStats.get(e.rentalId) || { totalPendente: 0, semanasEmAtraso: 0, ultimoPagamento: null };
        if (!st.ultimoPagamento || e.data > st.ultimoPagamento) st.ultimoPagamento = e.data;
        rentalStats.set(e.rentalId, st);
      }
    }

    // Passo 2: monta a lista de itens pendentes
    const out: RowItem[] = [];
    for (const e of cache.financial) {
      if (e.tipo !== "receita") continue;
      if (e.pago || e.ignorada) continue;
      // Se houver data de adiamento no localStorage, usa ela como data de exibição
      const snoozeDate = snoozeMap[e.id];
      const dueISO = snoozeDate || e.dataPrevista || e.data;
      const due = parseISO(dueISO);
      const daysLate = due ? diffDays(today, due) : 0;
      const cli = e.clienteId || null;
      if (!cli) continue; // só mostra entradas com locatário explicitamente vinculado
      let moto = e.motoId || null;
      if (!moto && e.rentalId) {
        const r = rentalsById.get(e.rentalId);
        if (r) { moto = r.motoId; }
      }
      const cliente = clientsById.get(cli);
      const m = moto ? motosById.get(moto) : null;
      const st = e.rentalId ? rentalStats.get(e.rentalId) : null;
      // Atraso real: sempre baseado na data original (e.data), independente de adiamento
      const origDate = parseISO(e.data);
      const originalDaysLate = origDate ? diffDays(today, origDate) : daysLate;
      out.push({
        entry: e,
        due,
        daysLate,
        originalDaysLate,
        catKey: (e.categoria || "outro").toLowerCase(),
        clienteNome: cliente?.nome || e.clienteNome || "Sem locatário",
        clienteId: cli || null,
        telefoneCliente: cliente?.telefone || null,
        placa: m?.placa || e.placa || null,
        modelo: m?.modelo || null,
        motoId: m?.id || null,
        totalPendente: st?.totalPendente ?? (e.valor || 0),
        semanasEmAtraso: st?.semanasEmAtraso ?? (daysLate > 0 && (e.categoria || "").toLowerCase() === "aluguel" ? 1 : 0),
        pendingCount: st?.pendingCount ?? (daysLate > 0 ? 1 : 0),
        ultimoPagamento: st?.ultimoPagamento ?? null,
      });
    }
    return out.sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.getTime() - b.due.getTime();
    });
  }, [cache.financial, clientsById, motosById, rentalsById, today, snoozeMap]);

  const debtDetailEntries = useMemo(() => {
    if (!debtDetailClientId) return [];
    // Inclui também entradas sem clienteId mas vinculadas via rentalId (mesmo fallback do pending)
    const clientRentalIds = new Set(
      cache.rentals.filter(r => r.clienteId === debtDetailClientId).map(r => r.id)
    );
    return cache.financial
      .filter(e => {
        if (e.tipo !== "receita" || e.ignorada) return false;
        if (e.clienteId === debtDetailClientId) return true;
        return false;
      })
      .sort((a, b) => {
        // Extrai número de semana do descricao para ordenação correta (ignora reagendamentos)
        const getIdxFromDesc = (e: FinancialEntry) => {
          if (e.descricao) {
            // Formato novo: "Aluguel – Semana 33: ..."
            const mNew = e.descricao.match(/(?:Semana|Quinzena|M[eê]s)\s+(\d+):/i);
            if (mNew) return parseInt(mNew[1]);
            // Formato antigo: "Aluguel 33ª Semana"
            const mOld = e.descricao.match(/Aluguel\s+(\d+)[ªa°]?\s*(Semana|Quinzena|M[eê]s)/i);
            if (mOld) return parseInt(mOld[1]);
          }
          return null;
        };
        const iA = getIdxFromDesc(a), iB = getIdxFromDesc(b);
        if (iA !== null && iB !== null) return iB - iA;
        return (b.dataOriginal || b.dataPrevista || b.data).localeCompare(a.dataOriginal || a.dataPrevista || a.data);
      });
  }, [debtDetailClientId, cache.financial, cache.rentals]);

  const debtDetailItem = useMemo(
    () => pending.find(i => i.clienteId === debtDetailClientId) ?? null,
    [pending, debtDetailClientId],
  );

  const todayISO = toISODate(today);
  // Snoozed via localStorage: oculto até a data escolhida, sem alterar dataPrevista
  const isSnoozed = (id: string) => { const d = snoozeMap[id]; return !!d && d >= todayISO; };

  const weekItems = pending.filter(
    (i) => i.due && i.due >= monday && i.due <= sunday && i.daysLate <= 0 &&
    (i.originalDaysLate <= 0 || isSnoozed(i.entry.id)),
  );
  const todayItems = weekItems.filter(i => i.daysLate === 0);
  const upcomingItems = weekItems.filter(i => i.daysLate < 0);
  const overdueItems = pending.filter((i) => i.originalDaysLate > 0);
  // Vencidos e não ocultados → aparecem por padrão
  const overdueVisible = overdueItems.filter((i) => i.daysLate > 0 && !isSnoozed(i.entry.id));
  // Adiados: data de ação no futuro OU snooze ativo
  const overdueSnoozed = overdueItems.filter((i) => i.daysLate <= 0 || isSnoozed(i.entry.id));

  // Faixa de dias: Seg–Dom com contagem e total por dia
  const weekStrip = useMemo(() => {
    return WEEK_ORDER.map((dow, idx) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + idx);
      const items = weekItems.filter((i) => i.due!.getDay() === dow);
      const total = items.reduce((s, i) => s + (i.entry.valor || 0), 0);
      return {
        dow,
        date,
        count: items.length,
        total,
        isToday: diffDays(today, date) === 0,
        isPast: date < today,
      };
    });
  }, [monday, weekItems, today]);

  // Paid entries per weekday (for day strip progress bars)
  const weekDayPaid = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of cache.financial) {
      if (e.tipo !== "receita" || !e.pago || e.ignorada) continue;
      const due = parseISO(e.dataPrevista || e.data);
      if (!due || due < monday || due > sunday) continue;
      m.set(due.getDay(), (m.get(due.getDay()) || 0) + 1);
    }
    return m;
  }, [cache.financial, monday, sunday]);

  // Aplica filtros (busca + dia)
  const filterFn = (i: RowItem) => {
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const hay = `${i.clienteNome} ${i.placa || ""} ${i.modelo || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const filteredOverdueVisible = overdueVisible.filter(filterFn);
  const filteredOverdueSnoozed = overdueSnoozed.filter(filterFn);
  const filteredToday = todayItems.filter((i) => {
    if (!filterFn(i)) return false;
    if (dayFilter === "all") return true;
    return i.due!.getDay() === dayFilter;
  });
  const filteredUpcoming = upcomingItems.filter((i) => {
    if (!filterFn(i)) return false;
    if (dayFilter === "all") return true;
    return i.due!.getDay() === dayFilter;
  });
  // Mantido para compatibilidade com KPIs e day strip
  const filteredWeek = weekItems.filter((i) => {
    if (!filterFn(i)) return false;
    if (dayFilter === "all") return true;
    return i.due!.getDay() === dayFilter;
  });

  // Agrupar próximas cobranças por dia (Seg–Dom, excluindo hoje)
  const groupedUpcoming = useMemo(() => {
    const groups: { dow: number; date: Date; items: RowItem[] }[] = [];
    for (const dow of WEEK_ORDER) {
      const items = filteredUpcoming.filter((i) => i.due!.getDay() === dow);
      if (items.length === 0) continue;
      groups.push({ dow, date: items[0].due!, items });
    }
    return groups;
  }, [filteredUpcoming]);

  // ── KPIs ──────────────────────────────────────────────────────────
  const totalsByCat = useMemo(() => {
    const m = new Map<string, { count: number; valor: number; paidCount: number; paidValor: number }>();
    const bump = (key: string, valor: number, paid: boolean) => {
      const cur = m.get(key) || { count: 0, valor: 0, paidCount: 0, paidValor: 0 };
      if (paid) { cur.paidCount += 1; cur.paidValor += valor; }
      else { cur.count += 1; cur.valor += valor; }
      m.set(key, cur);
    };
    for (const e of cache.financial) {
      if (e.tipo !== "receita") continue;
      if (e.ignorada) continue;
      const due = parseISO(e.dataPrevista || e.data);
      if (!due) continue;
      if (due < monday || due > sunday) continue;
      bump((e.categoria || "outro").toLowerCase(), e.valor || 0, !!e.pago);
    }
    return m;
  }, [cache.financial, monday, sunday]);

  const aluguelStats = useMemo(() => {
    const active = cache.rentals.filter((r) => r.status === "ativa");
    const totalActive = active.length;
    const novasNaSemana = cache.rentals.filter((r) => {
      const di = parseISO(r.dataInicio);
      return di && di >= monday && di <= sunday;
    }).length;
    const aluguelMeta = totalsByCat.get("aluguel") || { count: 0, valor: 0, paidCount: 0, paidValor: 0 };
    const totalCobr = aluguelMeta.count + aluguelMeta.paidCount;
    return {
      totalActive,
      novasNaSemana,
      totalCobr,
      pagas: aluguelMeta.paidCount,
      pendentes: aluguelMeta.count,
      valorPago: aluguelMeta.paidValor,
      valorPendente: aluguelMeta.valor,
      desbalanco: totalActive - totalCobr,
    };
  }, [cache.rentals, totalsByCat, monday, sunday]);

  const totalSemanaPendente = weekItems.reduce((s, i) => s + (i.entry.valor || 0), 0);
  const totalAtrasado = overdueVisible.reduce((s, i) => s + calcValorAtualizado(i.entry, i.daysLate), 0);

  // Previsão total da semana (todas categorias, pago + pendente)
  const weekPrevisao = useMemo(() => {
    let pago = 0, pendente = 0;
    for (const [, t] of totalsByCat) {
      pago += t.paidValor;
      pendente += t.valor;
    }
    return { total: pago + pendente, pago, pendente };
  }, [totalsByCat]);

  // Outros recebimentos da semana (excluindo aluguel)
  const outrosRecebimentos = useMemo(() => {
    const result: { catKey: string; count: number; valor: number; paidCount: number; paidValor: number }[] = [];
    for (const [catKey, t] of totalsByCat) {
      if (catKey === "aluguel") continue;
      if (t.count + t.paidCount === 0) continue;
      result.push({ catKey, count: t.count, valor: t.valor, paidCount: t.paidCount, paidValor: t.paidValor });
    }
    return result;
  }, [totalsByCat]);

  // Locações ativas sem nenhuma cobrança de aluguel pendente ou em atraso
  const missingRentals = useMemo(() => {
    const active = cache.rentals.filter(r => r.status === "ativa");
    const coveredIds = new Set<string>();
    for (const e of cache.financial) {
      if (e.tipo !== "receita" || e.ignorada || e.categoria !== "aluguel") continue;
      if (!e.rentalId) continue;
      if (!e.pago) {
        coveredIds.add(e.rentalId); // pendente esta semana ou em atraso
      } else {
        const pd = parseISO(e.data);
        if (pd && pd >= monday && pd <= sunday) coveredIds.add(e.rentalId); // pago esta semana
      }
    }
    return active
      .filter(r => !coveredIds.has(r.id))
      .map(r => {
        const moto = motosById.get(r.motoId);
        const client = clientsById.get(r.clienteId);
        const lastPaid = cache.financial
          .filter(e => e.rentalId === r.id && e.pago && e.categoria === "aluguel")
          .sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
        const diasSemPagamento = lastPaid ? diffDays(today, parseISO(lastPaid.data)!) : null;
        return {
          rental: r,
          placa: moto?.placa || "—",
          modelo: moto?.modelo || "",
          clienteNome: client?.nome || "—",
          telefone: client?.telefone || null,
          diasSemPagamento,
        };
      })
      .sort((a, b) => (b.diasSemPagamento ?? 9999) - (a.diasSemPagamento ?? 9999));
  }, [cache.rentals, cache.financial, clientsById, motosById, monday, sunday, today]);

  // ── Ações ──────────────────────────────────────────────────────────
  const openConfirm = (item: RowItem) => {
    setConfirmItem(item);
    setConfirmValor(item.entry.valor
      ? item.entry.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "");
    setConfirmValorEditado(false);
    setForm({
      data: localToday(),
      conta: item.entry.conta || "",
      observacao: "",
    });
  };

  // Recalcula confirmValor com multa+juros quando a data de pagamento muda
  useEffect(() => {
    if (!confirmItem || confirmValorEditado) return;
    const entry = confirmItem.entry;
    if (entry.categoria === "juros_atraso") return;
    const dueDateStr = entry.dataPrevista || entry.data;
    if (!dueDateStr || !form.data) return;
    const due = new Date(dueDateStr + "T00:00:00");
    const pay = new Date(form.data + "T00:00:00");
    const daysOverdue = Math.max(0, Math.floor((pay.getTime() - due.getTime()) / 86400000));
    const total = calcValorAtualizado(entry, daysOverdue);
    setConfirmValor(total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data, confirmItem, confirmValorEditado]);

  const handleConfirm = async () => {
    if (!confirmItem) return;
    const item = confirmItem;
    const valor = parseFloat(confirmValor.replace(/\./g, "").replace(",", ".")) || item.entry.valor || 0;
    try {
      const payDate = form.data || new Date().toISOString().slice(0, 10);
      const next = loadFinancial().map((e) =>
        e.id === item.entry.id
          ? {
              ...e,
              pago: true,
              data: payDate,
              valor,
              conta: form.conta || e.conta,
              observacao: form.observacao
                ? (e.observacao ? `${e.observacao}\n${form.observacao}` : form.observacao)
                : e.observacao,
            }
          : e,
      );

      // ── Pagamento parcial: cria saldo devedor quando recebido < total devido ──
      // O total devido já inclui multa/juros de atraso (aluguel) quando aplicável,
      // pra não perder o saldo restante quando o recebimento parcial é sobre uma
      // cobrança já em atraso.
      let totalDevido = item.entry.valor || 0;
      if (item.entry.categoria === "aluguel" && item.entry.rentalId && !isSaldoRestanteEntry(item.entry)) {
        const dueDateStrAcr = item.entry.dataPrevista || item.entry.data;
        const rentalAcr = rentalsById.get(item.entry.rentalId);
        if (dueDateStrAcr && rentalAcr) {
          const dueAcr = new Date(dueDateStrAcr + "T00:00:00");
          const payAcr = new Date(payDate + "T00:00:00");
          const daysOverdueAcr = Math.max(0, Math.floor((payAcr.getTime() - dueAcr.getTime()) / 86400000));
          if (daysOverdueAcr > 0) {
            const cfgAcr = activeCompany?.cobrancaConfig ?? DEFAULT_COBRANCA_CONFIG;
            const multaAcr = rentalAcr.multaAtraso ?? cfgAcr.multaAtraso ?? 0;
            const jurosMesAcr = rentalAcr.jurosAtrasoMes ?? cfgAcr.jurosMes ?? 0;
            const jurosCalcAcr = (item.entry.valor || 0) * (jurosMesAcr / 100 / 30) * daysOverdueAcr;
            const jurosDiarioAcr = (cfgAcr.jurosDiario ?? 0) * daysOverdueAcr;
            totalDevido += multaAcr + jurosCalcAcr + jurosDiarioAcr;
          }
        }
      }
      const restanteBase = item.entry.tipo === "receita" && valor < totalDevido - 0.009
        ? Math.round((totalDevido - valor) * 100) / 100
        : 0;
      let finalEntries = next;
      if (restanteBase > 0) {
        const dueDateStrRest = item.entry.dataPrevista || item.entry.data;
        const dueFmt = dueDateStrRest ? new Date(dueDateStrRest + "T12:00:00").toLocaleDateString("pt-BR") : "?";
        const restanteEntry: FinancialEntry = {
          id: crypto.randomUUID(),
          tipo: "receita",
          categoria: item.entry.categoria,
          subcategoria: item.entry.subcategoria,
          descricao: `Saldo restante — ${item.entry.descricao}`,
          valor: restanteBase,
          // Mantém a referência da semana/período do débito original (não a data do
          // pagamento) — senão o saldo de uma cobrança atrasada aparece associado à
          // semana seguinte em vez da semana que de fato gerou o débito.
          data: dueDateStrRest || payDate,
          dataPrevista: dueDateStrRest || payDate,
          pago: false,
          conta: "",
          natureza: item.entry.natureza || "operacional",
          tags: item.entry.tags || [],
          rentalId: item.entry.rentalId ?? null,
          clienteId: item.entry.clienteId ?? null,
          clienteNome: item.entry.clienteNome || "",
          motoId: item.entry.motoId ?? null,
          placa: item.entry.placa || "",
          observacao: `Saldo devedor de pagamento parcial em ${new Date(payDate + "T12:00:00").toLocaleDateString("pt-BR")} (ref. venc. ${dueFmt})`,
          fixedOriginId: item.entry.id,
          recorrente: false,
          despesaFixa: false,
          ignorada: false,
          createdAt: new Date().toISOString(),
        };
        finalEntries = [...next, restanteEntry];
      }
      await saveFinancial(finalEntries);
      // Fecha o dialog e mostra o toast imediatamente, antes de montar o popup
      setConfirmItem(null);
      toast.success("Pagamento confirmado!");

      // Sync automático de taxas Asaas em background (não bloqueia o fluxo)
      if (item.entry.asaasPaymentId && item.entry.asaasStatus === "RECEIVED" && activeCompany?.id) {
        supabase.functions.invoke("asaas-sync-fees", {
          body: { asaasPaymentId: item.entry.asaasPaymentId, entryId: item.entry.id, companyId: activeCompany.id },
        }).then(({ data }) => {
          const totalRegistered = (data?.registeredFees ?? 0) + (data?.registeredJuros ?? 0);
          if (totalRegistered > 0) {
            const parts: string[] = [];
            if (data?.registeredFees > 0) parts.push(`${data.registeredFees} taxa(s) Asaas`);
            if (data?.registeredJuros > 0) parts.push(`juros/multa`);
            toast.success(`Registrado automaticamente: ${parts.join(" e ")}.`);
          }
        }).catch(() => {});
      } else if (item.entry.asaasPaymentId && item.entry.asaasStatus !== "RECEIVED" && activeCompany?.id) {
        // Confirmado manualmente (dinheiro/PIX fora do Asaas) mas o boleto ainda está
        // pendente/vencido lá — marca como recebido em dinheiro para não ficar "vencido"
        // na plataforma Asaas.
        supabase.functions.invoke("asaas-receive-in-cash", {
          body: { asaasPaymentId: item.entry.asaasPaymentId, paymentDate: payDate, value: valor, companyId: activeCompany.id },
        }).then(async ({ data, error }) => {
          if (error || data?.error) { console.error("[asaas-receive-in-cash]", data?.error || error); return; }
          const updated = loadFinancial().map(e => e.id === item.entry.id ? { ...e, asaasStatus: data.status || "RECEIVED_IN_CASH" } : e);
          await saveFinancial(updated);
        }).catch(() => {});
      }

      // Popup de confirmação para enviar ao cliente
      const dataPagamento = new Date(payDate + "T12:00:00").toLocaleDateString("pt-BR");
      const descricao = metaFor(item.catKey).label;
      const moto = item.motoId ? cache.motos.find((m) => m.id === item.motoId) ?? null : null;
      const rental = moto ? cache.rentals.find((r) => r.motoId === moto.id && r.status === "ativa") ?? null : null;
      const clienteObj = item.clienteId ? cache.clients.find((c) => c.id === item.clienteId) ?? null : null;

      const fmtBRL = (n: number) =>
        `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const valorOriginal = Number(item.entry.valor) || 0;
      const valorFmt = fmtBRL(valor);
      // dataPrevista original para semana e cálculo de atraso (não usa snooze date)
      const originalDueDateStr = item.entry.dataPrevista || item.entry.data;
      const originalDueDate = originalDueDateStr
        ? new Date(originalDueDateStr + "T12:00:00")
        : null;
      const dueDate = item.due || originalDueDate;
      const fmtDM = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      let vencimento = originalDueDate ? originalDueDate.toLocaleDateString("pt-BR") : dataPagamento;
      if (originalDueDate && rental) {
        const { inicio, fim } = computeSemanaPeriodo(rental, originalDueDate);
        if (inicio && fim) {
          const ini = new Date(inicio + "T12:00:00");
          const f = new Date(fim + "T12:00:00");
          vencimento = `${fmtDM(ini)} até ${fmtDM(f)}`;
        }
      }
      const motoLinha = item.placa
        ? `${item.placa}${item.modelo ? ` — ${item.modelo}` : ""}`
        : "—";

      // Semana paga (relativa ao início da locação) — usa dataPrevista original
      let semanaTxt = "";
      const semanaNum = computeSemanaNumero(rental ?? null, originalDueDate);
      if (semanaNum != null) semanaTxt = `${semanaNum}ª semana`;

      // Juros / multa por atraso — só para aluguel e caução, usando dataPrevista original
      const cobrancaCfg = activeCompany?.cobrancaConfig ?? { multaAtraso: 15, jurosDiario: 7, jurosMes: 0 };
      const payTs = new Date(payDate + "T12:00:00").getTime();
      const aplicaEncargos = ["aluguel", "caucao"].includes((item.catKey || "").toLowerCase());
      const diasAtraso = aplicaEncargos && originalDueDate ? Math.max(0, Math.floor((payTs - originalDueDate.getTime()) / 86400000)) : 0;
      const multa = diasAtraso > 0 ? (rental?.multaAtraso || cobrancaCfg.multaAtraso) : 0;
      const jurosMes = rental?.jurosAtrasoMes || cobrancaCfg.jurosMes || 0;
      const jurosCalc = diasAtraso > 0 ? valorOriginal * (jurosMes / 100 / 30) * diasAtraso : 0;
      const jurosDiarioFix = diasAtraso > 0 ? cobrancaCfg.jurosDiario * diasAtraso : 0;
      const jurosDevido = multa + jurosCalc + jurosDiarioFix;
      const excedente = Math.max(0, valor - valorOriginal);
      const jurosPago = Math.min(excedente, jurosDevido);
      const jurosPendente = Math.max(0, jurosDevido - jurosPago);

      // Bloco de atraso inline para aparecer diretamente na mensagem (sem token oculto)
      const blocoAtrasoLinhas: string[] = [];
      if (diasAtraso > 0 && jurosDevido > 0) {
        if (multa > 0) blocoAtrasoLinhas.push(`Multa: ${fmtBRL(multa)}`);
        if (jurosCalc + jurosDiarioFix > 0) blocoAtrasoLinhas.push(`Juros (${diasAtraso}d): ${fmtBRL(jurosCalc + jurosDiarioFix)}`);
      }
      const blocoAtrasoTxt = blocoAtrasoLinhas.length > 0 ? "\n" + blocoAtrasoLinhas.join("\n") : "";

      const linhas = [
        `✅ *PAGAMENTO CONFIRMADO*`,
        ``,
        `LOCATÁRIO: ${item.clienteNome || "[NOME]"}`,
        `MOTO: ${motoLinha}`,
        `VENCIMENTO: ${vencimento}${semanaTxt ? ` (${semanaTxt})` : ""}`,
        ``,
        `💰 *VALORES*`,
        `${descricao}: ${fmtBRL(valorOriginal)}${blocoAtrasoTxt}`,
        `─────────────`,
        `Total pago: *${valorFmt}*`,
        ``,
        `📅 *PAGAMENTO*`,
        `Data: {DATA_PAGAMENTO}`,
        `Banco: ${form.conta || "—"}`,
        ``,
        `— wayvo · dado · decisão · destino`,
      ];


      setPayConfirmPopup({
        mensagem: linhas.join("\n"),
        placa: item.placa || "—",
        cliente: item.clienteNome,
        telefone: item.telefoneCliente || "",
        highlights: [
          { label: "Valor pago", value: `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tone: "primary" },
        ],
        tokens: buildAllTokens({
          moto,
          rental,
          cliente: clienteObj,
          cobranca: buildCobrancaEvent({
            rental,
            entry: item.entry,
            due: dueDate,
            financial: cache.financial,
            diasAtraso,
            multa,
            jurosDevido,
            jurosPago,
            jurosPendente,
            dataPagamento: payDate,
          }),
        }),
      });
    } catch (err) {
      console.error(err);
      setConfirmItem(null);
      toast.error("Erro ao confirmar pagamento");
    }
  };

  const openReschedule = (item: RowItem) => {
    setReschedItem(item);
    // Pré-popula com o maior entre hoje e o vencimento atual, para que
    // adiar uma cobrança já vencida jogue ela para frente (não para o passado).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = item.due && item.due.getTime() > today.getTime() ? item.due : today;
    setReschedDate(toISODate(base));
  };

  const applyAdiarAtrasadas = () => {
    if (!adiarAtrasadas.length || !adiarDate) return;
    const newMap = { ...readSnoozeMap() };
    adiarAtrasadas.forEach(e => { newMap[e.id] = adiarDate; });
    writeSnoozeMap(newMap);
    setSnoozeMap(newMap);
    const d = new Date(adiarDate + "T00:00:00").toLocaleDateString("pt-BR");
    toast.success(`${adiarAtrasadas.length} cobrança${adiarAtrasadas.length !== 1 ? "s" : ""} adiada${adiarAtrasadas.length !== 1 ? "s" : ""} para ${d}`);
    setAdiarEntry(null);
    setAdiarAtrasadas([]);
    setDebtDetailClientId(null);
  };

  const applyRescheduleClient = () => {
    if (!reschedClientItems.length || !reschedClientDate) return;
    const newMap = { ...readSnoozeMap() };
    reschedClientItems.forEach(i => { newMap[i.entry.id] = reschedClientDate; });
    writeSnoozeMap(newMap);
    setSnoozeMap(newMap);
    const d = new Date(reschedClientDate + "T00:00:00").toLocaleDateString("pt-BR");
    toast.success(`${reschedClientItems.length} cobrança${reschedClientItems.length !== 1 ? "s" : ""} adiada${reschedClientItems.length !== 1 ? "s" : ""} para ${d}`);
    setReschedClientItems([]);
  };

  const applyReschedule = (newDate: string) => {
    const target = reschedItem;
    if (!target || !newDate) return;
    const newMap = { ...readSnoozeMap(), [target.entry.id]: newDate };
    writeSnoozeMap(newMap);
    setSnoozeMap(newMap);
    toast.success(`Cobrança adiada para ${new Date(newDate + "T00:00:00").toLocaleDateString("pt-BR")}`);
    setReschedItem(null);
  };

  const quickReschedule = (item: RowItem, deltaDays: number) => {
    // Base = HOJE (ou o vencimento, se ainda for futuro). Assim "Adiar +N dias"
    // sempre joga a cobrança para N dias à frente de hoje quando já está vencida,
    // tirando ela do estado "vencido" enquanto a locadora aguarda o cliente.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = item.due && item.due.getTime() > today.getTime() ? new Date(item.due) : today;
    const nd = new Date(base);
    nd.setDate(nd.getDate() + deltaDays);
    const iso = toISODate(nd);
    const newMap = { ...readSnoozeMap(), [item.entry.id]: iso };
    writeSnoozeMap(newMap);
    setSnoozeMap(newMap);
    toast.success(`Adiado para ${nd.toLocaleDateString("pt-BR")}`);
  };

  const handleIgnore = async (item: RowItem) => {
    try {
      const next = loadFinancial().map((e) =>
        e.id === item.entry.id ? { ...e, ignorada: true } : e,
      );
      await saveFinancial(next);
      toast.success("Cobrança ignorada");
    } catch {
      toast.error("Erro ao ignorar cobrança");
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const criarParcelamento = async () => {
    if (!parcelandoEntry) return;
    const valorOriginal = parcelandoEntry.valor || 0;
    const entrada = parseFloat(parcelForm.entrada.replace(",", ".")) || 0;
    const nParcelas = parseInt(parcelForm.nParcelas) || 2;
    const primeiraData = parcelForm.primeiraData;
    if (entrada < 0 || entrada >= valorOriginal) { toast.error("Valor de entrada inválido"); return; }
    if (nParcelas < 1) { toast.error("Mínimo 1 parcela"); return; }
    if (!primeiraData) { toast.error("Informe a data da 1ª parcela"); return; }
    const valorRestante = valorOriginal - entrada;
    const valorParcela = parseFloat((valorRestante / nParcelas).toFixed(2));
    const groupId = crypto.randomUUID();
    const rental = parcelandoEntry.rentalId ? rentalsById.get(parcelandoEntry.rentalId) : undefined;
    // Usa dataOriginal || data — NÃO dataPrevista (pode ter sido reagendada para outra semana)
    const due = parseISO(parcelandoEntry.dataOriginal || parcelandoEntry.data);
    let descBase = parcelandoEntry.descricao;
    if (rental && due) {
      const num = computeSemanaNumero(rental, due);
      const { inicio, fim } = computeSemanaPeriodo(rental, due);
      if (num && inicio && fim) {
        const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const freq = rental.frequenciaPagamento;
        const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
        descBase = `Aluguel – ${lbl} ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fim)}`;
      }
    }
    const addDaysLocal = (iso: string, d: number) => {
      const dt = new Date(iso + "T00:00:00");
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    };
    const base = {
      tipo: "receita" as const,
      categoria: "aluguel",
      subcategoria: "Parcelamento",
      motoId: parcelandoEntry.motoId,
      rentalId: parcelandoEntry.rentalId,
      clienteId: parcelandoEntry.clienteId,
      pago: false,
      conta: "",
      natureza: "operacional" as const,
      placa: parcelandoEntry.placa,
      clienteNome: parcelandoEntry.clienteNome,
      recurringGroupId: groupId,
      fixedOriginId: parcelandoEntry.id,
      tags: ["parcelamento", "aluguel"],
    };
    const newEntries: FinancialEntry[] = [];
    if (entrada > 0) {
      // Entrada é cobrada hoje — "Data da 1ª parcela" é só da 1ª parcela semanal,
      // para não cair no mesmo dia da entrada.
      const hoje = localToday();
      newEntries.push({ ...base, id: crypto.randomUUID(), descricao: `${descBase} – Entrada (Parcela 0/${nParcelas})`, valor: entrada, data: hoje, dataPrevista: hoje });
    }
    for (let i = 0; i < nParcelas; i++) {
      const data = addDaysLocal(primeiraData, i * 7);
      const v = i === nParcelas - 1 ? parseFloat((valorRestante - valorParcela * (nParcelas - 1)).toFixed(2)) : valorParcela;
      newEntries.push({ ...base, id: crypto.randomUUID(), descricao: `${descBase} – Parcela ${i + 1}/${nParcelas}`, valor: v, data, dataPrevista: data });
    }
    setParcelSalvando(true);
    try {
      const all = loadFinancial();
      const remaining = all.filter(e => e.id !== parcelandoEntry.id);
      await saveFinancial([...remaining, ...newEntries]);
      toast.success(`Parcelamento criado: ${nParcelas} parcela${nParcelas !== 1 ? "s" : ""}${entrada > 0 ? " + entrada" : ""}`);
      setParcelandoEntry(null);
    } finally {
      setParcelSalvando(false);
    }
  };

  const criarParcelamentoGrupo = async () => {
    if (!parcelandoGrupo) return;
    const selecionadas = parcelandoGrupo.filter(e => parcelGrupoSelected.has(e.id));
    if (selecionadas.length === 0) { toast.error("Selecione ao menos uma cobrança"); return; }
    const valorTotal = selecionadas.reduce((s, e) => s + valorAtualDe(e), 0);
    const entrada = parseFloat(parcelGrupoForm.entrada.replace(",", ".")) || 0;
    const valorParcela = parseFloat(parcelGrupoForm.valorParcela.replace(",", ".")) || 0;
    const primeiraData = parcelGrupoForm.primeiraData;
    if (entrada < 0 || entrada >= valorTotal) { toast.error("Valor de entrada inválido"); return; }
    if (valorParcela <= 0) { toast.error("Informe o valor da parcela"); return; }
    if (!primeiraData) { toast.error("Informe a data da 1ª parcela"); return; }
    const restante = parseFloat((valorTotal - entrada).toFixed(2));
    const nParcelas = Math.max(1, Math.ceil(restante / valorParcela));
    const addDaysLocal = (iso: string, d: number) => {
      const dt = new Date(iso + "T00:00:00");
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    };
    const fmtDt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
    const groupId = crypto.randomUUID();
    const primeira = selecionadas[0];
    const resumoItens = selecionadas
      .map(e => `• ${metaFor(e.categoria || "").label} — ${fmtBRL(valorAtualDe(e))} (venc. ${fmtDt(e.dataPrevista || e.data)})`)
      .join("\n");
    const observacaoBase = `Acordo de parcelamento de dívida — substitui ${selecionadas.length} cobrança${selecionadas.length !== 1 ? "s" : ""} em atraso, total ${fmtBRL(valorTotal)}:\n${resumoItens}`;
    // Herda placa/moto/locação das cobranças agrupadas quando todas pertencem à
    // mesma moto — só fica em branco se o acordo realmente mistura motos diferentes.
    const placasEnvolvidas = Array.from(new Set(selecionadas.map(e => e.placa).filter(Boolean)));
    const motoIdsEnvolvidos = Array.from(new Set(selecionadas.map(e => e.motoId).filter(Boolean)));
    const rentalIdsEnvolvidos = Array.from(new Set(selecionadas.map(e => e.rentalId).filter(Boolean)));
    const base = {
      tipo: "receita" as const,
      categoria: "outro_receita",
      subcategoria: "Parcelamento",
      motoId: motoIdsEnvolvidos.length === 1 ? motoIdsEnvolvidos[0] : null,
      rentalId: rentalIdsEnvolvidos.length === 1 ? rentalIdsEnvolvidos[0] : null,
      clienteId: primeira.clienteId,
      pago: false,
      conta: "",
      natureza: "operacional" as const,
      placa: placasEnvolvidas.join(", "),
      clienteNome: primeira.clienteNome,
      recurringGroupId: groupId,
      tags: ["parcelamento", "acordo-divida"],
      observacao: observacaoBase,
    };
    const newEntries: FinancialEntry[] = [];
    if (entrada > 0) {
      // Entrada é cobrada no dia do acordo (hoje) — "Data da 1ª parcela" é só da 1ª
      // parcela semanal, para não cair no mesmo dia da entrada.
      const hoje = localToday();
      newEntries.push({ ...base, id: crypto.randomUUID(), descricao: "Acordo de parcelamento de dívida – Entrada", valor: entrada, data: hoje, dataPrevista: hoje });
    }
    for (let i = 0; i < nParcelas; i++) {
      const data = addDaysLocal(primeiraData, i * 7);
      const v = i === nParcelas - 1 ? parseFloat((restante - valorParcela * (nParcelas - 1)).toFixed(2)) : valorParcela;
      newEntries.push({ ...base, id: crypto.randomUUID(), descricao: `Acordo de parcelamento de dívida – Parcela ${i + 1}/${nParcelas}`, valor: v, data, dataPrevista: data });
    }
    setParcelGrupoSalvando(true);
    try {
      const all = loadFinancial();
      const idsSel = new Set(selecionadas.map(e => e.id));
      const remaining = all.filter(e => !idsSel.has(e.id));
      await saveFinancial([...remaining, ...newEntries]);
      toast.success(`Acordo criado: ${nParcelas} parcela${nParcelas !== 1 ? "s" : ""}${entrada > 0 ? " + entrada" : ""}`);
      setParcelandoGrupo(null);
    } finally {
      setParcelGrupoSalvando(false);
    }
  };

  const corrigirReferenciasParcelamentos = async (clienteId: string) => {
    const all = loadFinancial();
    const byId = new Map(all.map(e => [e.id, e]));
    const getSuffix = (desc: string) => {
      const m = desc.match(/\s*[–-]\s*(Entrada\s*\(Parcela\s+\d+\/\d+\)|Parcela\s+\d+\/\d+)$/i);
      return m ? ` – ${m[1]}` : "";
    };
    let changed = 0;
    const updated = all.map(e => {
      if (e.clienteId !== clienteId || e.subcategoria !== "Parcelamento" || !e.fixedOriginId) return e;
      const original = byId.get(e.fixedOriginId);
      if (!original) return e;
      // Usa original.data — nunca dataOriginal (pode ter sido setado com data reagendada por bug antigo)
      const due = parseISO(original.data);
      const rental = e.rentalId ? rentalsById.get(e.rentalId) : undefined;
      let descBase = original.descricao || "";
      if (rental && due) {
        const num = computeSemanaNumero(rental, due);
        const { inicio, fim } = computeSemanaPeriodo(rental, due);
        if (num && inicio && fim) {
          const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const freq = rental.frequenciaPagamento;
          const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
          descBase = `Aluguel – ${lbl} ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fim)}`;
        }
      }
      const newDesc = descBase + getSuffix(e.descricao || "");
      if (newDesc === e.descricao) return e;
      changed++;
      return { ...e, descricao: newDesc };
    });
    if (changed === 0) { toast.info("Nenhuma referência precisava ser corrigida"); return; }
    await saveFinancial(updated);
    toast.success(`${changed} referência${changed !== 1 ? "s" : ""} atualizada${changed !== 1 ? "s" : ""}`);
  };

  const applyEditRef = async () => {
    if (!editRefEntry || !editRefDate) return;
    const rental = editRefEntry.rentalId ? rentalsById.get(editRefEntry.rentalId) : undefined;
    const due = parseISO(editRefDate);
    let newDesc = editRefEntry.descricao || "";
    if (rental && due) {
      const num = computeSemanaNumero(rental, due);
      const { inicio, fim } = computeSemanaPeriodo(rental, due);
      if (num && inicio && fim) {
        const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const freq = rental.frequenciaPagamento;
        const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
        const periodoLabel = `Aluguel – ${lbl} ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fim)}`;
        // Preserva sufixo após o período se houver (ex: "– Entrada (Parcela 1/4)")
        const suffix = (editRefEntry.descricao || "").replace(/^Aluguel\s*[–-]\s*(?:Semana|Quinzena|Mês)\s+\d+:\s+\d{2}\/\d{2}\s+até\s+\d{2}\/\d{2}/i, "").trim();
        newDesc = suffix ? `${periodoLabel} – ${suffix.replace(/^[–-]\s*/, "")}` : periodoLabel;
      }
    }
    try {
      const next = loadFinancial().map(e =>
        e.id === editRefEntry.id ? { ...e, descricao: newDesc } : e
      );
      await saveFinancial(next);
      toast.success("Referência de semana atualizada");
      setEditRefEntry(null);
      setEditRefDate("");
    } catch (err) {
      console.error("[applyEditRef] erro:", err);
      toast.error("Erro ao atualizar referência");
    }
  };

  // Corrige a semana de referência de um lote de parcelamentos a partir de uma data informada pelo usuário
  const applyEditParcelamento = async () => {
    if (!editRefEntry || !editRefDate) return;
    const all = loadFinancial();
    const rental = editRefEntry.rentalId ? rentalsById.get(editRefEntry.rentalId) : undefined;
    if (!rental) { toast.error("Locação não encontrada"); return; }
    const due = parseISO(editRefDate);
    const num = computeSemanaNumero(rental, due);
    const { inicio, fim } = computeSemanaPeriodo(rental, due);
    if (!num || !inicio || !fim) { toast.error("Data inválida para esta locação"); return; }
    const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const freq = rental.frequenciaPagamento;
    const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
    const descBase = `Aluguel – ${lbl} ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fim)}`;
    const getSuffix = (desc: string) => {
      const m = desc.match(/\s*[–-]\s*(Entrada\s*\(Parcela\s+\d+\/\d+\)|Parcela\s+\d+\/\d+)$/i);
      return m ? ` – ${m[1]}` : "";
    };
    const groupId = editRefEntry.recurringGroupId;
    const originId = editRefEntry.fixedOriginId;
    let changed = 0;
    const updated = all.map(e => {
      const inGroup = groupId
        ? e.recurringGroupId === groupId
        : originId
          ? e.fixedOriginId === originId
          : e.id === editRefEntry.id;
      if (!inGroup || e.subcategoria !== "Parcelamento") return e;
      const newDesc = descBase + getSuffix(e.descricao || "");
      changed++;
      return { ...e, descricao: newDesc };
    });
    if (changed === 0) { toast.error("Nenhuma parcela encontrada no grupo"); return; }
    try {
      await saveFinancial(updated);
      toast.success(`${changed} parcela${changed !== 1 ? "s" : ""} atualizada${changed !== 1 ? "s" : ""}`);
      setEditRefEntry(null);
      setEditRefDate("");
    } catch (err) {
      console.error("[applyEditParcelamento] erro ao salvar:", err);
      toast.error("Erro ao atualizar referências");
    }
  };

  const openWhatsApp = (item: RowItem, type: MsgType) => {
    const msg = applyTokens(type.template, tokensFor(item));
    const url = buildWhatsAppUrl(item.telefoneCliente, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const contas = useMemo(() => {
    const set = new Set<string>();
    cache.bankAccounts.forEach((b) => b.nome && set.add(b.nome));
    cache.financial.forEach((e) => e.conta && set.add(e.conta));
    return Array.from(set).sort();
  }, [cache.bankAccounts, cache.financial]);

  // Progress bar segments
  const barTotal = weekPrevisao.pago + totalSemanaPendente + totalAtrasado;
  const recPct   = barTotal > 0 ? (weekPrevisao.pago / barTotal) * 100 : 0;
  const pendPct  = barTotal > 0 ? (totalSemanaPendente / barTotal) * 100 : 0;
  const atrasadoPct = barTotal > 0 ? (totalAtrasado / barTotal) * 100 : 0;

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── STICKY HEADER ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background border-b">

        {/* Sub-seção 1: título + botões */}
        <div className="px-5 pt-4 pb-3 flex items-start justify-between">
          <div>
            <h1 className="text-[15px] font-medium tracking-tight">Cobranças da semana</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {monday.getDate()} {MONTH_SHORT[monday.getMonth()]} – {sunday.getDate()} {MONTH_SHORT[sunday.getMonth()]}
              {" · "}{weekItems.length} agendadas
              {overdueVisible.length > 0 && (
                <span className="text-destructive"> · {overdueVisible.length} em atraso</span>
              )}
              {overdueVisible.length === 0 && overdueSnoozed.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> · {overdueSnoozed.length} adiada{overdueSnoozed.length !== 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] gap-1.5 rounded-md">
              <LayoutDashboard className="h-3 w-3" />
              Painel geral
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Sub-seção 2: métricas em 4 células */}
        <div className="grid grid-cols-4 divide-x border-t border-b border-border/50">
          <div className="px-3.5 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[.5px] text-muted-foreground/70 mb-1">Locações ativas</div>
            <div className="text-[17px] font-medium tabular-nums tracking-tight leading-none text-foreground">
              {aluguelStats.totalActive}
            </div>
            <div className={`text-[10px] mt-1 font-medium ${missingRentals.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              {missingRentals.length > 0
                ? `⚠ ${missingRentals.length} sem cobrança`
                : "todas com cobrança"}
            </div>
          </div>
          <div className="px-3.5 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[.5px] text-muted-foreground/70 mb-1">Recebido</div>
            <div className="text-[17px] font-medium tabular-nums tracking-tight leading-none text-emerald-600">
              {fmtBRL(weekPrevisao.pago)}
            </div>
            <div className="text-[10px] mt-1 text-muted-foreground">
              {aluguelStats.pagas} pagamento{aluguelStats.pagas !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="px-3.5 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[.5px] text-muted-foreground/70 mb-1">A receber</div>
            <div className="text-[17px] font-medium tabular-nums tracking-tight leading-none text-primary">
              {fmtBRL(totalSemanaPendente)}
            </div>
            <div className="text-[10px] mt-1 text-muted-foreground">
              {weekItems.length} pendente{weekItems.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            className={`px-3.5 py-2.5 text-left transition-colors w-full ${
              overdueSnoozed.length > 0
                ? "bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/30 cursor-pointer"
                : "cursor-default"
            }`}
            onClick={() => overdueSnoozed.length > 0 && setSnoozedExpanded(v => !v)}
            disabled={overdueSnoozed.length === 0}
          >
            <div className="text-[9px] font-semibold uppercase tracking-[.5px] text-muted-foreground/70 mb-1 flex items-center gap-1">
              Adiadas
              {overdueSnoozed.length > 0 && (
                <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
              )}
            </div>
            <div className={`text-[17px] font-medium tabular-nums tracking-tight leading-none ${
              overdueSnoozed.length > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-600"
            }`}>
              {overdueSnoozed.length > 0
                ? fmtBRL(overdueSnoozed.reduce((s, i) => s + (i.entry.valor || 0), 0))
                : "Nenhuma"}
            </div>
            <div className={`text-[10px] mt-1 flex items-center gap-1 ${
              overdueSnoozed.length > 0 ? "text-amber-600/80 dark:text-amber-500/80" : "text-muted-foreground"
            }`}>
              {overdueSnoozed.length > 0
                ? <>{overdueSnoozed.length} cobrança{overdueSnoozed.length !== 1 ? "s" : ""} · {snoozedExpanded ? "▲" : "▼"}</>
                : "sem adiamentos"}
            </div>
          </button>
        </div>

        {/* Banner de saúde */}
        <div className={`px-4 py-2 border-b flex items-center gap-2 text-[11px] font-semibold transition-colors ${
          overdueVisible.length > 0
            ? "bg-destructive/[.07] text-destructive border-destructive/15"
            : overdueSnoozed.length > 0 || missingRentals.length > 0
              ? "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30"
              : "bg-emerald-50/60 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30"
        }`}>
          {overdueVisible.length > 0 ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{overdueVisible.length} cobrança{overdueVisible.length !== 1 ? "s" : ""} em atraso · {fmtBRL(totalAtrasado)}{overdueSnoozed.length > 0 ? ` · ${overdueSnoozed.length} adiada${overdueSnoozed.length !== 1 ? "s" : ""}` : ""}</span>
            </>
          ) : overdueSnoozed.length > 0 ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{overdueSnoozed.length} cobrança{overdueSnoozed.length !== 1 ? "s" : ""} adiada{overdueSnoozed.length !== 1 ? "s" : ""} · vence{overdueSnoozed.length !== 1 ? "m" : ""} em breve</span>
            </>
          ) : missingRentals.length > 0 ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{missingRentals.length} locaç{missingRentals.length === 1 ? "ão" : "ões"} sem cobrança esta semana</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Tudo dentro do esperado · sem atrasos</span>
            </>
          )}
        </div>

        {/* Sub-seção 3: barra de progresso tripartida + legenda */}
        <div className="px-4 pt-1.5 pb-3.5">
          <div className="h-[3px] rounded-full overflow-hidden flex gap-px bg-border/30">
            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${recPct}%` }} />
            <div className="bg-primary h-full transition-all" style={{ width: `${pendPct}%` }} />
            <div className="bg-destructive h-full transition-all" style={{ width: `${atrasadoPct}%` }} />
          </div>
          <div className="flex gap-4 mt-1.5">
            <span className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
              {fmtBRL(weekPrevisao.pago)} recebido
            </span>
            <span className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block shrink-0" />
              {fmtBRL(totalSemanaPendente)} pendente
            </span>
            <span className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block shrink-0" />
              {fmtBRL(totalAtrasado)} atrasado
            </span>
          </div>
        </div>
      </div>

      {/* ── DAY STRIP ────────────────────────────────────────────── */}
      <div className="bg-background border-b px-4 py-2.5 flex gap-1 overflow-x-auto">
        {/* "Todos" */}
        <button
          onClick={() => setDayFilter("all")}
          className={`w-14 shrink-0 flex flex-col items-center gap-0 rounded-lg border px-1 py-1.5 cursor-pointer transition-all ${
            dayFilter === "all" ? "bg-foreground border-foreground" : "border-transparent hover:bg-muted/50"
          }`}
        >
          <span className={`text-[9px] font-semibold uppercase tracking-[.5px] ${dayFilter === "all" ? "text-background/90" : "text-muted-foreground/60"}`}>
            Todos
          </span>
          <span className={`text-[15px] font-medium leading-tight ${dayFilter === "all" ? "text-background/90" : "text-foreground"}`}>
            {weekItems.length}
          </span>
          <span className={`text-[9px] tabular-nums ${dayFilter === "all" ? "text-background/70" : "text-muted-foreground/60"}`}>
            {weekItems.length > 0 ? `R$ ${Math.round(weekItems.reduce((s, i) => s + (i.entry.valor || 0), 0))}` : "—"}
          </span>
          <div className={`w-7 h-[2px] rounded-full mt-[3px] ${dayFilter === "all" ? "bg-background/20" : "bg-border"}`} />
        </button>

        {weekStrip.map((d) => {
          const isActive = dayFilter === d.dow;
          const isEmpty = d.count === 0;
          const paidCount = weekDayPaid.get(d.dow) || 0;
          const totalCount = d.count + paidCount;
          const paidPct = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;
          return (
            <button
              key={d.dow}
              onClick={() => setDayFilter(isActive ? "all" : d.dow)}
              disabled={isEmpty && !isActive}
              className={`w-[62px] shrink-0 flex flex-col items-center gap-0 rounded-lg border px-1 py-1.5 cursor-pointer transition-all ${
                isActive
                  ? "bg-foreground border-foreground"
                  : d.isToday
                    ? "border-primary/40"
                    : isEmpty
                      ? "opacity-30 pointer-events-none border-transparent"
                      : "border-transparent hover:bg-muted/50"
              }`}
            >
              <span className={`text-[9px] font-semibold uppercase tracking-[.5px] ${
                isActive ? "text-background/90" : d.isToday ? "text-primary" : "text-muted-foreground/60"
              }`}>
                {WEEK_SHORT[d.dow]}
              </span>
              <span className={`text-[15px] font-medium leading-tight ${
                isActive ? "text-background/90" : d.isToday ? "text-primary" : "text-foreground"
              }`}>
                {d.date.getDate()}
              </span>
              <span className={`text-[9px] tabular-nums ${isActive ? "text-background/70" : "text-muted-foreground/60"}`}>
                {d.total > 0 ? `R$ ${Math.round(d.total)}` : "—"}
              </span>
              {d.isToday && !isActive && (
                <span className="w-[3px] h-[3px] rounded-full bg-primary mx-auto mt-0.5" />
              )}
              <div className={`w-7 h-[2px] rounded-full mt-[3px] overflow-hidden ${isActive ? "bg-background/20" : "bg-border"}`}>
                <div
                  className={`h-full rounded-full ${isActive ? "bg-background/80" : "bg-emerald-500"}`}
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── SEARCH ───────────────────────────────────────────────── */}
      <div className="bg-background border-b px-4 py-2">
        <div className="flex items-center gap-2 h-[34px] bg-muted/50 border border-transparent rounded-[7px] px-2.5">
          <Search className="h-[13px] w-[13px] text-muted-foreground/50 shrink-0" />
          <input
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/40"
            placeholder="Buscar cliente, placa ou modelo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="w-px h-3.5 bg-border/60 shrink-0" />
          <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 shrink-0">
            <SlidersHorizontal className="h-3 w-3" />
            Filtros
          </button>
        </div>
      </div>

      {/* ── CONTENT ──────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-6 flex flex-col gap-2.5">

        {/* ── Breakdown por categoria ── */}
        <div className="rounded-[10px] border border-border/60 overflow-hidden divide-y divide-border/40">
          {/* Aluguel fixo */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-card">
            <Wallet className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
            <span className="text-[11px] font-semibold flex-1">Aluguel fixo</span>
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              {aluguelStats.pagas > 0 && (
                <span className="text-emerald-600 font-medium">✓ {aluguelStats.pagas} · {fmtBRL(aluguelStats.valorPago)}</span>
              )}
              {aluguelStats.pendentes > 0 && (
                <span className="text-primary font-medium">{aluguelStats.pendentes} pendente{aluguelStats.pendentes !== 1 ? "s" : ""} · {fmtBRL(aluguelStats.valorPendente)}</span>
              )}
              {aluguelStats.pagas === 0 && aluguelStats.pendentes === 0 && (
                <span className="text-muted-foreground">nenhum esta semana</span>
              )}
            </div>
          </div>

          {/* Em atraso — aluguel */}
          {overdueItems.filter(i => i.catKey === "aluguel").length > 0 && (() => {
            const overdueAluguel = overdueItems.filter(i => i.catKey === "aluguel");
            return (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-destructive/[.03]">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive/70 flex-shrink-0" />
                <span className="text-[11px] font-semibold flex-1 text-destructive/80">Aluguel em atraso</span>
                <span className="text-[11px] tabular-nums text-destructive font-medium">
                  {overdueAluguel.length} · {fmtBRL(overdueAluguel.reduce((s, i) => s + (i.entry.valor || 0), 0))}
                </span>
              </div>
            );
          })()}

          {/* Extras por categoria */}
          {outrosRecebimentos.map(({ catKey, count, valor, paidCount, paidValor }) => {
            const meta = metaFor(catKey);
            const Icon = meta.icon;
            const totalCount = count + paidCount;
            const totalValor = valor + paidValor;
            // Exclui atrasos não-aluguel que já aparecem no overdueItems
            const overdueNaoAluguel = overdueItems.filter(i => i.catKey === catKey).reduce((s, i) => s + (i.entry.valor || 0), 0);
            return (
              <div key={catKey} className="flex items-center gap-2 px-3.5 py-2.5 bg-card">
                <Icon className={`h-3.5 w-3.5 ${meta.tone.text} flex-shrink-0`} />
                <span className="text-[11px] font-semibold flex-1">{meta.label}</span>
                <div className="flex items-center gap-3 text-[11px] tabular-nums">
                  {paidCount > 0 && (
                    <span className="text-emerald-600 font-medium">✓ {paidCount} · {fmtBRL(paidValor)}</span>
                  )}
                  {count > 0 && (
                    <span className={`font-medium ${meta.tone.text}`}>{count} pendente{count !== 1 ? "s" : ""} · {fmtBRL(valor)}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Sem cobrança */}
          {missingRentals.length > 0 && (
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-50/60 dark:bg-amber-950/10 cursor-pointer select-none"
              onClick={() => setMissingExpanded(v => !v)}
            >
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-[11px] font-semibold flex-1 text-amber-700 dark:text-amber-400">
                Sem cobrança esta semana
              </span>
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 tabular-nums mr-1">
                {missingRentals.length} locaç{missingRentals.length === 1 ? "ão" : "ões"}
              </span>
              {missingExpanded
                ? <ChevronUp className="h-3 w-3 text-amber-500" />
                : <ChevronDown className="h-3 w-3 text-amber-500" />}
            </div>
          )}
        </div>

        {/* Painel expandido: locações sem cobrança */}
        {missingExpanded && missingRentals.length > 0 && (
          <div className="rounded-[10px] border border-amber-200 dark:border-amber-800 overflow-hidden divide-y divide-amber-100 dark:divide-amber-900">
            <div className="px-3.5 py-2 bg-amber-50/80 dark:bg-amber-950/20">
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Estas locações não têm nenhum aluguel pendente nem em atraso. Verifique se a cobrança foi gerada corretamente.
              </p>
            </div>
            {missingRentals.map(({ rental, placa, modelo, clienteNome, telefone, diasSemPagamento }) => (
              <div key={rental.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-background hover:bg-amber-50/30 dark:hover:bg-amber-950/10 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium truncate">{clienteNome}</span>
                    <span className="font-mono text-[9px] bg-muted border border-border/50 rounded-[3px] px-1.5 py-px tracking-[.5px] text-muted-foreground flex-shrink-0">
                      {placa}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-px">
                    {modelo && `${modelo} · `}
                    {diasSemPagamento !== null
                      ? `Último pagamento: ${diasSemPagamento}d atrás`
                      : "Nunca pagou"}
                  </p>
                </div>
                {telefone && (
                  <a
                    href={`https://wa.me/55${telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 rounded-[7px] border border-emerald-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors flex-shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Em atraso */}
        {(filteredOverdueVisible.length > 0 || filteredOverdueSnoozed.length > 0) && (
          <div className="rounded-[10px] overflow-hidden border border-destructive/30 shadow-sm">
            {filteredOverdueVisible.length > 0 && (() => {
              // Agrupa por cliente — resolve nome→id para evitar duplicatas quando clienteId está ausente em algumas entradas
              const nomeToId = new Map<string, string>();
              filteredOverdueVisible.forEach(i => { if (i.clienteId && i.clienteNome) nomeToId.set(i.clienteNome, i.clienteId); });
              const byClient = new Map<string, RowItem[]>();
              filteredOverdueVisible.forEach(i => {
                const key = i.clienteId || nomeToId.get(i.clienteNome) || i.clienteNome;
                byClient.set(key, [...(byClient.get(key) || []), i]);
              });
              // Ordena pelo maior atraso de cada cliente (desc)
              const clientGroups = [...byClient.entries()]
                .map(([key, items]) => ({
                  key,
                  items,
                  maxDays: Math.max(...items.map(i => i.originalDaysLate)),
                  total: items.reduce((s, i) => s + calcValorAtualizado(i.entry, i.daysLate), 0),
                }))
                .sort((a, b) => b.maxDays - a.maxDays);

              const urgencyStyle = (days: number) =>
                days >= 8
                  ? { textCls: "text-destructive", badgeCls: "bg-destructive/15", dot: "bg-destructive" }
                  : days >= 4
                  ? { textCls: "text-orange-700 dark:text-orange-400", badgeCls: "bg-orange-500/15", dot: "bg-orange-500" }
                  : { textCls: "text-amber-700 dark:text-amber-400", badgeCls: "bg-amber-500/15", dot: "bg-amber-500" };

              return (
                <>
                  <div className="bg-destructive/[.08] border-b border-destructive/20 px-3.5 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-[10px] font-bold uppercase tracking-[.6px] text-destructive">Em atraso</span>
                      <span className="text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-px leading-none">
                        {clientGroups.length} cliente{clientGroups.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-[13px] font-bold text-destructive tabular-nums">
                      {fmtBRL(filteredOverdueVisible.reduce((s, i) => s + calcValorAtualizado(i.entry, i.daysLate), 0))}
                    </span>
                  </div>
                  <div className="bg-background divide-y divide-border/30">
                    {clientGroups.map(({ key, items, maxDays, total }) => {
                      const { textCls, badgeCls, dot } = urgencyStyle(maxDays);
                      const clienteId = items[0].clienteId;
                      const placas = [...new Set(items.map(i => i.entry.placa).filter(Boolean))];
                      return (
                        <div key={key} className="flex items-center gap-1 pr-1 hover:bg-muted/30 transition-colors">
                          <button
                            className="flex-1 px-3.5 py-2.5 flex items-center justify-between gap-3 text-left min-w-0"
                            onClick={() => clienteId && setDebtDetailClientId(clienteId)}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot}`} />
                              <span className={`text-[12px] font-bold truncate ${textCls}`}>{items[0].clienteNome}</span>
                              {placas.map(p => (
                                <span key={p} className="font-mono text-[10px] bg-muted border border-border/50 rounded px-1.5 py-px text-muted-foreground flex-shrink-0">{p}</span>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[10px] font-bold ${badgeCls} rounded-full px-2 py-px ${textCls}`}>
                                {items.length} pendente{items.length !== 1 ? "s" : ""} · {maxDays}d
                              </span>
                              <span className={`text-[13px] font-bold tabular-nums ${textCls}`}>{fmtBRL(total)}</span>
                            </div>
                          </button>
                          <button
                            title="Adiar cobranças"
                            onClick={() => {
                              const base = new Date();
                              base.setHours(0, 0, 0, 0);
                              setReschedClientItems(items);
                              setReschedClientDate(toISODate(base));
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors flex-shrink-0"
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Adiadas — expandido via KPI */}
        {snoozedExpanded && filteredOverdueSnoozed.length > 0 && (() => {
          const nomeToId = new Map<string, string>();
          filteredOverdueSnoozed.forEach(i => { if (i.clienteId && i.clienteNome) nomeToId.set(i.clienteNome, i.clienteId); });
          const byClient = new Map<string, RowItem[]>();
          filteredOverdueSnoozed.forEach(i => {
            const key = i.clienteId || nomeToId.get(i.clienteNome) || i.clienteNome;
            byClient.set(key, [...(byClient.get(key) || []), i]);
          });
          const clientGroups = [...byClient.entries()]
            .map(([key, items]) => ({
              key,
              items,
              maxDays: Math.max(...items.map(i => i.originalDaysLate)),
              total: items.reduce((s, i) => s + (i.entry.valor || 0), 0),
            }))
            .sort((a, b) => b.maxDays - a.maxDays);

          const urgencyStyle = (days: number) =>
            days >= 8
              ? { textCls: "text-destructive", badgeCls: "bg-destructive/15", dot: "bg-destructive" }
              : days >= 4
              ? { textCls: "text-orange-700 dark:text-orange-400", badgeCls: "bg-orange-500/15", dot: "bg-orange-500" }
              : { textCls: "text-amber-700 dark:text-amber-400", badgeCls: "bg-amber-500/15", dot: "bg-amber-500" };

          return (
            <div className="rounded-[10px] overflow-hidden border border-amber-300 dark:border-amber-800 shadow-sm">
              <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[.6px] text-amber-700 dark:text-amber-400">Adiadas · risco de inadimplência</span>
                  <span className="text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-px leading-none">
                    {clientGroups.length} cliente{clientGroups.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-[13px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {fmtBRL(filteredOverdueSnoozed.reduce((s, i) => s + (i.entry.valor || 0), 0))}
                </span>
              </div>
              <div className="bg-background divide-y divide-border/30">
                {clientGroups.map(({ key, items, maxDays, total }) => {
                  const { textCls, badgeCls, dot } = urgencyStyle(maxDays);
                  const clienteId = items[0].clienteId;
                  const placas = [...new Set(items.map(i => i.entry.placa).filter(Boolean))];
                  return (
                    <button
                      key={key}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => clienteId && setDebtDetailClientId(clienteId)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot}`} />
                        <span className={`text-[12px] font-bold truncate ${textCls}`}>{items[0].clienteNome}</span>
                        {placas.map(p => (
                          <span key={p} className="font-mono text-[10px] bg-muted border border-border/50 rounded px-1.5 py-px text-muted-foreground flex-shrink-0">{p}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-bold ${badgeCls} rounded-full px-2 py-px ${textCls}`}>
                          {items.length} pendente{items.length !== 1 ? "s" : ""} · {maxDays}d
                        </span>
                        <span className={`text-[13px] font-bold tabular-nums ${textCls}`}>{fmtBRL(total)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Hoje */}
        {filteredToday.length > 0 && (
          <div className="rounded-[10px] overflow-hidden border border-primary/30 shadow-sm">
            <div className="bg-primary/[.07] border-b border-primary/20 px-3.5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[.6px] text-primary">Hoje</span>
                <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-px leading-none">
                  {filteredToday.length}
                </span>
              </div>
              <span className="text-[13px] font-bold text-primary tabular-nums">
                {fmtBRL(filteredToday.reduce((s, i) => s + (i.entry.valor || 0), 0))}
              </span>
            </div>
            <div className="bg-background divide-y divide-border/50">
              {filteredToday.map((it) => (
                <RowItemView key={it.entry.id} item={it} onConfirm={openConfirm} onMessage={handleMessage}
                  onWhatsApp={openWhatsApp} onCopy={copyText} onRescheduleQuick={quickReschedule}
                  onRescheduleCustom={openReschedule} onIgnore={handleIgnore}
                  onClientClick={(id) => setDebtDetailClientId(id)} />
              ))}
            </div>
          </div>
        )}

        {/* Próximas cobranças desta semana */}
        {filteredToday.length === 0 && filteredUpcoming.length === 0 && filteredOverdueVisible.length === 0 && filteredOverdueSnoozed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground/50">
              {weekItems.length === 0 ? "Nenhuma cobrança esta semana" : "Nenhuma cobrança para este filtro"}
            </p>
            <p className="text-[11px] text-muted-foreground/35">
              {weekItems.length === 0 ? "As cobranças agendadas aparecem aqui" : "Tente remover os filtros"}
            </p>
          </div>
        ) : filteredUpcoming.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            {filteredToday.length > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-[.5px] text-muted-foreground/50 px-0.5 pt-1">
                Próximas
              </p>
            )}
            {groupedUpcoming.map((g) => {
              const dayTotal = g.items.reduce((s, i) => s + (i.entry.valor || 0), 0);
              return (
                <div key={g.dow}>
                  <div className="flex justify-between items-center px-0.5 pb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[.4px] text-muted-foreground">
                      {WEEK_LONG[g.dow]} {g.date.getDate()}/{g.date.getMonth() + 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {g.items.length} · {fmtBRL(dayTotal)}
                    </span>
                  </div>
                  <div className="rounded-[10px] border border-border/60 overflow-hidden divide-y divide-border/50 bg-card">
                    {g.items.map((it) => (
                      <RowItemView key={it.entry.id} item={it} onConfirm={openConfirm} onMessage={handleMessage}
                        onWhatsApp={openWhatsApp} onCopy={copyText} onRescheduleQuick={quickReschedule}
                        onRescheduleCustom={openReschedule} onIgnore={handleIgnore}
                        onClientClick={(id) => setDebtDetailClientId(id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MessagePopup ─────────────────────────────────────────── */}
      {msgState && (() => {
        const { item, type } = msgState;
        const moto = item.motoId ? cache.motos.find((m) => m.id === item.motoId) ?? null : null;
        const rental = item.entry.rentalId
          ? cache.rentals.find((r) => r.id === item.entry.rentalId) ?? null
          : (moto ? cache.rentals.find((r) => r.motoId === moto.id && r.status === "ativa") ?? null : null);
        const cliente = item.clienteId ? cache.clients.find((c) => c.id === item.clienteId) ?? null : null;
        const baseTokens = buildAllTokens({
          moto,
          rental,
          cliente,
          cobranca: buildCobrancaEvent({
            rental,
            entry: item.entry,
            due: item.due,
            financial: cache.financial,
            diasAtraso: item.daysLate,
          }),
        });
        // Mantém tokens locais simples (compatibilidade com templates antigos)
        const tokens = { ...tokensFor(item), ...baseTokens };
        const mensagem = applyTokens(type.template, tokens);
        return (
          <MessagePopup
            open
            onOpenChange={(o) => !o && setMsgState(null)}
            title={type.label}
            mensagem={mensagem}
            placa={item.placa || "—"}
            cliente={item.clienteNome}
            telefone={item.telefoneCliente || ""}
            highlights={type.highlights(item)}
            templateKey={`cobranca-semana-${type.key}`}
            tokens={tokens}
            paletteContext="cobranca"
          />
        );
      })()}

      {/* ── MessagePopup: Confirmação de pagamento ───────────────── */}
      {payConfirmPopup && (
        <MessagePopup
          open={!!payConfirmPopup}
          onOpenChange={(o) => !o && setPayConfirmPopup(null)}
          title="Confirmação de Pagamento"
          mensagem={payConfirmPopup.mensagem}
          placa={payConfirmPopup.placa}
          cliente={payConfirmPopup.cliente}
          telefone={payConfirmPopup.telefone}
          highlights={payConfirmPopup.highlights}
          templateKey="pagamento:confirmacao"
          tokens={payConfirmPopup.tokens}
          paletteContext="cobranca"
        />
      )}

      {/* ── Dialog: Confirmar pagamento (mesmo fluxo do Financeiro) ── */}
      <Dialog open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {confirmItem?.entry.tipo === "receita" ? "✅ Confirmar Recebimento" : "✅ Confirmar Pagamento"}
            </DialogTitle>
          </DialogHeader>
          {confirmItem && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Resumo */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descrição:</span>
                  <span className="font-medium text-right max-w-[60%]">{confirmItem.entry.descricao || metaFor(confirmItem.catKey).label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoria:</span>
                  <span className="font-medium">{metaFor(confirmItem.catKey).label}</span>
                </div>
                {confirmItem.clienteNome && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Locatário:</span>
                    <span className="font-medium">{confirmItem.clienteNome}</span>
                  </div>
                )}
                {confirmItem.placa && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Moto:</span>
                    <span className="font-medium">{confirmItem.placa}{confirmItem.modelo ? ` · ${confirmItem.modelo}` : ""}</span>
                  </div>
                )}
                {confirmItem.due && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vencimento:</span>
                    <span className={`font-medium ${confirmItem.daysLate > 0 ? "text-destructive" : ""}`}>
                      {confirmItem.due.toLocaleDateString("pt-BR")}
                      {confirmItem.daysLate > 0 && ` (${confirmItem.daysLate}d atraso)`}
                    </span>
                  </div>
                )}
                {form.data && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagamento:</span>
                    <span className="font-medium">{new Date(form.data + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
                {/* Referência de semana/período */}
                {(() => {
                  const src = (confirmItem.entry.descricao || "") + " " + (confirmItem.entry.observacao || "");
                  const m = src.match(/((?:Semana|Quinzena|M[eê]s)\s+\d+:\s*\d{2}\/\d{2}\s+até\s+\d{2}\/\d{2})/i);
                  if (!m) return null;
                  return (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Referência:</span>
                      <span className="font-semibold text-primary">{m[1]}</span>
                    </div>
                  );
                })()}
                {/* Valor editável */}
                <div className="flex justify-between items-center pt-1 border-t mt-1">
                  <span className="text-muted-foreground">Valor:</span>
                  <Input
                    className="w-32 h-8 text-right text-sm font-semibold"
                    style={{ color: confirmItem.entry.tipo === "receita" ? "#16a34a" : "#dc2626" }}
                    inputMode="decimal"
                    value={confirmValor}
                    onChange={e => { setConfirmValor(e.target.value); setConfirmValorEditado(true); }}
                  />
                </div>
              </div>

              {/* Bloco de multa/juros — mesmo do Financeiro */}
              {confirmItem.entry.categoria === "aluguel" && form.data && !isSaldoRestanteEntry(confirmItem.entry) && (() => {
                const dueDateStr = confirmItem.entry.dataPrevista || confirmItem.entry.data;
                if (!dueDateStr) return null;
                const due = new Date(dueDateStr + "T00:00:00");
                const pay = new Date(form.data + "T00:00:00");
                const daysOverdue = Math.max(0, Math.floor((pay.getTime() - due.getTime()) / 86400000));
                if (daysOverdue === 0) return null;
                const cfg = activeCompany?.cobrancaConfig ?? DEFAULT_COBRANCA_CONFIG;
                const rental = confirmItem.entry.rentalId ? rentalsById.get(confirmItem.entry.rentalId) : undefined;
                const multa = rental?.multaAtraso ?? cfg.multaAtraso ?? 0;
                const jurosMes = rental?.jurosAtrasoMes ?? cfg.jurosMes ?? 0;
                const jurosDiario = cfg.jurosDiario ?? 0;
                const base = confirmItem.entry.valor || 0;
                const jurosPct = base * (jurosMes / 100 / 30) * daysOverdue;
                const jurosDiarioTotal = jurosDiario * daysOverdue;
                const totalJuros = jurosPct + jurosDiarioTotal;
                const total = base + multa + totalJuros;
                const temAcrescimo = multa > 0 || totalJuros > 0;
                if (!temAcrescimo) return null;
                const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return (
                  <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 text-sm space-y-1.5">
                    <p className="font-semibold text-orange-700 dark:text-orange-400">⚠️ Pagamento em atraso — {daysOverdue} dia(s)</p>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between"><span>Valor original:</span><span>{fmt(base)}</span></div>
                      {multa > 0 && <div className="flex justify-between"><span>Multa de atraso:</span><span className="text-orange-600">+ {fmt(multa)}</span></div>}
                      {jurosDiarioTotal > 0 && <div className="flex justify-between"><span>Juros diários (R$ {jurosDiario}/dia × {daysOverdue}d):</span><span className="text-orange-600">+ {fmt(jurosDiarioTotal)}</span></div>}
                      {jurosPct > 0 && <div className="flex justify-between"><span>Juros {jurosMes}%/mês ({daysOverdue}d):</span><span className="text-orange-600">+ {fmt(jurosPct)}</span></div>}
                      <div className="flex justify-between font-semibold text-foreground border-t pt-1"><span>Total a receber:</span><span>{fmt(total)}</span></div>
                    </div>
                  </div>
                );
              })()}

              {/* Aviso de pagamento parcial (valor recebido < total devido) — o total
                  devido já inclui multa/juros de atraso quando aplicável, pra não
                  perder o saldo restante quando o recebimento parcial é sobre uma
                  cobrança em atraso. */}
              {!confirmItem.entry.pago && confirmItem.entry.tipo === "receita" && (() => {
                let base = confirmItem.entry.valor || 0;
                const rental = confirmItem.entry.categoria === "aluguel" && confirmItem.entry.rentalId
                  ? rentalsById.get(confirmItem.entry.rentalId)
                  : undefined;
                const dueDateStr = confirmItem.entry.dataPrevista || confirmItem.entry.data;
                if (rental && dueDateStr && form.data && !isSaldoRestanteEntry(confirmItem.entry)) {
                  const due = new Date(dueDateStr + "T00:00:00");
                  const pay = new Date(form.data + "T00:00:00");
                  const daysOverdue = Math.max(0, Math.floor((pay.getTime() - due.getTime()) / 86400000));
                  if (daysOverdue > 0) {
                    const cfg = activeCompany?.cobrancaConfig ?? DEFAULT_COBRANCA_CONFIG;
                    const multa = rental.multaAtraso || cfg.multaAtraso || 0;
                    const jurosMes = rental.jurosAtrasoMes || cfg.jurosMes || 0;
                    const jurosCalc = (confirmItem.entry.valor * (jurosMes / 100 / 30)) * daysOverdue;
                    const jurosDiarioFix = (cfg.jurosDiario || 0) * daysOverdue;
                    base += multa + jurosCalc + jurosDiarioFix;
                  }
                }
                const entered = parseFloat(confirmValor.replace(/\./g, "").replace(",", "."));
                if (isNaN(entered) || entered <= 0 || entered >= base - 0.009) return null;
                const restante = Math.round((base - entered) * 100) / 100;
                const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700 p-3 space-y-1.5 text-sm">
                    <div className="font-semibold text-blue-700 dark:text-blue-400">Pagamento parcial</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor devido:</span>
                      <span>{fmt(base)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recebido agora:</span>
                      <span className="font-semibold text-green-600">{fmt(entered)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 font-semibold text-orange-600 dark:text-orange-400">
                      <span>Valor a ser gerado:</span>
                      <span>{fmt(restante)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Data */}
              <div className="space-y-1.5">
                <Label className="text-sm">Data do {confirmItem.entry.tipo === "receita" ? "recebimento" : "pagamento"}</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm"
                    variant={form.data === localToday() ? "default" : "outline"}
                    onClick={() => setForm(p => ({ ...p, data: localToday() }))}>
                    Hoje
                  </Button>
                  <Button type="button" size="sm"
                    variant={form.data === new Date(Date.now() - 86400000).toISOString().split("T")[0] ? "default" : "outline"}
                    onClick={() => setForm(p => ({ ...p, data: new Date(Date.now() - 86400000).toISOString().split("T")[0] }))}>
                    Ontem
                  </Button>
                  <Input type="date" className="h-9 w-[150px]" value={form.data}
                    onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
                </div>
              </div>

              {/* Conta — obrigatória */}
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <Wallet className={`h-5 w-5 shrink-0 ${!form.conta ? "text-destructive" : "text-muted-foreground"}`} />
                  <Select value={form.conta || undefined} onValueChange={v => setForm(p => ({ ...p, conta: v }))}>
                    <SelectTrigger className={`h-9 ${!form.conta ? "border-destructive ring-1 ring-destructive" : ""}`}>
                      <SelectValue placeholder="Selecione a conta *" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!form.conta && (
                  <p className="text-xs text-destructive pl-8">Obrigatório: selecione a conta para confirmar.</p>
                )}
              </div>

              {/* Observação */}
              <div className="space-y-1">
                <Label className="text-sm">Observação (opcional)</Label>
                <Textarea rows={2} value={form.observacao}
                  onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} />
              </div>
            </div>
          )}
          {confirmItem && (
            <div className="flex justify-between pt-3 shrink-0 border-t">
              <Button variant="outline" onClick={() => setConfirmItem(null)}>Cancelar</Button>
              <Button
                style={form.data && form.conta
                  ? { backgroundColor: confirmItem.entry.tipo === "receita" ? "#16a34a" : "#dc2626", color: "white" }
                  : undefined}
                onClick={handleConfirm}
                disabled={!form.data || !form.conta}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {confirmItem.entry.tipo === "receita" ? "Receber" : "Pagar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adiar (data customizada) ─────────────────────── */}
      <Dialog open={!!reschedItem} onOpenChange={(o) => !o && setReschedItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adiar vencimento</DialogTitle>
            <DialogDescription>
              {reschedItem?.clienteNome} • atual: {reschedItem?.due?.toLocaleDateString("pt-BR") || "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nova data de vencimento</Label>
            <Input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReschedItem(null)}>Cancelar</Button>
            <Button onClick={() => applyReschedule(reschedDate)}>
              <CalendarClock className="h-4 w-4 mr-1.5" />
              Adiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adiar cobranças do cliente ───────────────────── */}
      <Dialog open={reschedClientItems.length > 0} onOpenChange={(o) => !o && setReschedClientItems([])}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adiar cobranças</DialogTitle>
            <DialogDescription>
              {reschedClientItems[0]?.clienteNome} · {reschedClientItems.length} cobrança{reschedClientItems.length !== 1 ? "s" : ""} pendente{reschedClientItems.length !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nova data de vencimento</Label>
            <Input type="date" value={reschedClientDate} onChange={(e) => setReschedClientDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReschedClientItems([])}>Cancelar</Button>
            <Button onClick={applyRescheduleClient}>
              <CalendarClock className="h-4 w-4 mr-1.5" />
              Adiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adiar cobranças em atraso ─────────────────────── */}
      <Dialog open={!!adiarEntry} onOpenChange={(o) => { if (!o) { setAdiarEntry(null); setAdiarAtrasadas([]); } }}>
        <DialogContent className="max-w-xs w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              Adiar cobranças
            </DialogTitle>
            {adiarEntry?.clienteNome && (
              <DialogDescription className="font-medium text-foreground/80">
                {adiarEntry.clienteNome}{adiarEntry.placa ? <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{adiarEntry.placa}</span> : ""}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3">
            {/* Atalhos rápidos */}
            <div className="flex gap-2">
              {[1, 2, 4].map(d => {
                const b = new Date(today.getTime()); b.setDate(b.getDate() + d);
                const iso = toISODate(b);
                const label = b.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                const selected = adiarDate === iso;
                return (
                  <button key={d} onClick={() => setAdiarDate(iso)}
                    className={`flex-1 flex flex-col items-center rounded-lg border py-2.5 transition-colors ${selected
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                      : "border-border hover:bg-muted/60 text-foreground"}`}>
                    <span className="text-sm font-bold">+{d}d</span>
                    <span className={`text-[10px] mt-0.5 ${selected ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Data manual */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Outra data:</span>
              <Input type="date" value={adiarDate} onChange={e => setAdiarDate(e.target.value)} className="h-8 text-sm flex-1" />
            </div>

            {/* Lista resumida das cobranças */}
            {adiarAtrasadas.length > 0 && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <div className="px-3 py-1.5 border-b bg-muted/50">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {adiarAtrasadas.length} cobrança{adiarAtrasadas.length !== 1 ? "s" : ""} afetada{adiarAtrasadas.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className={`divide-y divide-border/50 ${adiarAtrasadas.length > 3 ? "max-h-[90px] overflow-y-auto" : ""}`}>
                  {adiarAtrasadas.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-3 py-1.5 gap-2">
                      <span className="text-xs text-muted-foreground truncate flex-1">{metaFor(e.categoria || "").label}</span>
                      <span className="text-xs font-semibold text-foreground shrink-0">{fmtBRL(e.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground leading-snug">
              Valor não alterado — só oculta desta tela até a data escolhida.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAdiarEntry(null); setAdiarAtrasadas([]); }}>Cancelar</Button>
            <Button disabled={!adiarDate} size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white flex-1"
              onClick={applyAdiarAtrasadas}>
              <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
              {adiarDate ? `Adiar para ${new Date(adiarDate + "T00:00:00").toLocaleDateString("pt-BR")}` : "Adiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Histórico do cliente ──────────────────────────── */}
      <Dialog open={!!debtDetailClientId} onOpenChange={(o) => !o && setDebtDetailClientId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          {(() => {
            const isOv = (e: FinancialEntry) => { const d = parseISO(e.dataPrevista || e.data); return !!(d && diffDays(today, d) > 0); };
            const atrasadas = debtDetailEntries.filter(e => !e.pago && isOv(e));
            const futuras   = debtDetailEntries.filter(e => !e.pago && !isOv(e));
            const pagas     = debtDetailEntries.filter(e => e.pago);
            const totalAtrasado = atrasadas.reduce((s, e) => {
              const due = parseISO(e.dataPrevista || e.data);
              const days = due ? diffDays(today, due) : 0;
              return s + calcValorAtualizado(e, days);
            }, 0);
            const totalFuturo   = futuras.reduce((s, e) => s + (e.valor || 0), 0);
            const totalPago     = pagas.reduce((s, e) => s + (e.valor || 0), 0);

            const buildPeriodo = (e: FinancialEntry) => {
              const rental = e.rentalId ? rentalsById.get(e.rentalId) : null;
              const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              const calcLabel = (due: Date) => {
                if (!rental) return null;
                const num = computeSemanaNumero(rental, due);
                const { inicio, fim } = computeSemanaPeriodo(rental, due);
                if (!num || !inicio || !fim) return null;
                // Se o contrato encerrou no meio desse período, mostra o fim real do
                // contrato em vez do fim nominal do período (que já não existe mais).
                const fimEfetivo = rental.dataFim && rental.dataFim >= inicio && rental.dataFim < fim ? rental.dataFim : fim;
                const freq = rental.frequenciaPagamento;
                const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
                return `${lbl} ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fimEfetivo)}`;
              };
              const extractFromDesc = (desc: string | undefined) => {
                if (!desc) return null;
                const mNew = desc.match(/((?:Semana|Quinzena|Mês)\s+\d+:\s+\d{2}\/\d{2}\s+até\s+\d{2}\/\d{2})/i);
                if (mNew) return mNew[1];
                const mOld = desc.match(/Aluguel\s+(\d+)[ªa°]?\s*(Semana|Quinzena|M[eê]s)\s+\((\d{2}\/\d{2})\s+a\s+(\d{2}\/\d{2})\)/i);
                if (mOld) {
                  const num = String(parseInt(mOld[1])).padStart(2, "0");
                  const lbl = /quinzena/i.test(mOld[2]) ? "Quinzena" : /m[eê]s/i.test(mOld[2]) ? "Mês" : "Semana";
                  return `${lbl} ${num}: ${mOld[3]} até ${mOld[4]}`;
                }
                return null;
              };
              if (e.subcategoria === "Parcelamento") {
                // descricao primeiro: pode ter sido corrigida manualmente via lápis
                const fromDesc = extractFromDesc(e.descricao);
                if (fromDesc) return fromDesc;
                // Fallback: via fixedOriginId → usa original.data
                if (e.fixedOriginId) {
                  const original = financialById.get(e.fixedOriginId);
                  if (original) {
                    const label = calcLabel(parseISO(original.data));
                    if (label) return label;
                  }
                }
                // Fallback: via irmão no mesmo recurringGroupId que tenha fixedOriginId
                if (e.recurringGroupId) {
                  const sibling = cache.financial.find(x =>
                    x.id !== e.id && x.recurringGroupId === e.recurringGroupId && !!x.fixedOriginId
                  );
                  if (sibling?.fixedOriginId) {
                    const original = financialById.get(sibling.fixedOriginId);
                    if (original) {
                      const label = calcLabel(parseISO(original.data));
                      if (label) return label;
                    }
                  }
                }
                // Fallback: aluguel ignorado do mesmo rental (quando fixedOriginId não foi persistido)
                if (e.rentalId && rental) {
                  const candidates = cache.financial.filter(x =>
                    x.rentalId === e.rentalId &&
                    x.categoria === "aluguel" &&
                    x.ignorada === true &&
                    x.subcategoria !== "Parcelamento" &&
                    !x.recurringGroupId
                  );
                  if (candidates.length === 1) {
                    const label = calcLabel(parseISO(candidates[0].data));
                    if (label) return label;
                  }
                }
                return null;
              }
              // Aluguel regular: descricao primeiro (preserva semana original)
              if (e.categoria === "aluguel") {
                const fromDesc = extractFromDesc(e.descricao);
                if (fromDesc) return fromDesc;
                // Fallback: calcula pela dataOriginal (preserva semana mesmo após reagendamentos)
                if (rental) {
                  const due = parseISO(e.dataOriginal || e.dataPrevista || e.data);
                  return calcLabel(due);
                }
              }
              return null;
            };

            const getCatLabel = (e: FinancialEntry) => {
              const base = metaFor(e.categoria || "").label;
              return e.subcategoria && e.subcategoria !== "Parcelamento" ? `${base} · ${e.subcategoria}` : base;
            };



            // Linha compacta para entrada em atraso — chamada como função, não componente
            const renderOverdueRow = (e: FinancialEntry) => {
              const due = parseISO(e.dataPrevista || e.data);
              const days = due ? diffDays(today, due) : 0;
              const periodo = buildPeriodo(e);
              const hasAsaas = !!(e.asaasPaymentId);
              const isParcelamento = e.subcategoria === "Parcelamento";
              const rowItem = pending.find(i => i.entry.id === e.id);
              const valorAtualizado = calcValorAtualizado(e, days);
              const temJuros = valorAtualizado > (e.valor || 0);
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/30 transition-colors group hover:bg-red-50/40 dark:hover:bg-red-950/20">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-semibold text-foreground leading-tight truncate">
                        {periodo || getCatLabel(e)}
                      </span>
                      {isParcelamento && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-medium px-1.5 py-0.5 flex-shrink-0">
                          parcelado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                        {days}d em atraso
                      </span>
                      <span className="text-[10px] text-muted-foreground">venc. {due ? due.toLocaleDateString("pt-BR") : "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                    <>
                      {hasAsaas ? (
                        <button
                          title={e.asaasInvoiceUrl || e.asaasBoletoUrl ? "Abrir boleto" : "Buscar link do boleto"}
                          onClick={() => fetchAndOpenBoleto(e)}
                          disabled={loadingBoleto === e.id}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors disabled:opacity-50"
                        >
                          {loadingBoleto === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <button
                          title="Gerar boleto Asaas"
                          onClick={() => handleGerarBoleto(e)}
                          disabled={generatingBoleto === e.id}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors disabled:opacity-50"
                        >
                          {generatingBoleto === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {!isParcelamento && e.categoria === "aluguel" && (
                        <button title="Parcelar" onClick={() => { setParcelandoEntry(e); setParcelForm({ entrada: "", primeiraData: new Date().toISOString().slice(0, 10), nParcelas: "2" }); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors">
                          <Scissors className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {rowItem && (
                        <button title="Confirmar pagamento" onClick={() => openConfirm(rowItem)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                    <div className="text-right min-w-[80px] ml-1">
                      <div className="text-[14px] font-bold tabular-nums text-red-600 dark:text-red-400">{fmtBRL(valorAtualizado)}</div>
                      {temJuros && (
                        <div className="text-[10px] text-muted-foreground tabular-nums line-through">{fmtBRL(e.valor || 0)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            };

            // Linha simples para futuras/pagas — chamada como função
            const renderSimpleRow = (e: FinancialEntry) => {
              const due = parseISO(e.dataPrevista || e.data);
              const periodo = buildPeriodo(e);
              const hasBoletoSimple = !e.pago && !!e.asaasPaymentId;
              const dateStr = e.pago
                ? new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR")
                : due ? due.toLocaleDateString("pt-BR") : "—";
              const podeEditarRef = e.categoria === "aluguel" && e.subcategoria !== "Parcelamento";
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/20 hover:bg-muted/20 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[12px] truncate ${e.pago ? "text-muted-foreground" : "text-foreground/85"}`}>
                        {periodo || getCatLabel(e)}
                      </span>
                      {e.subcategoria === "Parcelamento" && (
                        <button
                          title="Corrigir semana de referência do parcelamento"
                          onClick={() => { setEditRefEntry(e); setEditRefDate(e.data); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-all flex-shrink-0"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {podeEditarRef && (
                        <button
                          title="Corrigir semana de referência"
                          onClick={() => { setEditRefEntry(e); setEditRefDate(e.dataOriginal || e.dataPrevista || e.data); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-all flex-shrink-0"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {e.pago
                        ? <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ pago {dateStr}</span>
                        : <span className="text-[10px] text-muted-foreground">venc. {dateStr}</span>
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasBoletoSimple && (
                      <button
                        title={e.asaasInvoiceUrl || e.asaasBoletoUrl ? "Abrir boleto" : "Buscar link do boleto"}
                        onClick={() => fetchAndOpenBoleto(e)}
                        disabled={loadingBoleto === e.id}
                        className="p-1 rounded text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50"
                      >
                        {loadingBoleto === e.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <ExternalLink className="h-3 w-3" />}
                      </button>
                    )}
                    <span className={`text-[12px] font-semibold tabular-nums min-w-[72px] text-right ${e.pago ? "text-emerald-600 dark:text-emerald-400" : "text-orange-500 dark:text-orange-400"}`}>
                      {fmtBRL(e.valor || 0)}
                    </span>
                  </div>
                </div>
              );
            };

            const clientePlacas = [...new Set(debtDetailEntries.map(e => e.placa).filter(Boolean))];
            const temParcelamentos = debtDetailEntries.some(e => e.subcategoria === "Parcelamento" && e.fixedOriginId);
            const clienteTelefone = debtDetailClientId ? clientsById.get(debtDetailClientId)?.telefone ?? null : null;

            return (
              <>
                {/* ── Cabeçalho ── */}
                <div className="px-4 pt-4 pb-3 flex-shrink-0">
                  {/* Nome + placa + config */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[16px] font-bold leading-tight tracking-tight truncate">{debtDetailItem?.clienteNome || "—"}</h2>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {clientePlacas.map(p => (
                          <span key={p} className="font-mono text-[10px] font-semibold text-foreground/60 bg-muted border border-border/60 rounded px-1.5 py-px tracking-wider">{p}</span>
                        ))}
                      </div>
                    </div>
                    {temParcelamentos && (
                      <button title="Corrigir referências" onClick={() => debtDetailClientId && corrigirReferenciasParcelamentos(debtDetailClientId)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors flex-shrink-0">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Barra de ação: telefone + copiar + adiar */}
                  <div className="flex items-center gap-2 mt-2.5 p-2 rounded-xl bg-muted/40 border border-border/50">
                    <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-[13px] font-bold tabular-nums flex-1 text-foreground">
                      {clienteTelefone || <span className="text-muted-foreground font-normal text-[12px]">Sem telefone</span>}
                    </span>
                    {clienteTelefone && (
                      <button
                        title="Copiar telefone"
                        onClick={() => { navigator.clipboard.writeText(clienteTelefone); toast.success("Telefone copiado!"); }}
                        className="flex items-center gap-1 text-[11px] font-semibold text-foreground/70 hover:text-foreground bg-background border border-border rounded-lg px-2.5 py-1.5 transition-colors hover:bg-accent"
                      >
                        <Copy className="h-3 w-3" />
                        Copiar
                      </button>
                    )}
                    {atrasadas.length > 0 && (
                      <button
                        title="Ocultar cobranças em atraso até uma data"
                        onClick={() => {
                          const base = new Date(today.getTime());
                          base.setDate(base.getDate() + 1);
                          setAdiarAtrasadas(atrasadas);
                          setAdiarEntry(atrasadas[0]);
                          setAdiarDate(toISODate(base));
                          setDebtDetailClientId(null);
                        }}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Adiar atraso
                      </button>
                    )}
                    {atrasadas.length > 0 && (
                      <button
                        title="Parcelar dívida em atraso"
                        onClick={() => {
                          setParcelandoGrupo(atrasadas);
                          setParcelGrupoSelected(new Set(atrasadas.map(e => e.id)));
                          const amanha = new Date(today.getTime());
                          amanha.setDate(amanha.getDate() + 1);
                          setParcelGrupoForm({ entrada: "", valorParcela: "", primeiraData: toISODate(amanha) });
                        }}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        <Handshake className="h-3.5 w-3.5" />
                        Parcelar dívida
                      </button>
                    )}
                  </div>

                  {/* ── KPIs ── */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {atrasadas.length > 0 ? (
                      <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3 py-2.5">
                        <p className="text-[10px] text-red-500/80 font-medium uppercase tracking-wide">Em atraso</p>
                        <p className="text-[15px] font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">{fmtBRL(totalAtrasado)}</p>
                        <p className="text-[10px] text-red-400/70">{atrasadas.length} cobr.</p>
                      </div>
                    ) : <div />}
                    {futuras.length > 0 ? (
                      <div className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">A vencer</p>
                        <p className="text-[13px] font-semibold text-foreground/70 tabular-nums mt-0.5">{fmtBRL(totalFuturo)}</p>
                        <p className="text-[10px] text-muted-foreground/60">{futuras.length} cobr.</p>
                      </div>
                    ) : <div />}
                    {pagas.length > 0 ? (
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 px-3 py-2.5">
                        <p className="text-[10px] text-emerald-600/80 font-medium uppercase tracking-wide">Recebido</p>
                        <p className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{fmtBRL(totalPago)}</p>
                        <p className="text-[10px] text-emerald-500/70">{pagas.length} cobr.</p>
                      </div>
                    ) : <div />}
                  </div>
                </div>

                {/* ── Conteúdo rolável ── */}
                <div className="overflow-y-auto flex-1 border-t border-border/40">

                  {/* Atrasadas */}
                  {atrasadas.length > 0 && (
                    <div>
                      <div className="sticky top-0 z-10 px-4 py-2 flex items-center justify-between bg-red-50/80 dark:bg-red-950/40 backdrop-blur-sm border-b border-red-100 dark:border-red-900/30">
                        <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Em atraso · {atrasadas.length}</span>
                        <span className="text-[12px] font-bold text-red-600 dark:text-red-400 tabular-nums">{fmtBRL(totalAtrasado)}</span>
                      </div>
                      <div>
                        {atrasadas.map(e => renderOverdueRow(e))}
                      </div>
                    </div>
                  )}

                  {/* A vencer — colapsável */}
                  {futuras.length > 0 && (
                    <div className="border-t border-border/40">
                      <button
                        className="sticky top-0 z-10 w-full px-4 py-2.5 flex items-center justify-between bg-background/95 backdrop-blur-sm hover:bg-muted/30 transition-colors border-b border-border/30"
                        onClick={() => setDebtFuturasOpen(v => !v)}
                      >
                        <span className="text-[11px] font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest">A vencer · {futuras.length}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-orange-500 dark:text-orange-400 tabular-nums">{fmtBRL(totalFuturo)}</span>
                          {debtFuturasOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      </button>
                      {debtFuturasOpen && (
                        <div>
                          {futuras.map(e => renderSimpleRow(e))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recebidas — colapsável */}
                  {pagas.length > 0 && (
                    <div className="border-t border-border/40">
                      <button
                        className="sticky top-0 z-10 w-full px-4 py-2.5 flex items-center justify-between bg-background/95 backdrop-blur-sm hover:bg-muted/30 transition-colors border-b border-border/30"
                        onClick={() => setDebtPagasOpen(v => !v)}
                      >
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Recebidas · {pagas.length}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtBRL(totalPago)}</span>
                          {debtPagasOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      </button>
                      {debtPagasOpen && (
                        <div>
                          {pagas.map(e => renderSimpleRow(e))}
                        </div>
                      )}
                    </div>
                  )}

                  {debtDetailEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-10">Nenhum lançamento encontrado.</p>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Parcelamento de semana ──────────────────────── */}
      {(() => {
        if (!parcelandoEntry) return null;
        const valorOriginal = parcelandoEntry.valor || 0;
        const entradaNum = parseFloat(parcelForm.entrada.replace(",", ".")) || 0;
        const nParcelasNum = parseInt(parcelForm.nParcelas) || 2;
        const valorRestante = Math.max(0, valorOriginal - entradaNum);
        const valorParcela = nParcelasNum > 0 ? valorRestante / nParcelasNum : 0;
        const totalGerado = entradaNum + valorParcela * nParcelasNum;
        const entradaValida = entradaNum >= 0 && entradaNum < valorOriginal;
        const podeSalvar = entradaValida && nParcelasNum >= 1 && !!parcelForm.primeiraData && totalGerado <= valorOriginal + 0.02;

        const addDaysLocal = (iso: string, d: number) => {
          const dt = new Date(iso + "T00:00:00");
          dt.setDate(dt.getDate() + d);
          return dt.toISOString().slice(0, 10);
        };
        const fmtDt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

        const due = parseISO(parcelandoEntry.dataPrevista || parcelandoEntry.data);
        const rental = parcelandoEntry.rentalId ? rentalsById.get(parcelandoEntry.rentalId) : undefined;
        let periodoLabel: string | null = null;
        if (rental && due) {
          const num = computeSemanaNumero(rental, due);
          const { inicio, fim } = computeSemanaPeriodo(rental, due);
          if (num && inicio && fim) {
            const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const freq = rental.frequenciaPagamento;
            const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
            periodoLabel = `${lbl} ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fim)}`;
          }
        }

        const previewParcelas = nParcelasNum >= 1 && parcelForm.primeiraData
          ? Array.from({ length: nParcelasNum }, (_, i) => {
              const data = addDaysLocal(parcelForm.primeiraData, i * 7);
              const v = i === nParcelasNum - 1 ? parseFloat((valorRestante - valorParcela * (nParcelasNum - 1)).toFixed(2)) : parseFloat(valorParcela.toFixed(2));
              return { index: i + 1, data, v };
            })
          : [];

        return (
          <>
          <Dialog open={!!parcelandoEntry} onOpenChange={(o) => !o && setParcelandoEntry(null)}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-orange-500" /> Parcelar cobrança
                </DialogTitle>
              </DialogHeader>

              {/* Info da cobrança */}
              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 px-4 py-3 space-y-0.5">
                <p className="text-[11px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wide">Cobrança a parcelar</p>
                {periodoLabel
                  ? <p className="text-sm font-semibold text-foreground">{periodoLabel}</p>
                  : <p className="text-sm text-muted-foreground">{parcelandoEntry.descricao}</p>
                }
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">{fmtBRL(valorOriginal)}</p>
                <p className="text-[11px] text-orange-600/70 dark:text-orange-400/70">O lançamento original será cancelado e substituído pelas parcelas.</p>
              </div>

              <div className="space-y-4 py-1">
                {/* Entrada */}
                <div className="space-y-1.5">
                  <Label>Entrada (opcional)</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={parcelForm.entrada}
                    onChange={e => setParcelForm(f => ({ ...f, entrada: e.target.value }))}
                    min={0}
                    max={valorOriginal - 0.01}
                    step={0.01}
                  />
                  {entradaNum > 0 && (
                    <p className="text-xs text-muted-foreground">Restante a parcelar: {fmtBRL(valorRestante)}</p>
                  )}
                </div>

                {/* Grade: data + nParcelas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Data da 1ª parcela</Label>
                    <Input
                      type="date"
                      value={parcelForm.primeiraData}
                      onChange={e => setParcelForm(f => ({ ...f, primeiraData: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nº de parcelas</Label>
                    <Input
                      type="number"
                      value={parcelForm.nParcelas}
                      onChange={e => setParcelForm(f => ({ ...f, nParcelas: e.target.value }))}
                      min={1}
                      max={52}
                    />
                  </div>
                </div>

                {/* Preview */}
                {previewParcelas.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Prévia</Label>
                    <div className="border rounded-md divide-y text-sm max-h-40 overflow-y-auto">
                      {entradaNum > 0 && (
                        <div className="flex justify-between px-3 py-1.5 text-xs bg-muted/20">
                          <span className="text-muted-foreground">Entrada · {fmtDt(localToday())} (hoje)</span>
                          <span className="font-semibold">{fmtBRL(entradaNum)}</span>
                        </div>
                      )}
                      {previewParcelas.map(p => (
                        <div key={p.index} className="flex justify-between px-3 py-1.5 text-xs">
                          <span className="text-muted-foreground">Parcela {p.index}/{nParcelasNum} · {fmtDt(p.data)}</span>
                          <span className="font-semibold">{fmtBRL(p.v)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-3 py-1.5 text-xs font-semibold bg-muted/30">
                        <span>Total</span>
                        <span className={totalGerado > valorOriginal + 0.02 ? "text-destructive" : ""}>{fmtBRL(totalGerado)}</span>
                      </div>
                    </div>
                    {totalGerado > valorOriginal + 0.02 && (
                      <p className="text-xs text-destructive font-medium">Total não pode ultrapassar {fmtBRL(valorOriginal)}</p>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setParcelandoEntry(null)} disabled={parcelSalvando}>Cancelar</Button>
                <Button
                  onClick={criarParcelamento}
                  disabled={!podeSalvar || parcelSalvando}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {parcelSalvando ? "Salvando…" : `Criar ${nParcelasNum} parcela${nParcelasNum !== 1 ? "s" : ""}${entradaNum > 0 ? " + entrada" : ""}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        );
      })()}

      {/* ── Dialog: Parcelar dívida agrupada (acordo) ─────────────── */}
      {(() => {
        if (!parcelandoGrupo) return null;
        const selecionadas = parcelandoGrupo.filter(e => parcelGrupoSelected.has(e.id));
        const valorTotal = selecionadas.reduce((s, e) => s + valorAtualDe(e), 0);
        const entradaNum = parseFloat(parcelGrupoForm.entrada.replace(",", ".")) || 0;
        const valorParcelaNum = parseFloat(parcelGrupoForm.valorParcela.replace(",", ".")) || 0;
        const restante = Math.max(0, parseFloat((valorTotal - entradaNum).toFixed(2)));
        const nParcelas = valorParcelaNum > 0 ? Math.max(1, Math.ceil(restante / valorParcelaNum)) : 0;
        const entradaValida = entradaNum >= 0 && entradaNum < valorTotal;
        const podeSalvar = selecionadas.length > 0 && entradaValida && valorParcelaNum > 0 && !!parcelGrupoForm.primeiraData && nParcelas > 0 && nParcelas <= 104;

        const addDaysLocal = (iso: string, d: number) => {
          const dt = new Date(iso + "T00:00:00");
          dt.setDate(dt.getDate() + d);
          return dt.toISOString().slice(0, 10);
        };
        const fmtDt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

        const previewParcelas = nParcelas > 0 && nParcelas <= 104 && parcelGrupoForm.primeiraData
          ? Array.from({ length: nParcelas }, (_, i) => {
              const data = addDaysLocal(parcelGrupoForm.primeiraData, i * 7);
              const v = i === nParcelas - 1 ? parseFloat((restante - valorParcelaNum * (nParcelas - 1)).toFixed(2)) : valorParcelaNum;
              return { index: i + 1, data, v };
            })
          : [];
        const clienteNomeGrupo = parcelandoGrupo[0]?.clienteNome || "";

        return (
          <Dialog open={!!parcelandoGrupo} onOpenChange={(o) => !o && setParcelandoGrupo(null)}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-indigo-500" /> Parcelar dívida
                </DialogTitle>
              </DialogHeader>

              {/* Lista de cobranças selecionáveis */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cobranças em atraso incluídas no acordo</Label>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {parcelandoGrupo.map(e => {
                    const checked = parcelGrupoSelected.has(e.id);
                    return (
                      <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/30">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => setParcelGrupoSelected(prev => {
                            const next = new Set(prev);
                            if (v) next.add(e.id); else next.delete(e.id);
                            return next;
                          })}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium truncate">{metaFor(e.categoria || "").label}</span>
                          <span className="text-muted-foreground">venc. {fmtDt(e.dataPrevista || e.data)}</span>
                        </span>
                        <span className="font-semibold shrink-0">{fmtBRL(valorAtualDe(e))}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-between text-sm font-semibold px-1">
                  <span>Total selecionado</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{fmtBRL(valorTotal)}</span>
                </div>
              </div>

              <div className="space-y-4 py-1">
                {/* Entrada */}
                <div className="space-y-1.5">
                  <Label>Entrada (opcional)</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={parcelGrupoForm.entrada}
                    onChange={e => setParcelGrupoForm(f => ({ ...f, entrada: e.target.value }))}
                    min={0}
                    max={Math.max(0, valorTotal - 0.01)}
                    step={0.01}
                  />
                  {entradaNum > 0 && (
                    <p className="text-xs text-muted-foreground">Restante a parcelar: {fmtBRL(restante)}</p>
                  )}
                </div>

                {/* Grade: valor da parcela + data */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Valor da parcela</Label>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={parcelGrupoForm.valorParcela}
                      onChange={e => setParcelGrupoForm(f => ({ ...f, valorParcela: e.target.value }))}
                      min={0.01}
                      step={0.01}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data da 1ª parcela</Label>
                    <Input
                      type="date"
                      value={parcelGrupoForm.primeiraData}
                      onChange={e => setParcelGrupoForm(f => ({ ...f, primeiraData: e.target.value }))}
                    />
                  </div>
                </div>

                {nParcelas > 104 && (
                  <p className="text-xs text-destructive font-medium">Isso resultaria em {nParcelas} parcelas — aumente o valor da parcela.</p>
                )}

                {/* Preview — pensado para print/screenshot enviar ao cliente: sem rolagem interna, tudo visível de uma vez */}
                {previewParcelas.length > 0 && (
                  <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-background overflow-hidden">
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3 border-b border-indigo-200 dark:border-indigo-800">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Acordo de Parcelamento</p>
                      {clienteNomeGrupo && <p className="text-sm font-bold text-foreground">{clienteNomeGrupo}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Dívida total: <span className="font-semibold text-foreground">{fmtBRL(valorTotal)}</span>
                        {entradaNum > 0 && <> · Entrada: <span className="font-semibold text-foreground">{fmtBRL(entradaNum)}</span></>}
                        {" · "}{nParcelas}x {nParcelas > 1 && previewParcelas[previewParcelas.length - 1]?.v !== valorParcelaNum ? "de até" : "de"} <span className="font-semibold text-foreground">{fmtBRL(valorParcelaNum)}</span> {nParcelas !== 1 ? "semanais" : "semanal"}
                        {nParcelas > 1 && previewParcelas[previewParcelas.length - 1]?.v !== valorParcelaNum && " (última ajustada para fechar o total)"}
                      </p>
                    </div>
                    <div className="divide-y text-sm">
                      {entradaNum > 0 && (
                        <div className="flex justify-between px-4 py-2 text-xs bg-muted/20">
                          <span className="text-muted-foreground">Entrada · {fmtDt(localToday())} (hoje)</span>
                          <span className="font-semibold">{fmtBRL(entradaNum)}</span>
                        </div>
                      )}
                      {previewParcelas.map(p => (
                        <div key={p.index} className="flex justify-between px-4 py-2 text-xs">
                          <span className="text-muted-foreground">Parcela {p.index}/{nParcelas} · {fmtDt(p.data)}</span>
                          <span className="font-semibold">{fmtBRL(p.v)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-4 py-2.5 text-sm font-bold bg-indigo-50 dark:bg-indigo-950/30">
                        <span>Total do acordo</span>
                        <span>{fmtBRL(entradaNum + previewParcelas.reduce((s, p) => s + p.v, 0))}</span>
                      </div>
                    </div>
                    <p className="text-center text-[10px] text-muted-foreground py-1.5 border-t">— wayvo · dado · decisão · destino</p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setParcelandoGrupo(null)} disabled={parcelGrupoSalvando}>Cancelar</Button>
                <Button
                  onClick={criarParcelamentoGrupo}
                  disabled={!podeSalvar || parcelGrupoSalvando}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {parcelGrupoSalvando ? "Salvando…" : `Confirmar acordo (${nParcelas} parcela${nParcelas !== 1 ? "s" : ""})`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Dialog: Corrigir semana de referência ─────────────────── */}
      <Dialog open={!!editRefEntry} onOpenChange={open => { if (!open) { setEditRefEntry(null); setEditRefDate(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Corrigir semana de referência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              {editRefEntry?.subcategoria === "Parcelamento"
                ? "Informe a data de vencimento original do aluguel que foi parcelado. Todas as parcelas do mesmo grupo serão atualizadas."
                : "Informe a data original de vencimento desta cobrança. O número da semana será recalculado a partir dessa data."}
            </p>
            <div className="space-y-1.5">
              <Label>Data original de vencimento</Label>
              <Input
                type="date"
                value={editRefDate}
                onChange={e => setEditRefDate(e.target.value)}
              />
            </div>
            {editRefDate && editRefEntry?.rentalId && (() => {
              const rental = rentalsById.get(editRefEntry.rentalId!);
              const due = parseISO(editRefDate);
              if (!rental || !due) return null;
              const num = computeSemanaNumero(rental, due);
              const { inicio, fim } = computeSemanaPeriodo(rental, due);
              if (!num || !inicio || !fim) return null;
              const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              const freq = rental.frequenciaPagamento;
              const lbl = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
              return (
                <p className="text-xs font-medium text-foreground/80 bg-muted/50 rounded px-3 py-2">
                  {lbl} {String(num).padStart(2, "0")}: {fmt(inicio)} até {fmt(fim)}
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditRefEntry(null); setEditRefDate(""); }}>Cancelar</Button>
            <Button
              onClick={editRefEntry?.subcategoria === "Parcelamento" ? applyEditParcelamento : applyEditRef}
              disabled={!editRefDate}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Linha de cobrança ─────────────────────────────────────────────
function RowItemView({
  item, onConfirm, onMessage, onWhatsApp, onCopy, onRescheduleQuick, onRescheduleCustom, onIgnore, onClientClick,
}: {
  item: RowItem;
  onConfirm: (i: RowItem) => void;
  onMessage: (i: RowItem, t: MsgType) => void;
  onWhatsApp: (i: RowItem, t: MsgType) => void;
  onCopy: (text: string, label: string) => void;
  onRescheduleQuick: (i: RowItem, deltaDays: number) => void;
  onRescheduleCustom: (i: RowItem) => void;
  onIgnore: (i: RowItem) => void;
  onClientClick?: (clienteId: string) => void;
}) {
  const meta = metaFor(item.catKey);
  const isOverdue = item.originalDaysLate > 0;
  const isPago = item.entry.pago;
  const pagoHoje = isPago && item.entry.data === new Date().toISOString().slice(0, 10);
  const boletoUrl = item.entry.asaasInvoiceUrl || item.entry.asaasBoletoUrl;
  const asaasStatus = item.entry.asaasStatus;
  const hasAsaas = !!item.entry.asaasPaymentId;

  // Listro lateral
  const listroCor = isPago
    ? "bg-emerald-500"
    : isOverdue
      ? "bg-destructive"
      : item.catKey === "aluguel"
        ? "bg-primary/60"
        : item.catKey === "caucao"
          ? "bg-muted-foreground/30"
          : "bg-border";

  // Category badge — aluguel em atraso tem estilo e label distintos
  const catLabel = (item.catKey === "aluguel" && isOverdue)
    ? "Aluguel em atraso"
    : meta.label;
  const catBadge = (item.catKey === "aluguel" && isOverdue)
    ? "bg-destructive/10 text-destructive"
    : item.catKey === "aluguel"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
      : item.catKey === "caucao"
        ? "bg-muted text-muted-foreground border border-border/60"
        : (item.catKey === "multa_transito_receita" || item.catKey === "multa")
          ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          : "bg-muted/50 text-muted-foreground";

  // Asaas status badge
  const asaasBadge = hasAsaas && !isPago ? (
    <span className={`text-[9px] font-semibold rounded-[3px] px-1.5 py-px ${
      asaasStatus === "OVERDUE"
        ? "bg-destructive/10 text-destructive"
        : asaasStatus === "RECEIVED"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
    }`}>
      {asaasStatus === "RECEIVED" ? "Pago"
        : asaasStatus === "OVERDUE" ? "Boleto vencido"
        : asaasStatus === "REFUNDED" ? "Estornado"
        : "Boleto gerado"}
    </span>
  ) : null;

  const msgCobranca = MSG_TYPES.find((m) => m.key === "pagamento-dia")!;
  const msgLembrete = MSG_TYPES.find((m) => m.key === "lembrete")!;
  const msgAtraso   = MSG_TYPES.find((m) => m.key === "pagamento-atraso")!;

  return (
    <div className={`flex items-stretch transition-colors ${isOverdue ? "hover:bg-destructive/[.03]" : "hover:bg-muted/30"}`}>
      {/* Listro lateral */}
      <div className={`w-[3px] self-stretch flex-shrink-0 ${listroCor}`} />

      {/* Bloco info */}
      <div className="flex-1 min-w-0 px-3 py-3">
        {/* Linha 1: cat badge + valor */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-[.4px] rounded-[4px] px-2 py-0.5 shrink-0 ${catBadge}`}>
              {catLabel}
            </span>
            {isOverdue && (
              <span className="text-[9px] font-bold bg-destructive/10 text-destructive rounded-[4px] px-1.5 py-0.5 shrink-0">
                {item.originalDaysLate}d atraso
              </span>
            )}
            {isOverdue && item.entry.dataPrevista && item.entry.dataPrevista !== item.entry.data && (
              <span className="text-[9px] text-muted-foreground rounded-[4px] px-1.5 py-0.5 shrink-0 border border-border/50">
                ação {new Date(item.entry.dataPrevista + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
            {pagoHoje && (
              <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 rounded-[4px] px-1.5 py-0.5 shrink-0">
                Pago hoje
              </span>
            )}
            {asaasBadge}
          </div>
          <span className={`text-[15px] font-bold tabular-nums flex-shrink-0 ${
            isPago ? "text-emerald-600" : isOverdue ? "text-destructive" : "text-foreground"
          }`}>
            {isPago && "✓ "}{fmtBRL(item.entry.valor || 0)}
          </span>
        </div>

        {/* Linha 2: nome + placa */}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          {onClientClick && item.clienteId ? (
            <button
              className="text-[13px] font-semibold truncate flex-1 leading-none text-left hover:underline hover:text-primary transition-colors"
              onClick={e => { e.stopPropagation(); onClientClick(item.clienteId!); }}
            >{item.clienteNome}</button>
          ) : (
            <span className="text-[13px] font-semibold truncate flex-1 leading-none">{item.clienteNome}</span>
          )}
          {item.placa && (
            <span className="font-mono text-[9px] bg-muted/70 border border-border/50 rounded-[3px] px-1.5 py-px tracking-[.5px] text-muted-foreground flex-shrink-0">
              {item.placa}
            </span>
          )}
        </div>

        {/* Linha 2b: referência de semana/período */}
        {(() => {
          const src = (item.entry.descricao || "") + " " + (item.entry.observacao || "");
          const m = src.match(/((?:Semana|Quinzena|M[eê]s)\s+\d+:\s*\d{2}\/\d{2}\s+até\s+\d{2}\/\d{2})/i);
          if (!m) return null;
          return (
            <p className="text-[10px] text-muted-foreground mt-1">{m[1]}</p>
          );
        })()}

        {/* Linha 3: dívida total / último pagamento (somente em atraso) */}
        {isOverdue && item.pendingCount > 1 && (
          <button
            className="mt-1.5 flex items-center gap-1 text-[10px] text-destructive font-semibold hover:underline"
            onClick={e => { e.stopPropagation(); setDebtDetailClientId(item.clienteId || null); }}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{item.pendingCount} pagamentos em aberto · {fmtBRL(item.totalPendente)} total</span>
          </button>
        )}
        {isOverdue && item.ultimoPagamento && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Últ. pagamento: {new Date(item.ultimoPagamento + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>

      {/* Ações — desabilitadas se pago (exceto "...") */}
      <div className={`flex items-center gap-1 pr-2 flex-shrink-0 ${isPago ? "opacity-30 pointer-events-none" : ""}`}>
        {/* Copiar nº de telefone */}
        {item.telefoneCliente && (
          <button
            className="w-[30px] h-[30px] rounded-[7px] border border-border/60 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={() => onCopy(item.telefoneCliente!, "Telefone")}
            title={item.telefoneCliente}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}

        {/* WhatsApp */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-[30px] h-[30px] rounded-[7px] border border-border/60 flex items-center justify-center text-muted-foreground hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 dark:hover:bg-emerald-950/20 transition-colors">
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">WhatsApp</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onWhatsApp(item, msgCobranca)} className="gap-2 cursor-pointer">
              <msgCobranca.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">{msgCobranca.label}</span>
            </DropdownMenuItem>
            {isOverdue && (
              <DropdownMenuItem onClick={() => onWhatsApp(item, msgAtraso)} className="gap-2 cursor-pointer">
                <msgAtraso.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">{msgAtraso.label}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onWhatsApp(item, msgLembrete)} className="gap-2 cursor-pointer">
              <msgLembrete.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">{msgLembrete.label}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Confirmar pagamento */}
        <button
          className="h-[30px] px-3 rounded-[7px] bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-600 transition-colors shadow-sm"
          onClick={() => onConfirm(item)}
        >
          <Check className="h-[11px] w-[11px]" />
          Pago
        </button>
      </div>

      {/* Boleto link — sempre visível mesmo quando pago */}
      {boletoUrl && (
        <div className="flex items-center pr-1 flex-shrink-0">
          <a href={boletoUrl} target="_blank" rel="noopener noreferrer">
            <button className="w-[30px] h-[30px] rounded-[7px] border border-amber-200 flex items-center justify-center text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
              <Receipt className="h-3.5 w-3.5" />
            </button>
          </a>
        </div>
      )}

      {/* Mais ações — sempre visível */}
      <div className="flex items-center pr-1.5 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground transition-colors">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {item.telefoneCliente && (
              <DropdownMenuItem onClick={() => onCopy(item.telefoneCliente!, "Telefone")} className="gap-2 cursor-pointer">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">Copiar telefone</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onWhatsApp(item, msgCobranca)} className="gap-2 cursor-pointer">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">WhatsApp cobrança</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWhatsApp(item, msgLembrete)} className="gap-2 cursor-pointer">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">WhatsApp lembrete</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRescheduleQuick(item, 1)} className="gap-2 cursor-pointer">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Adiar +1 dia</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRescheduleQuick(item, 3)} className="gap-2 cursor-pointer">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Adiar +3 dias</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRescheduleCustom(item)} className="gap-2 cursor-pointer">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Adiar para data…</span>
            </DropdownMenuItem>
            {(boletoUrl || hasAsaas) && (
              <>
                <DropdownMenuSeparator />
                {boletoUrl && (
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <a href={boletoUrl} target="_blank" rel="noopener noreferrer" className="gap-2 flex items-center">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Abrir boleto</span>
                    </a>
                  </DropdownMenuItem>
                )}
                {boletoUrl && (
                  <DropdownMenuItem onClick={() => onCopy(boletoUrl, "Link do boleto")} className="gap-2 cursor-pointer">
                    <Copy className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Copiar link do boleto</span>
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onIgnore(item)}
              className="gap-2 cursor-pointer text-muted-foreground"
            >
              <span className="h-4 w-4 flex items-center justify-center text-[11px]">✕</span>
              <span className="text-xs">Ignorar cobrança</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
