import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, AlertTriangle, CheckCircle2, User, Bike,
  Wallet, ShieldCheck, Receipt, Coins, Tag, MessageCircle,
  Bell, Wrench, ChevronDown, MoreHorizontal, Phone, Copy,
  CalendarClock, ExternalLink, BarChart3, Search,
} from "lucide-react";
import { toast } from "sonner";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { saveFinancial } from "@/lib/store";
import { FinancialEntry } from "@/lib/types";
import { MessagePopup } from "@/components/MessagePopup";
import { applyTokens } from "@/lib/message-tokens";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const WEEK_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const CAT_META: Record<string, { label: string; icon: any; tone: { bg: string; text: string; border: string; stripe: string } }> = {
  aluguel: { label: "Aluguel", icon: Wallet,
    tone: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30", stripe: "bg-primary" } },
  caucao: { label: "Caução", icon: ShieldCheck,
    tone: { bg: "bg-accent/30", text: "text-accent-foreground", border: "border-accent", stripe: "bg-accent-foreground" } },
  multa_transito_receita: { label: "Multa repassada", icon: Receipt,
    tone: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", stripe: "bg-destructive" } },
  multa: { label: "Multa repassada", icon: Receipt,
    tone: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", stripe: "bg-destructive" } },
  outro: { label: "Outras receitas", icon: Coins,
    tone: { bg: "bg-success/10", text: "text-success", border: "border-success/30", stripe: "bg-success" } },
};

function metaFor(catKey: string) {
  return CAT_META[catKey] || {
    label: catKey || "Receita",
    icon: Tag,
    tone: { bg: "bg-muted/50", text: "text-foreground", border: "border-border", stripe: "bg-muted-foreground" },
  };
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
  const cache = useDataCacheSnapshot();
  const [confirmItem, setConfirmItem] = useState<RowItem | null>(null);
  const [form, setForm] = useState({ data: "", valor: "", conta: "", observacao: "" });
  const [msgState, setMsgState] = useState<{ item: RowItem; type: MsgType } | null>(null);
  const [showResumo, setShowResumo] = useState(false);
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<number | "all">("all"); // 0..6 ou "all"
  const [reschedItem, setReschedItem] = useState<RowItem | null>(null);
  const [reschedDate, setReschedDate] = useState("");

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
        if (r) {
          cli = r.clienteId;
          moto = moto || r.motoId;
        }
      }
      const cliente = cli ? clientsById.get(cli) : null;
      const m = moto ? motosById.get(moto) : null;
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
  const filteredWeek = weekItems.filter((i) => {
    if (!filterFn(i)) return false;
    if (dayFilter === "all") return true;
    return i.due!.getDay() === dayFilter;
  });

  // Agrupar semana filtrada por dia (ordem Seg–Dom)
  const groupedWeek = useMemo(() => {
    const groups: { dow: number; date: Date; items: RowItem[] }[] = [];
    for (const dow of WEEK_ORDER) {
      const items = filteredWeek.filter((i) => i.due!.getDay() === dow);
      if (items.length === 0) continue;
      groups.push({ dow, date: items[0].due!, items });
    }
    return groups;
  }, [filteredWeek]);

  // ── KPIs (resumo) ──────────────────────────────────────────────────
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
    const valor = parseFloat(form.valor.replace(",", ".")) || confirmItem.entry.valor || 0;
    try {
      const next = cache.financial.map((e) =>
        e.id === confirmItem.entry.id
          ? {
              ...e,
              pago: true,
              data: form.data || new Date().toISOString().slice(0, 10),
              valor,
              conta: form.conta || e.conta,
              observacao: form.observacao
                ? (e.observacao ? `${e.observacao}\n${form.observacao}` : form.observacao)
                : e.observacao,
            }
          : e,
      );
      await saveFinancial(next);
      toast.success("Pagamento confirmado");
      setConfirmItem(null);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao confirmar pagamento");
    }
  };

  const openReschedule = (item: RowItem) => {
    setReschedItem(item);
    setReschedDate(toISODate(item.due || new Date()));
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
    const base = item.due || new Date();
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

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight">Cobranças da semana</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {monday.getDate()} {MONTH_SHORT[monday.getMonth()]} – {sunday.getDate()} {MONTH_SHORT[sunday.getMonth()]}
            {" · "}{weekItems.length} agendadas
            {overdueItems.length > 0 && <span className="text-destructive"> · {overdueItems.length} em atraso</span>}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowResumo((v) => !v)}
          className="h-8 gap-1.5 text-muted-foreground"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Resumo
          <ChevronDown className={`h-3 w-3 transition-transform ${showResumo ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {/* Resumo (KPIs) — colapsável */}
      {showResumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <KpiCard
            icon={Wallet}
            label="Aluguéis da semana"
            value={String(aluguelStats.totalCobr)}
            sub={`${fmtBRL(aluguelStats.valorPendente + aluguelStats.valorPago)} total`}
            tone="primary"
            extra={
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <div>Pagos <strong className="text-success">{aluguelStats.pagas}</strong> ({fmtBRL(aluguelStats.valorPago)})</div>
                <div>Pendentes <strong className="text-destructive">{aluguelStats.pendentes}</strong> ({fmtBRL(aluguelStats.valorPendente)})</div>
              </div>
            }
          />
          <KpiCard
            icon={Bike}
            label="Locações ativas"
            value={String(aluguelStats.totalActive)}
            sub={
              aluguelStats.desbalanco === 0
                ? "✓ Todas com cobrança"
                : aluguelStats.desbalanco > 0
                  ? `Faltam ${aluguelStats.desbalanco} cobrança(s)`
                  : `${Math.abs(aluguelStats.desbalanco)} a mais que locações`
            }
            tone={aluguelStats.desbalanco === 0 ? "success" : "destructive"}
            warn={aluguelStats.desbalanco !== 0}
          />
          <CategoryKpi catKey="caucao" totals={totalsByCat.get("caucao")} />
          <KpiCard
            icon={AlertTriangle}
            label="Em atraso"
            value={String(overdueItems.length)}
            sub={fmtBRL(totalAtrasado)}
            tone="destructive"
          />
        </div>
      )}

      {/* Faixa de dias + busca */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
          <button
            onClick={() => setDayFilter("all")}
            className={`shrink-0 px-3 h-9 rounded-md text-xs font-medium transition-colors ${
              dayFilter === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Toda semana
          </button>
          {weekStrip.map((d) => {
            const active = dayFilter === d.dow;
            const empty = d.count === 0;
            return (
              <button
                key={d.dow}
                onClick={() => setDayFilter(active ? "all" : d.dow)}
                disabled={empty && !active}
                className={`shrink-0 h-9 px-2.5 rounded-md flex items-center gap-1.5 text-xs transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : d.isToday
                      ? "text-primary hover:bg-muted"
                      : empty
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="font-medium">{WEEK_SHORT[d.dow]}</span>
                <span className="tabular-nums opacity-80">{d.date.getDate()}</span>
                {d.count > 0 && (
                  <span className={`ml-0.5 text-[10px] tabular-nums ${active ? "opacity-90" : "opacity-60"}`}>
                    ·{d.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente, placa ou modelo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-muted/30 border-transparent focus-visible:bg-background focus-visible:border-input"
          />
        </div>
      </div>

      {/* Em atraso */}
      {filteredOverdue.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-destructive">Em atraso</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{filteredOverdue.length}</span>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {fmtBRL(filteredOverdue.reduce((s, i) => s + (i.entry.valor || 0), 0))}
            </span>
          </div>
          <div className="rounded-lg border divide-y bg-card">
            {filteredOverdue.map((it) => (
              <RowItemView
                key={it.entry.id}
                item={it}
                onConfirm={openConfirm}
                onMessage={handleMessage}
                onWhatsApp={openWhatsApp}
                onCopy={copyText}
                onRescheduleQuick={quickReschedule}
                onRescheduleCustom={openReschedule}
              />
            ))}
          </div>
        </section>
      )}

      {/* Semana */}
      <section>
        <div className="flex items-baseline justify-between mb-2 px-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dayFilter === "all" ? "Semana" : WEEK_LONG[dayFilter as number]}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{filteredWeek.length}</span>
          </div>
          {dayFilter !== "all" && (
            <button onClick={() => setDayFilter("all")} className="text-[11px] text-muted-foreground hover:text-foreground">
              Ver semana toda
            </button>
          )}
        </div>

        {filteredWeek.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-sm text-muted-foreground text-center">
            {weekItems.length === 0
              ? "Nenhuma cobrança agendada para esta semana."
              : "Nenhuma cobrança para este filtro."}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedWeek.map((g) => {
              const isToday = diffDays(today, g.date) === 0;
              return (
                <div key={g.dow}>
                  <div className="flex items-baseline justify-between mb-1.5 px-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[11px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {WEEK_LONG[g.dow]} {g.date.getDate()}/{g.date.getMonth() + 1}
                        {isToday && " · hoje"}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {g.items.length} · {fmtBRL(g.items.reduce((s, i) => s + (i.entry.valor || 0), 0))}
                    </span>
                  </div>
                  <div className="rounded-lg border divide-y bg-card">
                    {g.items.map((it) => (
                      <RowItemView
                        key={it.entry.id}
                        item={it}
                        onConfirm={openConfirm}
                        onMessage={handleMessage}
                        onWhatsApp={openWhatsApp}
                        onCopy={copyText}
                        onRescheduleQuick={quickReschedule}
                        onRescheduleCustom={openReschedule}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MessagePopup */}
      {msgState && (() => {
        const { item, type } = msgState;
        const tokens = tokensFor(item);
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

      {/* Dialog: Confirmar pagamento */}
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

      {/* Dialog: Adiar (data customizada) */}
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
  item, onConfirm, onMessage, onWhatsApp, onCopy, onRescheduleQuick, onRescheduleCustom,
}: {
  item: RowItem;
  onConfirm: (i: RowItem) => void;
  onMessage: (i: RowItem, t: MsgType) => void;
  onWhatsApp: (i: RowItem, t: MsgType) => void;
  onCopy: (text: string, label: string) => void;
  onRescheduleQuick: (i: RowItem, deltaDays: number) => void;
  onRescheduleCustom: (i: RowItem) => void;
}) {
  const meta = metaFor(item.catKey);
  const Icon = meta.icon;
  const isOverdue = item.daysLate > 0;
  const tokens = tokensFor(item);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      <div className={`w-1 self-stretch rounded-full ${isOverdue ? "bg-destructive" : meta.tone.stripe}`} />
      <div className={`h-8 w-8 rounded-md grid place-items-center shrink-0 ${meta.tone.bg} ${meta.tone.text}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{item.clienteNome}</span>
          {item.placa && (
            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-muted-foreground tracking-wider">
              <Bike className="h-3 w-3" />
              {item.placa}
            </span>
          )}
          {isOverdue && (
            <Badge className="bg-destructive text-destructive-foreground border-0 h-4 px-1.5 text-[10px]">
              {item.daysLate}d atraso
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {meta.label}
          {item.due && ` • Venc. ${item.due.toLocaleDateString("pt-BR")}`}
          {item.entry.descricao && ` • ${item.entry.descricao}`}
        </div>
      </div>

      <div className={`text-right shrink-0 ${isOverdue ? "text-destructive" : ""}`}>
        <div className="text-sm md:text-base font-extrabold tabular-nums leading-tight">
          {fmtBRL(item.entry.valor || 0)}
        </div>
      </div>

      {/* Confirmar pagamento */}
      <Button
        size="sm"
        className="shrink-0 h-8 bg-success text-success-foreground hover:bg-success/90 px-2.5"
        onClick={() => onConfirm(item)}
        title="Confirmar pagamento"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span className="hidden md:inline ml-1.5 text-xs">Pago</span>
      </Button>

      {/* WhatsApp (default = atraso se atrasado, dia se hoje, lembrete se futuro) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0 h-8 px-2 gap-1" title="WhatsApp / Mensagem">
            <MessageCircle className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Enviar WhatsApp
          </DropdownMenuLabel>
          {MSG_TYPES.map((mt) => (
            <DropdownMenuItem key={`wa-${mt.key}`} onClick={() => onWhatsApp(item, mt)} className="gap-2 cursor-pointer">
              <mt.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">{mt.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Abrir editor
          </DropdownMenuLabel>
          {MSG_TYPES.map((mt) => (
            <DropdownMenuItem key={`ed-${mt.key}`} onClick={() => onMessage(item, mt)} className="gap-2 cursor-pointer">
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs">{mt.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mais ações */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" title="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Copiar */}
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Copiar
          </DropdownMenuLabel>
          {item.telefoneCliente && (
            <DropdownMenuItem
              onClick={() => onCopy(item.telefoneCliente!, "Telefone")}
              className="gap-2 cursor-pointer"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Telefone</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">{item.telefoneCliente}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 text-xs">
              <Copy className="h-4 w-4 text-muted-foreground" />
              Copiar mensagem
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-60">
                {MSG_TYPES.map((mt) => (
                  <DropdownMenuItem
                    key={`cp-${mt.key}`}
                    onClick={() => onCopy(applyTokens(mt.template, tokens), mt.label)}
                    className="gap-2 cursor-pointer"
                  >
                    <mt.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">{mt.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Adiar vencimento
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onRescheduleQuick(item, 1)} className="gap-2 cursor-pointer">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs">+ 1 dia</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRescheduleQuick(item, 3)} className="gap-2 cursor-pointer">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs">+ 3 dias</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRescheduleQuick(item, 7)} className="gap-2 cursor-pointer">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs">+ 7 dias</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRescheduleCustom(item)} className="gap-2 cursor-pointer">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs">Outra data…</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Abrir cadastro
          </DropdownMenuLabel>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/clientes" className="gap-2 flex items-center">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Ver cliente</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/motos" className="gap-2 flex items-center">
              <Bike className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Ver moto</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── KPI auxiliares ───────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, tone, warn, extra,
}: {
  icon: any; label: string; value: string; sub?: string;
  tone: "primary" | "destructive" | "success" | "muted";
  warn?: boolean;
  extra?: React.ReactNode;
}) {
  const map = {
    primary: { border: "border-primary/30", bg: "bg-primary/5", text: "text-primary" },
    destructive: { border: "border-destructive/30", bg: "bg-destructive/5", text: "text-destructive" },
    success: { border: "border-success/30", bg: "bg-success/5", text: "text-success" },
    muted: { border: "border-border", bg: "bg-muted/40", text: "text-foreground" },
  }[tone];
  return (
    <div className={`rounded-xl border ${map.border} ${map.bg} p-3 space-y-1`}>
      <div className={`flex items-center gap-2 ${map.text}`}>
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-xl font-extrabold tabular-nums ${map.text}`}>{value}</div>
      {sub && (
        <div className={`text-[11px] ${warn ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {sub}
        </div>
      )}
      {extra}
    </div>
  );
}

function CategoryKpi({
  catKey, totals,
}: {
  catKey: string;
  totals?: { count: number; valor: number; paidCount: number; paidValor: number };
}) {
  const meta = metaFor(catKey);
  const Icon = meta.icon;
  const t = totals || { count: 0, valor: 0, paidCount: 0, paidValor: 0 };
  return (
    <div className={`rounded-xl border ${meta.tone.border} ${meta.tone.bg} p-3 space-y-1`}>
      <div className={`flex items-center gap-2 ${meta.tone.text}`}>
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{meta.label}</span>
      </div>
      <div className={`text-xl font-extrabold tabular-nums ${meta.tone.text}`}>{t.count + t.paidCount}</div>
      <div className="text-[11px] text-muted-foreground">
        Pagas <strong className="text-success">{t.paidCount}</strong>
        {" • "}Pendentes <strong className="text-destructive">{t.count}</strong>
      </div>
    </div>
  );
}
