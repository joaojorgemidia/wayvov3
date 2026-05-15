import React, { useMemo, useState } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, AlertTriangle, CheckCircle2, User, Bike,
  Wallet, ShieldCheck, Receipt, Coins, Tag, MessageCircle,
  Bell, Wrench, Clock, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { saveFinancial } from "@/lib/store";
import { FinancialEntry } from "@/lib/types";
import { MessagePopup } from "@/components/MessagePopup";
import { applyTokens } from "@/lib/message-tokens";

const WEEK_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

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

export default function CobrancasSemanaPage() {
  const cache = useDataCacheSnapshot();
  const [confirmItem, setConfirmItem] = useState<RowItem | null>(null);
  const [form, setForm] = useState({ data: "", valor: "", conta: "", observacao: "" });
  const [msgState, setMsgState] = useState<{ item: RowItem; type: MsgType } | null>(null);

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

  const weekByDay = useMemo(() => {
    const map = new Map<number, RowItem[]>();
    for (const it of weekItems) {
      const k = it.due!.getDay();
      const arr = map.get(k) || [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }, [weekItems]);

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
      // Apenas vencimentos dentro da semana atual (Seg–Dom)
      if (due < monday || due > sunday) continue;
      bump((e.categoria || "outro").toLowerCase(), e.valor || 0, !!e.pago);
    }
    return m;
  }, [cache.financial, monday, sunday, today]);

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

  const contas = useMemo(() => {
    const set = new Set<string>();
    cache.bankAccounts.forEach((b) => b.nome && set.add(b.nome));
    cache.financial.forEach((e) => e.conta && set.add(e.conta));
    return Array.from(set).sort();
  }, [cache.bankAccounts, cache.financial]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Cobranças da semana
          </h1>
          <p className="text-sm text-muted-foreground">
            Receitas pendentes de locatários para{" "}
            <strong>{monday.getDate()} {MONTH_SHORT[monday.getMonth()]}</strong>{" "}
            a{" "}
            <strong>{sunday.getDate()} {MONTH_SHORT[sunday.getMonth()]}</strong>
            , com atrasos de semanas anteriores.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Wallet}
          label="Aluguéis da semana"
          value={String(aluguelStats.totalCobr)}
          sub={`a receber ou pagos • ${fmtBRL(aluguelStats.valorPendente + aluguelStats.valorPago)}`}
          tone="primary"
          extra={
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <div>
                Pagas <strong className="text-success">{aluguelStats.pagas}</strong> ({fmtBRL(aluguelStats.valorPago)})
              </div>
              <div>
                Pendentes <strong className="text-destructive">{aluguelStats.pendentes}</strong> ({fmtBRL(aluguelStats.valorPendente)})
              </div>
            </div>
          }
        />
        <KpiCard
          icon={Bike}
          label="Locações ativas"
          value={String(aluguelStats.totalActive)}
          sub={
            aluguelStats.desbalanco === 0
              ? "✓ Todas com cobrança na semana"
              : aluguelStats.desbalanco > 0
                ? `Faltam ${aluguelStats.desbalanco} cobrança(s) cadastrada(s)`
                : `${Math.abs(aluguelStats.desbalanco)} cobrança(s) a mais que locações`
          }
          tone={aluguelStats.desbalanco === 0 ? "success" : "destructive"}
          warn={aluguelStats.desbalanco !== 0}
          extra={
            <div className="text-[11px] text-muted-foreground">
              Cadastradas: <strong>{aluguelStats.totalCobr}</strong> de <strong>{aluguelStats.totalActive}</strong>
              {" • "}Novas na semana: <strong className="text-primary">{aluguelStats.novasNaSemana}</strong>
            </div>
          }
        />
        <CategoryKpi catKey="caucao" totals={totalsByCat.get("caucao")} />
        <KpiCard
          icon={AlertTriangle}
          label="Em atraso"
          value={String(overdueItems.length)}
          sub={fmtBRL(overdueItems.reduce((s, i) => s + (i.entry.valor || 0), 0))}
          tone="destructive"
        />
      </div>

      {overdueItems.length > 0 && (
        <SectionBlock
          title="Em atraso"
          icon={AlertTriangle}
          tone={{ bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" }}
          subtitle={`${overdueItems.length} cobrança(s) — ${fmtBRL(overdueItems.reduce((s, i) => s + (i.entry.valor || 0), 0))}`}
          items={overdueItems}
          onConfirm={openConfirm}
          onMessage={handleMessage}
        />
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Semana atual (Seg–Dom)</h2>
          <Badge variant="secondary">{weekItems.length}</Badge>
        </div>
        {weekItems.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              Nenhuma cobrança agendada para esta semana. 🎉
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {[1,2,3,4,5,6,0].map((dow) => {
              const items = weekByDay.get(dow);
              if (!items || items.length === 0) return null;
              const sample = items[0].due!;
              const isToday = diffDays(today, sample) === 0;
              return (
                <DayBlock
                  key={dow}
                  date={sample}
                  isToday={isToday}
                  items={items}
                  onConfirm={openConfirm}
                  onMessage={handleMessage}
                />
              );
            })}
          </div>
        )}
      </div>

      {msgState && (() => {
        const { item, type } = msgState;
        const tokens: Record<string, string> = {
          "{NOME}": item.clienteNome,
          "{PLACA}": item.placa || "—",
          "{VALOR}": fmtBRL(item.entry.valor || 0),
          "{DATA_VENCIMENTO}": item.due?.toLocaleDateString("pt-BR") || "—",
          "{DIAS_ATRASO}": String(item.daysLate),
        };
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

      <Dialog open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
            <DialogDescription>
              {confirmItem
                ? `${confirmItem.clienteNome} • ${metaFor(confirmItem.catKey).label}`
                : ""}
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
                  <Select
                    value={form.conta || undefined}
                    onValueChange={(v) => setForm((p) => ({ ...p, conta: v }))}
                  >
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
    </div>
  );
}

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
    <div className={`rounded-xl border ${map.border} ${map.bg} p-4 space-y-1`}>
      <div className={`flex items-center gap-2 ${map.text}`}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-extrabold tabular-nums ${map.text}`}>{value}</div>
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
    <div className={`rounded-xl border ${meta.tone.border} ${meta.tone.bg} p-4 space-y-1`}>
      <div className={`flex items-center gap-2 ${meta.tone.text}`}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
      </div>
      <div className={`text-2xl font-extrabold tabular-nums ${meta.tone.text}`}>
        {t.count + t.paidCount}
      </div>
      <div className="text-[11px] text-muted-foreground">
        Pagas <strong className="text-success">{t.paidCount}</strong>
        {" • "}
        Pendentes <strong className="text-destructive">{t.count}</strong>
      </div>
    </div>
  );
}

function SectionBlock({
  title, icon: Icon, tone, subtitle, items, onConfirm, onMessage, dim,
}: {
  title: string; icon: any;
  tone: { bg: string; border: string; text: string };
  subtitle?: string;
  items: RowItem[];
  onConfirm: (i: RowItem) => void;
  onMessage: (i: RowItem, t: MsgType) => void;
  dim?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className={`flex items-center justify-between gap-2 rounded-lg border ${tone.border} ${tone.bg} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${tone.text}`} />
          <span className={`text-sm font-semibold ${tone.text}`}>{title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
        </div>
        {subtitle && <span className={`text-xs ${tone.text}`}>{subtitle}</span>}
      </div>
      <div className={`space-y-2 ${dim ? "opacity-90" : ""}`}>
        {items.map((it) => (
          <RowCard key={it.entry.id} item={it} onConfirm={onConfirm} onMessage={onMessage} />
        ))}
      </div>
    </section>
  );
}

function DayBlock({
  date, isToday, items, onConfirm, onMessage,
}: {
  date: Date; isToday: boolean;
  items: RowItem[];
  onConfirm: (i: RowItem) => void;
  onMessage: (i: RowItem, t: MsgType) => void;
}) {
  const dow = date.getDay();
  const total = items.reduce((s, i) => s + (i.entry.valor || 0), 0);
  return (
    <div className={`rounded-xl border overflow-hidden ${
      isToday ? "border-primary/40 ring-1 ring-primary/30" : ""
    }`}>
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
        isToday ? "bg-primary/10" : "bg-muted/40"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`shrink-0 w-12 text-center rounded-md border overflow-hidden ${
            isToday ? "bg-primary text-primary-foreground border-primary" : "bg-background"
          }`}>
            <div className="text-[10px] uppercase font-bold py-0.5">{WEEK_SHORT[dow]}</div>
            <div className="text-lg font-extrabold leading-none pb-1">{date.getDate()}</div>
          </div>
          <div>
            <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
              {WEEK_LONG[dow]} {isToday && "• Hoje"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {items.length} cobrança(s){total > 0 ? ` • ${fmtBRL(total)}` : ""}
            </div>
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2 bg-card">
        {items.map((it) => (
          <RowCard key={it.entry.id} item={it} onConfirm={onConfirm} onMessage={onMessage} />
        ))}
      </div>
    </div>
  );
}

function RowCard({
  item, onConfirm, onMessage,
}: {
  item: RowItem;
  onConfirm: (i: RowItem) => void;
  onMessage: (i: RowItem, t: MsgType) => void;
}) {
  const meta = metaFor(item.catKey);
  const Icon = meta.icon;
  const isOverdue = item.daysLate > 0;

  const toneIcon: Record<MsgType["tone"], string> = {
    primary: "text-primary",
    warning: "text-yellow-600",
    danger: "text-destructive",
  };

  return (
    <Card className={`overflow-hidden hover:shadow-sm transition-shadow ${
      isOverdue ? "ring-1 ring-destructive/30" : ""
    }`}>
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${isOverdue ? "bg-destructive" : meta.tone.stripe}`} />
        <CardContent className="flex-1 p-3 flex flex-wrap items-center gap-3">
          <div className={`h-9 w-9 rounded-md grid place-items-center ${meta.tone.bg} ${meta.tone.text}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${meta.tone.text}`}>{meta.label}</span>
              {isOverdue && (
                <Badge className="bg-destructive text-destructive-foreground border-0 text-[10px] gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {item.daysLate}d em atraso
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{item.clienteNome}</span>
              </span>
              {item.placa && (
                <span className="inline-flex items-center gap-1.5">
                  <Bike className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono tracking-wider font-semibold">{item.placa}</span>
                </span>
              )}
              {item.due && (
                <span className="text-xs text-muted-foreground">
                  Venc. {item.due.toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
            {item.entry.descricao && (
              <div className="text-xs text-muted-foreground truncate">{item.entry.descricao}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className={`text-lg font-extrabold tabular-nums leading-tight ${
              isOverdue ? "text-destructive" : "text-foreground"
            }`}>
              {fmtBRL(item.entry.valor || 0)}
            </div>
          </div>

          {/* Botão de mensagem */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-muted-foreground hover:text-primary hover:border-primary/40"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Mensagem</span>
                <ChevronRight className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Tipo de mensagem
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MSG_TYPES.map((mt) => {
                const MtIcon = mt.icon;
                return (
                  <DropdownMenuItem
                    key={mt.key}
                    onClick={() => onMessage(item, mt)}
                    className="gap-2.5 cursor-pointer"
                  >
                    <MtIcon className={`h-4 w-4 shrink-0 ${toneIcon[mt.tone]}`} />
                    <span>{mt.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            className="shrink-0 bg-success text-success-foreground hover:bg-success/90"
            onClick={() => onConfirm(item)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Confirmar
          </Button>
        </CardContent>
      </div>
    </Card>
  );
}