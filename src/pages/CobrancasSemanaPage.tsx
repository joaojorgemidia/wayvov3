import React, { useMemo, useState } from "react";
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
import {
  CalendarDays, AlertTriangle, CheckCircle2, User, Bike,
  Wallet, ShieldCheck, Receipt, Coins, Tag, MessageCircle,
  Bell, Wrench, MoreHorizontal, Phone, Copy,
  CalendarClock, ExternalLink, Search, TrendingUp,
  LayoutDashboard, SlidersHorizontal, Check, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { saveFinancial } from "@/lib/store";
import { FinancialEntry } from "@/lib/types";
import { MessagePopup } from "@/components/MessagePopup";
import { applyTokens, buildAllTokens } from "@/lib/message-tokens";
import { buildCobrancaEvent, computeSemanaPeriodo, computeSemanaNumero } from "@/lib/cobranca-week-stats";
import { useCompany } from "@/contexts/CompanyContext";
import { DEFAULT_COBRANCA_CONFIG } from "@/lib/companies";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

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
  due: Date | null;
  daysLate: number;
  catKey: string;
  clienteNome: string;
  clienteId: string | null;
  telefoneCliente: string | null;
  placa: string | null;
  modelo: string | null;
  motoId: string | null;
  totalPendente: number;
  semanasEmAtraso: number;
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
  const [form, setForm] = useState({ data: "", valor: "", conta: "", observacao: "" });
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

  const handleMessage = (item: RowItem, type: MsgType) => setMsgState({ item, type });

  const today = startOfDay(new Date());
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

  const pending: RowItem[] = useMemo(() => {
    // Passo 1: estatísticas por locação (dívida total, semanas em atraso, último pagamento)
    const rentalStats = new Map<string, { totalPendente: number; semanasEmAtraso: number; ultimoPagamento: string | null }>();
    for (const e of cache.financial) {
      if (!e.rentalId || e.ignorada) continue;
      if (e.tipo === "receita" && !e.pago) {
        const st = rentalStats.get(e.rentalId) || { totalPendente: 0, semanasEmAtraso: 0, ultimoPagamento: null };
        st.totalPendente += e.valor || 0;
        if (e.categoria === "aluguel") {
          const due = parseISO(e.dataPrevista || e.data);
          if (due && diffDays(today, due) > 0) st.semanasEmAtraso++;
        }
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
      const dueISO = e.dataPrevista || e.data;
      const due = parseISO(dueISO);
      const daysLate = due ? diffDays(today, due) : 0;
      let cli = e.clienteId || null;
      let moto = e.motoId || null;
      if (!cli && e.rentalId) {
        const r = rentalsById.get(e.rentalId);
        if (r) { cli = r.clienteId; moto = moto || r.motoId; }
      }
      const cliente = cli ? clientsById.get(cli) : null;
      const m = moto ? motosById.get(moto) : null;
      const st = e.rentalId ? rentalStats.get(e.rentalId) : null;
      out.push({
        entry: e,
        due,
        daysLate,
        catKey: (e.categoria || "outro").toLowerCase(),
        clienteNome: cliente?.nome || e.clienteNome || "Sem locatário",
        clienteId: cli || null,
        telefoneCliente: cliente?.telefone || null,
        placa: m?.placa || e.placa || null,
        modelo: m?.modelo || null,
        motoId: m?.id || null,
        totalPendente: st?.totalPendente ?? (e.valor || 0),
        semanasEmAtraso: st?.semanasEmAtraso ?? (daysLate > 0 && (e.categoria || "").toLowerCase() === "aluguel" ? 1 : 0),
        ultimoPagamento: st?.ultimoPagamento ?? null,
      });
    }
    return out.sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.getTime() - b.due.getTime();
    });
  }, [cache.financial, clientsById, motosById, rentalsById, today]);

  const weekItems = pending.filter(
    (i) => i.due && i.due >= monday && i.due <= sunday && i.daysLate <= 0,
  );
  const todayItems = weekItems.filter(i => i.daysLate === 0);
  const upcomingItems = weekItems.filter(i => i.daysLate < 0);
  const overdueItems = pending.filter((i) => i.daysLate > 0);

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

  const filteredOverdue = overdueItems.filter(filterFn);
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
  const totalAtrasado = overdueItems.reduce((s, i) => s + (i.entry.valor || 0), 0);

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
    setForm({
      data: new Date().toISOString().slice(0, 10),
      valor: String(item.entry.valor ?? ""),
      conta: item.entry.conta || "",
      observacao: "",
    });
  };

  const handleConfirm = async () => {
    if (!confirmItem) return;
    const item = confirmItem;
    const valor = parseFloat(form.valor.replace(",", ".")) || item.entry.valor || 0;
    try {
      const payDate = form.data || new Date().toISOString().slice(0, 10);
      const next = cache.financial.map((e) =>
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
      await saveFinancial(next);

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
      const dueDate = item.due || (item.entry.data ? new Date(item.entry.data + "T12:00:00") : null);
      const fmtDM = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      let vencimento = dueDate ? dueDate.toLocaleDateString("pt-BR") : dataPagamento;
      if (dueDate && rental) {
        const { inicio, fim } = computeSemanaPeriodo(rental, dueDate);
        if (inicio && fim) {
          const ini = new Date(inicio + "T12:00:00");
          const f = new Date(fim + "T12:00:00");
          vencimento = `${fmtDM(ini)} até ${fmtDM(f)}`;
        }
      }
      const motoLinha = item.placa
        ? `${item.placa}${item.modelo ? ` — ${item.modelo}` : ""}`
        : "—";

      // Semana paga (relativa ao início da locação) — usa helper unificado
      let semanaTxt = "";
      const semanaNum = computeSemanaNumero(rental ?? null, dueDate);
      if (semanaNum != null) semanaTxt = `${semanaNum}ª semana`;

      // Juros / multa por atraso (regra padrão do sistema quando não configurado na locação)
      const cobrancaCfg = activeCompany?.cobrancaConfig ?? { multaAtraso: 15, jurosDiario: 7, jurosMes: 0 };
      const payTs = new Date(payDate + "T12:00:00").getTime();
      const diasAtraso = dueDate ? Math.max(0, Math.floor((payTs - dueDate.getTime()) / 86400000)) : 0;
      const multa = diasAtraso > 0 ? (rental?.multaAtraso || cobrancaCfg.multaAtraso) : 0;
      const jurosMes = rental?.jurosAtrasoMes || cobrancaCfg.jurosMes || 0;
      const jurosCalc = diasAtraso > 0 ? valorOriginal * (jurosMes / 100 / 30) * diasAtraso : 0;
      const jurosDiarioFix = diasAtraso > 0 ? cobrancaCfg.jurosDiario * diasAtraso : 0;
      const jurosDevido = multa + jurosCalc + jurosDiarioFix;
      const excedente = Math.max(0, valor - valorOriginal);
      const jurosPago = Math.min(excedente, jurosDevido);
      const jurosPendente = Math.max(0, jurosDevido - jurosPago);

      const linhas = [
        `✅ *PAGAMENTO CONFIRMADO*`,
        ``,
        `LOCATÁRIO: ${item.clienteNome || "[NOME]"}`,
        `MOTO: ${motoLinha}`,
        `VENCIMENTO: ${vencimento}${semanaTxt ? ` (${semanaTxt})` : ""}`,
        ``,
        `💰 *VALORES*`,
        `${descricao}: ${fmtBRL(valorOriginal)}{BLOCO_ATRASO}`,
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

      toast.success("Pagamento confirmado");
      setConfirmItem(null);
    } catch (err) {
      console.error(err);
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

  const applyReschedule = async (newDate: string) => {
    const target = reschedItem;
    if (!target || !newDate) return;
    try {
      const next = cache.financial.map((e) =>
        e.id === target.entry.id ? { ...e, dataPrevista: newDate } : e,
      );
      await saveFinancial(next);
      toast.success(`Vencimento adiado para ${new Date(newDate + "T00:00:00").toLocaleDateString("pt-BR")}`);
      setReschedItem(null);
    } catch {
      toast.error("Erro ao adiar vencimento");
    }
  };

  const quickReschedule = async (item: RowItem, deltaDays: number) => {
    // Base = HOJE (ou o vencimento, se ainda for futuro). Assim "Adiar +N dias"
    // sempre joga a cobrança para N dias à frente de hoje quando já está vencida,
    // tirando ela do estado "vencido" enquanto a locadora aguarda o cliente.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = item.due && item.due.getTime() > today.getTime() ? new Date(item.due) : today;
    const nd = new Date(base);
    nd.setDate(nd.getDate() + deltaDays);
    try {
      const iso = toISODate(nd);
      const next = cache.financial.map((e) =>
        e.id === item.entry.id ? { ...e, dataPrevista: iso } : e,
      );
      await saveFinancial(next);
      toast.success(`Adiado para ${nd.toLocaleDateString("pt-BR")}`);
    } catch {
      toast.error("Erro ao adiar");
    }
  };

  const handleIgnore = async (item: RowItem) => {
    try {
      const next = cache.financial.map((e) =>
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
              {overdueItems.length > 0 && (
                <span className="text-destructive"> · {overdueItems.length} em atraso</span>
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
          <div className={`px-3.5 py-2.5 transition-colors ${overdueItems.length > 0 ? "bg-destructive/[.06]" : ""}`}>
            <div className="text-[9px] font-semibold uppercase tracking-[.5px] text-muted-foreground/70 mb-1">Em atraso</div>
            <div className={`text-[17px] font-medium tabular-nums tracking-tight leading-none ${overdueItems.length > 0 ? "text-destructive" : "text-emerald-600"}`}>
              {overdueItems.length > 0 ? fmtBRL(totalAtrasado) : "Em dia"}
            </div>
            <div className={`text-[10px] mt-1 ${overdueItems.length > 0 ? "text-destructive/70" : "text-muted-foreground"}`}>
              {overdueItems.length > 0
                ? `${overdueItems.length} cobrança${overdueItems.length !== 1 ? "s" : ""}`
                : "sem atrasos"}
            </div>
          </div>
        </div>

        {/* Banner de saúde */}
        <div className={`px-4 py-2 border-b flex items-center gap-2 text-[11px] font-semibold transition-colors ${
          overdueItems.length > 0
            ? "bg-destructive/[.07] text-destructive border-destructive/15"
            : missingRentals.length > 0
              ? "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30"
              : "bg-emerald-50/60 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30"
        }`}>
          {overdueItems.length > 0 ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{overdueItems.length} cobrança{overdueItems.length !== 1 ? "s" : ""} em atraso · {fmtBRL(totalAtrasado)}</span>
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
        {filteredOverdue.length > 0 && (
          <div className="rounded-[10px] overflow-hidden border border-destructive/30 shadow-sm">
            <div className="bg-destructive/[.08] border-b border-destructive/20 px-3.5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-[10px] font-bold uppercase tracking-[.6px] text-destructive">Em atraso</span>
                <span className="text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-px leading-none">
                  {filteredOverdue.length}
                </span>
              </div>
              <span className="text-[13px] font-bold text-destructive tabular-nums">
                {fmtBRL(filteredOverdue.reduce((s, i) => s + (i.entry.valor || 0), 0))}
              </span>
            </div>
            <div className="bg-background divide-y divide-border/50">
              {filteredOverdue.map((it) => (
                <RowItemView key={it.entry.id} item={it} onConfirm={openConfirm} onMessage={handleMessage}
                  onWhatsApp={openWhatsApp} onCopy={copyText} onRescheduleQuick={quickReschedule}
                  onRescheduleCustom={openReschedule} onIgnore={handleIgnore} />
              ))}
            </div>
          </div>
        )}

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
                  onRescheduleCustom={openReschedule} onIgnore={handleIgnore} />
              ))}
            </div>
          </div>
        )}

        {/* Próximas cobranças desta semana */}
        {filteredToday.length === 0 && filteredUpcoming.length === 0 && filteredOverdue.length === 0 ? (
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
                        onRescheduleCustom={openReschedule} onIgnore={handleIgnore} />
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

      {/* ── Dialog: Confirmar pagamento ───────────────────────────── */}
      <Dialog open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
            <DialogDescription>
              {confirmItem ? `${confirmItem.clienteNome} • ${metaFor(confirmItem.catKey).label}` : ""}
            </DialogDescription>
          </DialogHeader>
          {confirmItem && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div><strong>Descrição:</strong> {confirmItem.entry.descricao || metaFor(confirmItem.catKey).label}</div>
                {confirmItem.placa && (
                  <div><strong>Moto:</strong> {confirmItem.placa} {confirmItem.modelo ? `• ${confirmItem.modelo}` : ""}</div>
                )}
                {confirmItem.due && (
                  <div>
                    <strong>Vencimento:</strong>{" "}
                    {confirmItem.due.toLocaleDateString("pt-BR")}
                    {confirmItem.daysLate > 0 && (
                      <span className="text-destructive font-semibold"> ({confirmItem.daysLate}d em atraso)</span>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Data do pagamento</Label>
                  <Input
                    type="date"
                    value={form.data}
                    onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Valor recebido</Label>
                  <Input
                    inputMode="decimal"
                    value={form.valor}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Conta</Label>
                {contas.length > 0 ? (
                  <Select value={form.conta || undefined} onValueChange={(v) => setForm((p) => ({ ...p, conta: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.conta}
                    onChange={(e) => setForm((p) => ({ ...p, conta: e.target.value }))}
                    placeholder="Caixa / Banco / Pix"
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label>Observação (opcional)</Label>
                <Textarea
                  rows={2}
                  value={form.observacao}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmItem(null)}>Cancelar</Button>
            <Button onClick={handleConfirm}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Confirmar pagamento
            </Button>
          </DialogFooter>
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
    </div>
  );
}

// ─── Linha de cobrança ─────────────────────────────────────────────
function RowItemView({
  item, onConfirm, onMessage, onWhatsApp, onCopy, onRescheduleQuick, onRescheduleCustom, onIgnore,
}: {
  item: RowItem;
  onConfirm: (i: RowItem) => void;
  onMessage: (i: RowItem, t: MsgType) => void;
  onWhatsApp: (i: RowItem, t: MsgType) => void;
  onCopy: (text: string, label: string) => void;
  onRescheduleQuick: (i: RowItem, deltaDays: number) => void;
  onRescheduleCustom: (i: RowItem) => void;
  onIgnore: (i: RowItem) => void;
}) {
  const meta = metaFor(item.catKey);
  const isOverdue = item.daysLate > 0;
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
                {item.daysLate}d atraso
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
          <span className="text-[13px] font-semibold truncate flex-1 leading-none">{item.clienteNome}</span>
          {item.placa && (
            <span className="font-mono text-[9px] bg-muted/70 border border-border/50 rounded-[3px] px-1.5 py-px tracking-[.5px] text-muted-foreground flex-shrink-0">
              {item.placa}
            </span>
          )}
        </div>

        {/* Linha 3: dívida total / último pagamento (somente em atraso) */}
        {isOverdue && item.semanasEmAtraso > 1 && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-destructive font-semibold">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{item.semanasEmAtraso} semanas em débito · {fmtBRL(item.totalPendente)} total</span>
          </div>
        )}
        {isOverdue && item.ultimoPagamento && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Últ. pagamento: {new Date(item.ultimoPagamento + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>

      {/* Ações — desabilitadas se pago (exceto "...") */}
      <div className={`flex items-center gap-1 pr-2 flex-shrink-0 ${isPago ? "opacity-30 pointer-events-none" : ""}`}>
        {/* Boleto link */}
        {boletoUrl && (
          <a href={boletoUrl} target="_blank" rel="noopener noreferrer">
            <button className="w-[30px] h-[30px] rounded-[7px] border border-amber-200 flex items-center justify-center text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
              <Receipt className="h-3.5 w-3.5" />
            </button>
          </a>
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
