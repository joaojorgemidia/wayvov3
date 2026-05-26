import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, EyeOff, Eye, Wallet, Receipt, Droplet, ClipboardCheck, Wrench, User, Bike, MessageSquare, Settings as SettingsIcon, Coins, CalendarClock, Sunrise, Clock } from "lucide-react";
import { toast } from "sonner";
import { useCollections } from "@/hooks/useCollections";
import { FollowupBadge } from "@/components/FollowupBadge";
import {
  CollectionModule,
  CollectionRule,
  MODULE_LABELS,
  PendingItem,
} from "@/lib/collections";
import { CollectionRuleEditor } from "@/components/CollectionRuleEditor";
import { CollectionActionDialog } from "@/components/CollectionActionDialog";
import { getDataCache, isDataCacheInitialized } from "@/lib/data-cache";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { saveFinancial, saveFines, saveMaintenance, saveMotos } from "@/lib/store";
import { OilChangeRecord } from "@/lib/types";
import { brandConfigFor, loadBrandConfig } from "@/lib/oil-kpis";
import { MessagePopup } from "@/components/MessagePopup";
import { buildAllTokens } from "@/lib/message-tokens";
import { formatDate } from "@/lib/alerts";

function moduleBadgeColor(m: CollectionModule) {
  switch (m) {
    case "pagamento": return "bg-primary/10 text-primary border-primary/30";
    case "multa":     return "bg-destructive/10 text-destructive border-destructive/30";
    case "outras_receitas": return "bg-accent/10 text-accent-foreground border-accent/30";
    case "oleo":      return "bg-warning/10 text-warning border-warning/30";
    case "vistoria":  return "bg-secondary text-secondary-foreground border-border";
    case "manutencao":return "bg-muted text-muted-foreground border-border";
  }
}

const MODULE_ICONS: Record<CollectionModule, React.ComponentType<{ className?: string }>> = {
  pagamento: Wallet,
  multa: Receipt,
  outras_receitas: Coins,
  oleo: Droplet,
  vistoria: ClipboardCheck,
  manutencao: Wrench,
};

const MODULE_TONES: Record<CollectionModule, {
  stripe: string; bgSoft: string; text: string; tile: string; badge: string;
}> = {
  pagamento: {
    stripe: "bg-primary", bgSoft: "bg-primary/5", text: "text-primary",
    tile: "bg-primary/10 text-primary border-primary/30",
    badge: "bg-primary text-primary-foreground",
  },
  multa: {
    stripe: "bg-destructive", bgSoft: "bg-destructive/5", text: "text-destructive",
    tile: "bg-destructive/10 text-destructive border-destructive/30",
    badge: "bg-destructive text-destructive-foreground",
  },
  outras_receitas: {
    stripe: "bg-success", bgSoft: "bg-success/5", text: "text-success",
    tile: "bg-success/10 text-success border-success/30",
    badge: "bg-success text-success-foreground",
  },
  oleo: {
    stripe: "bg-warning", bgSoft: "bg-warning/5", text: "text-warning",
    tile: "bg-warning/10 text-warning border-warning/30",
    badge: "bg-warning text-warning-foreground",
  },
  vistoria: {
    stripe: "bg-foreground/50", bgSoft: "bg-muted/40", text: "text-foreground",
    tile: "bg-muted text-foreground border-border",
    badge: "bg-foreground/80 text-background",
  },
  manutencao: {
    stripe: "bg-muted-foreground", bgSoft: "bg-muted/50", text: "text-foreground",
    tile: "bg-muted text-foreground border-border",
    badge: "bg-muted-foreground text-background",
  },
};

const WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function FinancialKpis({ pendings }: { pendings: PendingItem[] }) {
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const totalPend = pendings.reduce((s, p) => s + (p.valor || 0), 0);
  const atrasados = pendings.filter((p) => p.daysLate > 0);
  const totalAtraso = atrasados.reduce((s, p) => s + (p.valor || 0), 0);
  const receitasPend = pendings.filter((p) => p.module === "pagamento" || p.module === "multa" || p.module === "outras_receitas");
  const totalReceitas = receitasPend.reduce((s, p) => s + (p.valor || 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Em atraso</span>
        </div>
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-destructive">{fmtBRL(totalAtraso)}</div>
        <div className="text-[11px] text-muted-foreground">{atrasados.length} {atrasados.length === 1 ? "pendência" : "pendências"}</div>
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-primary">
          <Wallet className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Receitas pendentes</span>
        </div>
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-primary">{fmtBRL(totalReceitas)}</div>
        <div className="text-[11px] text-muted-foreground">Aluguel, caução, multas e outras</div>
      </div>
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-foreground">
          <Receipt className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Total pendente</span>
        </div>
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{fmtBRL(totalPend)}</div>
        <div className="text-[11px] text-muted-foreground">{pendings.length} {pendings.length === 1 ? "tarefa" : "tarefas"} no total</div>
      </div>
    </div>
  );
}

function parseISODate(s: string | null) {
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function PendingRow({
  item,
  onIgnore,
  onResolve,
  onCharge,
  escalated,
}: {
  item: PendingItem;
  onIgnore: (i: PendingItem) => void;
  onResolve: (i: PendingItem) => void;
  onCharge: (i: PendingItem) => void;
  escalated?: boolean;
}) {
  const cliente = item.clienteId && isDataCacheInitialized()
    ? getDataCache().clients.find((c) => c.id === item.clienteId)
    : null;
  const moto = item.motoId && isDataCacheInitialized()
    ? getDataCache().motos.find((m) => m.id === item.motoId)
    : null;
  const tone = MODULE_TONES[item.module];
  const Icon = MODULE_ICONS[item.module];

  const due = parseISODate(item.dueDateISO);
  const dia = due?.getDate();
  const mes = due ? MONTH_SHORT[due.getMonth()] : "";
  const dow = due ? WEEK_SHORT[due.getDay()] : "";

  const lateLabel =
    item.daysLate > 0 ? `${item.daysLate}d em atraso`
      : item.daysLate === 0 ? "Hoje"
      : item.dueDateISO ? `Em ${Math.abs(item.daysLate)}d` : "Sem data";

  const dotsTotal = item.totalStages;
  const dotsActive = item.sentStage;
  const isOverdue = item.daysLate > 0;
  const valorFmt = typeof item.valor === "number"
    ? item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${
      escalated
        ? "ring-2 ring-destructive/50 bg-destructive/5"
        : isOverdue
          ? "ring-1 ring-destructive/30 bg-destructive/[0.03]"
          : ""
    }`}>
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${isOverdue ? "bg-destructive" : tone.stripe}`} />
        <CardContent className="flex-1 p-4 space-y-3">
          <div className="flex items-stretch gap-4">
            {/* Bloco "calendário" / ícone */}
            <div className={`shrink-0 rounded-lg border w-16 overflow-hidden text-center ${
              isOverdue ? "bg-destructive/10 text-destructive border-destructive/40" : tone.tile
            }`}>
              {due ? (
                <>
                  <div className={`text-[10px] uppercase font-bold py-0.5 ${
                    isOverdue ? "bg-destructive text-destructive-foreground" : tone.badge
                  }`}>{dow}</div>
                  <div className="text-2xl font-bold leading-none pt-1.5">{dia}</div>
                  <div className="text-[10px] uppercase pb-1.5 opacity-80">{mes}</div>
                </>
              ) : (
                <div className="grid place-items-center h-full py-3">
                  <Icon className="h-6 w-6" />
                </div>
              )}
            </div>

            {/* Info principal */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-base font-semibold ${tone.text}`}>
                      <Icon className="h-4 w-4" />
                      {item.categoriaLabel || MODULE_LABELS[item.module]}
                    </span>
                    {isOverdue ? (
                      <Badge className="bg-destructive text-destructive-foreground border-0 text-[11px] gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {lateLabel}
                      </Badge>
                    ) : (
                      <Badge className={`${tone.badge} border-0 text-[11px]`}>{lateLabel}</Badge>
                    )}
                    {escalated && (
                      <Badge variant="outline" className="border-destructive/40 text-destructive text-[11px]">
                        Alerta máximo
                      </Badge>
                    )}
                    {item.sentStage > 0 && (
                      <Badge variant="outline" className="border-primary/40 text-primary text-[11px] gap-1">
                        <MessageSquare className="h-3 w-3" />
                        FUP {item.sentStage}/{item.totalStages}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{cliente?.nome || "Sem locatário"}</span>
                      {cliente?.telefone && (
                        <span className="text-muted-foreground text-xs">• {cliente.telefone}</span>
                      )}
                    </span>
                    {moto && (
                      <span className="inline-flex items-center gap-1.5">
                        <Bike className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono tracking-wider font-semibold">{moto.placa}</span>
                        <span className="text-muted-foreground">{moto.modelo}</span>
                      </span>
                    )}
                  </div>
                  {item.descricao && (
                    <div className="text-xs text-muted-foreground truncate">{item.descricao}</div>
                  )}
                </div>

                {/* Valor + Etapas */}
                <div className="text-right shrink-0 space-y-1">
                  {valorFmt && (
                    <div className={`text-2xl font-extrabold tabular-nums leading-tight ${
                      isOverdue ? "text-destructive" : "text-foreground"
                    }`}>
                      {valorFmt}
                    </div>
                  )}
                  <div className="flex items-center gap-1 justify-end">
                    {Array.from({ length: dotsTotal }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-full ${i < dotsActive ? tone.stripe : "bg-muted"}`}
                      />
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      Etapa {dotsActive}/{dotsTotal}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-semibold"
              onClick={() => onCharge(item)}
            >
              <MessageSquare className="h-4 w-4 mr-1.5" /> Realizar cobrança
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-success/40 text-success hover:bg-success/10 hover:text-success"
              onClick={() => onResolve(item)}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Marcar como realizada
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => onIgnore(item)}>
              <EyeOff className="h-4 w-4 mr-1" /> Ignorar
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

function ModuleSection({
  module, items, onIgnore, onResolve, onCharge,
}: {
  module: CollectionModule;
  items: PendingItem[];
  onIgnore: (i: PendingItem) => void;
  onResolve: (i: PendingItem) => void;
  onCharge: (i: PendingItem) => void;
}) {
  const Icon = MODULE_ICONS[module];
  const tone = MODULE_TONES[module];
  if (items.length === 0) return null;
  const totalValor = items.reduce((s, p) => s + (p.valor || 0), 0);
  const totalAtraso = items.filter((p) => p.daysLate > 0).length;
  const valorAtraso = items.filter((p) => p.daysLate > 0).reduce((s, p) => s + (p.valor || 0), 0);
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // Grupo 1: precisa de ação (etapa atual ainda não enviada). Grupo 2: já cobrado, aguardando próxima etapa.
  const aCobrar = items.filter((p) => p.sentStage < p.expectedStage);
  const aguardando = items.filter((p) => p.sentStage >= p.expectedStage);
  return (
    <section className={`rounded-xl border overflow-hidden ${tone.bgSoft}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card/60 backdrop-blur">
        <div className={`h-8 w-8 rounded-md grid place-items-center ${tone.stripe} text-primary-foreground`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className={`text-sm font-semibold ${tone.text}`}>{MODULE_LABELS[module]}</div>
          <div className="text-[11px] text-muted-foreground">
            {items.length} {items.length === 1 ? "tarefa" : "tarefas"} pendente{items.length === 1 ? "" : "s"}
            {totalAtraso > 0 && (
              <span className="text-destructive font-semibold"> • {totalAtraso} em atraso</span>
            )}
          </div>
        </div>
        {totalValor > 0 && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total pendente</div>
            <div className={`text-base font-bold tabular-nums ${valorAtraso > 0 ? "text-destructive" : "text-foreground"}`}>
              {fmtBRL(totalValor)}
            </div>
          </div>
        )}
      </div>
      <div className="p-3 space-y-4">
        {aCobrar.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
                A cobrar agora
              </span>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{aCobrar.length}</Badge>
            </div>
            <div className="space-y-3">
              {aCobrar.map((p) => (
                <PendingRow key={`${p.module}-${p.entityId}`} item={p}
                  onIgnore={onIgnore} onResolve={onResolve} onCharge={onCharge} />
              ))}
            </div>
          </div>
        )}
        {aguardando.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                Aguardando próxima etapa
              </span>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{aguardando.length}</Badge>
            </div>
            <div className="space-y-3 opacity-90">
              {aguardando.map((p) => (
                <PendingRow key={`${p.module}-${p.entityId}`} item={p}
                  onIgnore={onIgnore} onResolve={onResolve} onCharge={onCharge} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function CobrancasPage() {
  const { rules, followups, pendings, escalated, loading, saveRule, registerFollowup } = useCollections();
  const [editing, setEditing] = useState<Record<CollectionModule, CollectionRule>>(() => rules);
  const { activeCompany } = useCompany();
  const [resolveItem, setResolveItem] = useState<PendingItem | null>(null);
  const [chargeItem, setChargeItem] = useState<PendingItem | null>(null);
  const [messagePopup, setMessagePopup] = useState<{
    open: boolean;
    title: string;
    mensagem: string;
    placa: string;
    cliente: string;
    telefone: string;
    highlights: { label: string; value: string; tone: "primary" | "warning" | "danger" }[];
    templateKey: string;
    tokens: Record<string, string>;
  }>({ open: false, title: "", mensagem: "", placa: "", cliente: "", telefone: "", highlights: [], templateKey: "", tokens: {} });
  const [resolveData, setResolveData] = useState<{
    data: string;
    km: string;
    valor: string;
    conta: string;
    observacao: string;
  }>({ data: new Date().toISOString().slice(0, 10), km: "", valor: "", conta: "", observacao: "" });
  const ignoreKey = `cobrancas:ignored:${activeCompany?.id || "default"}`;
  const [ignored, setIgnored] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`cobrancas:ignored:${activeCompany?.id || "default"}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [showIgnored, setShowIgnored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ignoreKey);
      setIgnored(new Set(raw ? JSON.parse(raw) : []));
    } catch { setIgnored(new Set()); }
  }, [ignoreKey]);

  const persistIgnored = (next: Set<string>) => {
    setIgnored(new Set(next));
    try { localStorage.setItem(ignoreKey, JSON.stringify(Array.from(next))); } catch {}
  };

  const itemKey = (i: PendingItem) => `${i.module}:${i.entityId}`;

  const handleIgnore = (item: PendingItem) => {
    const next = new Set(ignored);
    next.add(itemKey(item));
    persistIgnored(next);
    toast.success("Cobrança ignorada");
  };
  const handleUnignore = (item: PendingItem) => {
    const next = new Set(ignored);
    next.delete(itemKey(item));
    persistIgnored(next);
    toast.success("Cobrança restaurada");
  };

  const visiblePendings = useMemo(
    () => pendings.filter((p) => !ignored.has(itemKey(p))),
    [pendings, ignored],
  );
  const visibleEscalated = useMemo(
    () => escalated.filter((p) => !ignored.has(itemKey(p))),
    [escalated, ignored],
  );
  const ignoredItems = useMemo(
    () => [...pendings, ...escalated].filter((p) => ignored.has(itemKey(p))),
    [pendings, escalated, ignored],
  );

  // Sincroniza editor quando rules carregam
  useEffect(() => { setEditing(rules); }, [rules]);

  const totals = useMemo(() => ({
    pendentes: visiblePendings.length,
    escalados: visibleEscalated.length,
    ignorados: ignoredItems.length,
  }), [visiblePendings, visibleEscalated, ignoredItems]);

  const getCliente = (id: string | null) =>
    id && isDataCacheInitialized()
      ? getDataCache().clients.find((c) => c.id === id)
      : null;

  const openResolve = (item: PendingItem) => {
    if (!isDataCacheInitialized()) return;
    const cache = getDataCache();
    let presets = { data: new Date().toISOString().slice(0, 10), km: "", valor: "", conta: "", observacao: "" };
    if (item.module === "pagamento" || item.module === "outras_receitas") {
      const e = cache.financial.find((f) => f.id === item.entityId);
      if (e) presets = { ...presets, valor: String(e.valor), conta: e.conta || "" };
    } else if (item.module === "oleo" && item.motoId) {
      const m = cache.motos.find((x) => x.id === item.motoId);
      if (m) presets = { ...presets, km: String(m.kmAtual ?? "") };
    } else if (item.module === "manutencao") {
      const mn = cache.maintenance.find((x) => x.id === item.entityId);
      if (mn) presets = { ...presets, valor: String(mn.custo || 0) };
    }
    setResolveData(presets);
    setResolveItem(item);
  };

  const handleResolve = async () => {
    if (!resolveItem || !isDataCacheInitialized()) return;
    const cache = getDataCache();
    const item = resolveItem;
    try {
      if (item.module === "pagamento" || item.module === "outras_receitas") {
        const valor = parseFloat(resolveData.valor.replace(",", ".")) || 0;
        const entry = cache.financial.find((f) => f.id === item.entityId);
        const next = cache.financial.map((e) =>
          e.id === item.entityId
            ? { ...e, pago: true, data: resolveData.data, valor: valor || e.valor, conta: resolveData.conta || e.conta }
            : e,
        );
        await saveFinancial(next);

        // Popup de confirmação para o locatário
        if (item.module === "pagamento" && entry) {
          const moto = item.motoId ? cache.motos.find((m) => m.id === item.motoId) ?? null : null;
          const cliente = getCliente(item.clienteId);
          const rental = moto ? cache.rentals.find((r) => r.motoId === moto.id && r.status === "ativa") ?? null : null;
          const valorPago = valor || entry.valor;
          const descricao = item.descricao || entry.descricao || item.categoriaLabel || "Pagamento";
          const dataPagamento = formatDate(resolveData.data);

          const valorFmt = `R$ ${valorPago.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const vencimento = entry.data
            ? new Date(entry.data + "T12:00:00").toLocaleDateString("pt-BR")
            : dataPagamento;
          const motoLinha = moto?.placa
            ? `${moto.placa}${moto.modelo ? ` — ${moto.modelo}` : ""}`
            : (entry.placa || "—");

          const linhas: string[] = [];
          linhas.push(`✅ *PAGAMENTO CONFIRMADO*`);
          linhas.push("");
          linhas.push(`LOCATÁRIO: ${cliente?.nome || entry.clienteNome || "[NOME]"}`);
          linhas.push(`MOTO: ${motoLinha}`);
          linhas.push(`VENCIMENTO: ${vencimento}`);
          linhas.push("");
          linhas.push(`💰 *VALORES*`);
          linhas.push(`${descricao}: ${valorFmt}`);
          linhas.push(`─────────────`);
          linhas.push(`Total pago: *${valorFmt}*`);
          linhas.push("");
          linhas.push(`📅 *PAGAMENTO*`);
          linhas.push(`Data: ${dataPagamento}`);
          if (resolveData.conta) {
            linhas.push(`Conta: ${resolveData.conta}`);
          }
          linhas.push("");
          linhas.push(`— wayvo · dado · decisão · destino`);

          setMessagePopup({
            open: true,
            title: "Confirmação de Pagamento",
            mensagem: linhas.join("\n"),
            placa: moto?.placa || entry.placa || "—",
            cliente: cliente?.nome || entry.clienteNome || "",
            telefone: cliente?.telefone || "",
            highlights: [
              { label: "Valor pago", value: `R$ ${valorPago.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tone: "primary" },
            ],
            templateKey: "pagamento:confirmacao",
            tokens: buildAllTokens({ moto, rental, cliente: cliente ?? null }),
          });
        }
      } else if (item.module === "multa") {
        const next = cache.fines.map((f) =>
          f.id === item.entityId ? { ...f, status: "paga" as const } : f,
        );
        await saveFines(next);
      } else if (item.module === "oleo" && item.motoId) {
        const km = parseInt(resolveData.km, 10);
        if (!km || km <= 0) {
          toast.error("Informe o KM da troca");
          return;
        }
        const record: OilChangeRecord = { id: crypto.randomUUID(), data: resolveData.data, km };
        const motoBefore = cache.motos.find((m) => m.id === item.motoId);
        const next = cache.motos.map((m) =>
          m.id === item.motoId
            ? {
                ...m,
                historicoOleo: [...(m.historicoOleo || []), record],
                ultimaTrocaOleo: resolveData.data,
                kmTrocaOleo: km,
                kmAtual: Math.max(m.kmAtual ?? 0, km),
              }
            : m,
        );
        await saveMotos(next);
        // Etapa de confirmação para o locatário (mesma da página Troca de Óleo)
        if (motoBefore) {
            const cfg = brandConfigFor(motoBefore.modelo, loadBrandConfig());
            const proxOleoKm = km + cfg.oilKm;
            const proxFiltroKm = cfg.filterKm ? km + cfg.filterKm : null;
            const cliente = getCliente(item.clienteId);
            const rental = cache.rentals.find((r) => r.motoId === motoBefore.id && r.status === "ativa") ?? null;
            const dataFmt = formatDate(resolveData.data);
            const linhas: string[] = [];
            linhas.push(`Olá, ${cliente?.nome || "[NOME]"}! 👋`);
            linhas.push("");
            linhas.push(`Sua moto *${motoBefore.placa}*${motoBefore.modelo ? ` (${motoBefore.modelo})` : ""} está com o óleo novo. ✅`);
            linhas.push("");
            linhas.push(`_(realizada em ${km.toLocaleString("pt-BR")} Km · ${dataFmt})_`);
            linhas.push("");
            if (proxFiltroKm) {
              linhas.push("📍 *PRÓXIMAS MANUTENÇÕES:*");
              linhas.push(`🔧 Troca de óleo → *${proxOleoKm.toLocaleString("pt-BR")} Km*`);
              linhas.push(`🔴 Troca de filtro → *${proxFiltroKm.toLocaleString("pt-BR")} Km*`);
            } else {
              linhas.push("📍 *PRÓXIMA MANUTENÇÃO:*");
              linhas.push(`🔧 Troca de óleo → *${proxOleoKm.toLocaleString("pt-BR")} Km*`);
            }
            linhas.push("");
            linhas.push("Qualquer dúvida, estamos à disposição. 🏍️");
            const mensagem = linhas.join("\n");
            const highlights: { label: string; value: string; tone: "primary" | "warning" | "danger" }[] = [
              { label: "Próxima troca de óleo", value: `${proxOleoKm.toLocaleString("pt-BR")} km`, tone: "primary" },
            ];
            if (proxFiltroKm) highlights.push({ label: "Próxima troca de filtro", value: `${proxFiltroKm.toLocaleString("pt-BR")} km`, tone: "warning" });
            setMessagePopup({
              open: true,
              title: "Mensagem para o Locatário",
              mensagem,
              placa: motoBefore.placa,
              cliente: cliente?.nome || "",
              telefone: cliente?.telefone || "",
              highlights,
              templateKey: proxFiltroKm ? "oleo:sucesso-com-filtro" : "oleo:sucesso",
              tokens: buildAllTokens({
                moto: { ...motoBefore, kmAtual: Math.max(motoBefore.kmAtual ?? 0, km) },
                rental,
                cliente: cliente ?? null,
                oil: { kmTroca: km, dataTroca: resolveData.data, proxOleoKm, proxFiltroKm },
              }),
            });
        }
      } else if (item.module === "vistoria" && item.motoId) {
        const next = cache.motos.map((m) =>
          m.id === item.motoId ? { ...m, ultimaVistoria: resolveData.data } : m,
        );
        await saveMotos(next);
      } else if (item.module === "manutencao") {
        const custo = parseFloat(resolveData.valor.replace(",", ".")) || 0;
        const next = cache.maintenance.map((mn) =>
          mn.id === item.entityId
            ? { ...mn, status: "concluida" as const, data: resolveData.data, custo }
            : mn,
        );
        await saveMaintenance(next);
      }
      await registerFollowup(item, "manual", `Tarefa realizada: ${resolveData.observacao || "—"}`);
      toast.success("Tarefa registrada");
      setResolveItem(null);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao registrar tarefa");
    }
  };

  const oleoPreview = useMemo(() => {
    if (!resolveItem || resolveItem.module !== "oleo" || !resolveItem.motoId) return null;
    if (!isDataCacheInitialized()) return null;
    const moto = getDataCache().motos.find((m) => m.id === resolveItem.motoId);
    if (!moto) return null;
    const km = parseInt(resolveData.km, 10) || 0;
    const cfg = brandConfigFor(moto.modelo, loadBrandConfig());
    const proxOleo = km > 0 ? km + cfg.oilKm : null;
    const proxFiltro = km > 0 && cfg.filterKm ? km + cfg.filterKm : null;
    return { km, proxOleo, proxFiltro };
  }, [resolveItem, resolveData.km]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lista de tarefas</h1>
          <p className="text-sm text-muted-foreground">
            Pendências organizadas por tipo de tarefa, com sinalização automática da etapa da régua.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {(["pagamento","multa","outras_receitas","oleo","vistoria","manutencao"] as CollectionModule[]).map((m) => {
            const Icon = MODULE_ICONS[m];
            const tone = MODULE_TONES[m];
            const count = visiblePendings.filter((p) => p.module === m).length
              + visibleEscalated.filter((p) => p.module === m).length;
            return (
              <div key={m} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border ${tone.bgSoft}`}>
                <Icon className={`h-3.5 w-3.5 ${tone.text}`} />
                <span className="font-semibold">{count}</span>
                <span className="text-muted-foreground">{MODULE_LABELS[m]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Tabs defaultValue="cobrancas">
        <TabsList>
          <TabsTrigger value="cobrancas">
            Tarefas
            <Badge variant="secondary" className="ml-2">{totals.pendentes + totals.escalados}</Badge>
          </TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="cobrancas" className="space-y-6 mt-4">
          {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}

          {/* KPIs financeiros */}
          <FinancialKpis pendings={[...visiblePendings, ...visibleEscalated]} />

          {/* Sub-abas por tipo de tarefa */}
          <Tabs defaultValue="todas">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
              <TabsTrigger value="todas" className="gap-1.5 data-[state=active]:bg-background">
                Todas
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                  {visiblePendings.length + visibleEscalated.length}
                </Badge>
              </TabsTrigger>
              {(["pagamento","multa","outras_receitas","oleo","vistoria","manutencao"] as CollectionModule[]).map((m) => {
                const Icon = MODULE_ICONS[m];
                const tone = MODULE_TONES[m];
                const count = visiblePendings.filter((p) => p.module === m).length
                  + visibleEscalated.filter((p) => p.module === m).length;
                return (
                  <TabsTrigger key={m} value={m} className="gap-1.5 data-[state=active]:bg-background">
                    <Icon className={`h-3.5 w-3.5 ${tone.text}`} />
                    {MODULE_LABELS[m]}
                    <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{count}</Badge>
                  </TabsTrigger>
                );
              })}
              {totals.escalados > 0 && (
                <TabsTrigger value="alerta" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  Alerta máximo
                  <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-destructive text-destructive-foreground border-0">
                    {totals.escalados}
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="todas" className="mt-4 space-y-4">
              {!loading && visiblePendings.length === 0 && visibleEscalated.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground text-center">
                    Nenhuma pendência atualmente. 🎉
                  </CardContent>
                </Card>
              ) : (
                <>
                  {visibleEscalated.length > 0 && (
                    <section className="space-y-2">
                      <Card className="border-destructive/30 bg-destructive/5">
                        <CardContent className="p-3 flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                          <div>
                            <strong>{visibleEscalated.length}</strong> item(s) em alerta máximo — passaram por todas as etapas sem regularização.
                          </div>
                        </CardContent>
                      </Card>
                      <div className="space-y-1.5">
                        {visibleEscalated.map((p) => (
                          <PendingRow key={`esc-${p.module}-${p.entityId}`} item={p} escalated
                            onIgnore={handleIgnore} onResolve={openResolve} onCharge={setChargeItem} />
                        ))}
                      </div>
                    </section>
                  )}
                  {(() => {
                    // Próxima etapa que ainda precisa ser disparada para cada item
                    // e em quantos dias ela "abre" (offset_days - daysLate).
                    const withDueIn = visiblePendings.map((p) => {
                      const rule = rules[p.module];
                      const nextStageDef = rule.stages.find((s) => s.stage === p.sentStage + 1)
                        || rule.stages[rule.stages.length - 1];
                      const dueIn = (nextStageDef?.offset_days ?? 0) - p.daysLate;
                      return { p, dueIn };
                    });
                    const hoje = withDueIn.filter((x) => x.dueIn <= 0);
                    const amanha = withDueIn.filter((x) => x.dueIn === 1);
                    const futuro = withDueIn.filter((x) => x.dueIn > 1);

                    const Section = ({
                      title, count, icon: Icon, tone, items, dim,
                    }: {
                      title: string; count: number;
                      icon: React.ComponentType<{ className?: string }>;
                      tone: { bg: string; border: string; text: string };
                      items: { p: PendingItem; dueIn: number }[];
                      dim?: boolean;
                    }) => (
                      <section className="space-y-2">
                        <div className={`flex items-center justify-between gap-2 rounded-lg border ${tone.border} ${tone.bg} px-3 py-2`}>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${tone.text}`} />
                            <span className={`text-sm font-semibold ${tone.text}`}>{title}</span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{count}</Badge>
                          </div>
                        </div>
                        <div className={`space-y-2 ${dim ? "opacity-90" : ""}`}>
                          {items.map(({ p }) => (
                            <PendingRow key={`${p.module}-${p.entityId}`} item={p}
                              onIgnore={handleIgnore} onResolve={openResolve} onCharge={setChargeItem} />
                          ))}
                        </div>
                      </section>
                    );

                    return (
                      <div className="space-y-5">
                        {hoje.length > 0 && (
                          <Section
                            title="Cobrar hoje"
                            count={hoje.length}
                            icon={CalendarClock}
                            tone={{
                              bg: "bg-warning/10",
                              border: "border-warning/30",
                              text: "text-warning",
                            }}
                            items={hoje}
                          />
                        )}
                        {amanha.length > 0 && (
                          <Section
                            title="Cobrar amanhã"
                            count={amanha.length}
                            icon={Sunrise}
                            tone={{
                              bg: "bg-primary/10",
                              border: "border-primary/30",
                              text: "text-primary",
                            }}
                            items={amanha}
                          />
                        )}
                        {futuro.length > 0 && (
                          <Section
                            title="Aguardando próxima etapa"
                            count={futuro.length}
                            icon={Clock}
                            tone={{
                              bg: "bg-muted/60",
                              border: "border-border",
                              text: "text-muted-foreground",
                            }}
                            items={futuro}
                            dim
                          />
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </TabsContent>

            {(["pagamento","multa","outras_receitas","oleo","vistoria","manutencao"] as CollectionModule[]).map((m) => {
              const items = [
                ...visibleEscalated.filter((p) => p.module === m),
                ...visiblePendings.filter((p) => p.module === m),
              ];
              return (
                <TabsContent key={m} value={m} className="mt-4 space-y-1.5">
                  {items.length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-sm text-muted-foreground text-center">
                        Nenhuma pendência em {MODULE_LABELS[m]}.
                      </CardContent>
                    </Card>
                  ) : (
                    <ModuleSection module={m} items={items}
                      onIgnore={handleIgnore} onResolve={openResolve} onCharge={setChargeItem} />
                  )}
                </TabsContent>
              );
            })}

            <TabsContent value="alerta" className="mt-4 space-y-1.5">
              {visibleEscalated.map((p) => (
                <PendingRow key={`esc-${p.module}-${p.entityId}`} item={p} escalated
                  onIgnore={handleIgnore} onResolve={openResolve} onCharge={setChargeItem} />
              ))}
            </TabsContent>
          </Tabs>

          {/* ── Ignoradas ──────────────────────────────── */}
          {ignoredItems.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Ignoradas</h2>
                <Badge variant="secondary">{totals.ignorados}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setShowIgnored((v) => !v)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {showIgnored ? "Ocultar" : "Mostrar"}
                </Button>
              </div>
              {showIgnored && ignoredItems.map((p) => (
                <Card key={`ign-${p.module}-${p.entityId}`} className="opacity-70">
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={moduleBadgeColor(p.module)}>
                          {MODULE_LABELS[p.module]}
                        </Badge>
                        <span className="font-medium">{p.descricao}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.daysLate > 0 ? `${p.daysLate} dia(s) de atraso` : "No prazo"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleUnignore(p)}>
                      <Eye className="h-4 w-4 mr-1" /> Restaurar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 text-sm flex items-start gap-3">
              <SettingsIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="font-semibold text-foreground">Régua de cobrança por etapa</div>
                <div className="text-muted-foreground">
                  Configure, para cada tipo de tarefa, quantas etapas tem a cobrança, quantos dias após o vencimento cada etapa dispara e qual o texto padrão da mensagem.
                  Estas configurações também valem nas páginas de Troca de Óleo, Vistoria, Multas de trânsito e Manutenção.
                </div>
                <div className="text-xs text-muted-foreground pt-1">
                  Tokens disponíveis: <code>{"{NOME}"}</code>, <code>{"{PLACA}"}</code>, <code>{"{MODELO}"}</code>, <code>{"{VALOR_DIARIO}"}</code> entre outros.
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="pagamento" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
              {(["pagamento","multa","outras_receitas","oleo","vistoria","manutencao"] as CollectionModule[]).map((m) => {
                const Icon = MODULE_ICONS[m];
                const tone = MODULE_TONES[m];
                return (
                  <TabsTrigger key={m} value={m} className="gap-1.5 data-[state=active]:bg-background">
                    <Icon className={`h-4 w-4 ${tone.text}`} />
                    {MODULE_LABELS[m]}
                    <Badge variant="outline" className="ml-1 text-[10px] py-0 h-4">
                      {editing[m]?.stages.length ?? 0}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(["pagamento","multa","outras_receitas","oleo","vistoria","manutencao"] as CollectionModule[]).map((m) => {
              const Icon = MODULE_ICONS[m];
              const tone = MODULE_TONES[m];
              return (
                <TabsContent key={m} value={m} className="mt-4 space-y-3">
                  <div className={`rounded-lg border ${tone.bgSoft} p-4 flex items-center gap-3`}>
                    <div className={`h-10 w-10 rounded-md grid place-items-center ${tone.stripe} text-primary-foreground`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className={`text-base font-semibold ${tone.text}`}>{MODULE_LABELS[m]}</div>
                      <div className="text-xs text-muted-foreground">
                        {editing[m]?.enabled ? "Régua ativa" : "Régua desativada"} • {editing[m]?.stages.length ?? 0} etapa(s)
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`enabled-tab-${m}`} className="text-xs">Ativa</Label>
                      <Switch
                        id={`enabled-tab-${m}`}
                        checked={editing[m]?.enabled ?? true}
                        onCheckedChange={(v) =>
                          setEditing((prev) => ({ ...prev, [m]: { ...prev[m], enabled: v } }))
                        }
                      />
                    </div>
                  </div>
                  <CollectionRuleEditor
                    hideTitle
                    rule={editing[m]}
                    onChange={(r) => setEditing((prev) => ({ ...prev, [m]: r }))}
                    onSave={async (r) => { await saveRule(r); toast.success(`Régua de ${MODULE_LABELS[m]} salva`); }}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        </TabsContent>
      </Tabs>

      <Dialog open={!!resolveItem} onOpenChange={(o) => !o && setResolveItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Realizar tarefa</DialogTitle>
            <DialogDescription>
              {resolveItem ? `${MODULE_LABELS[resolveItem.module]} • ${resolveItem.descricao}` : ""}
            </DialogDescription>
          </DialogHeader>
          {resolveItem && (
            <div className="space-y-3">
              {(resolveItem.module === "pagamento" || resolveItem.module === "outras_receitas" || resolveItem.module === "manutencao" || resolveItem.module === "oleo" || resolveItem.module === "vistoria") && (
                <div className="space-y-1">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={resolveData.data}
                    onChange={(e) => setResolveData((p) => ({ ...p, data: e.target.value }))}
                  />
                </div>
              )}
              {resolveItem.module === "pagamento" && (
                <>
                  <div className="space-y-1">
                    <Label>Valor recebido</Label>
                    <Input
                      inputMode="decimal"
                      value={resolveData.valor}
                      onChange={(e) => setResolveData((p) => ({ ...p, valor: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Conta (opcional)</Label>
                    <Input
                      value={resolveData.conta}
                      onChange={(e) => setResolveData((p) => ({ ...p, conta: e.target.value }))}
                    />
                  </div>
                </>
              )}
              {resolveItem.module === "oleo" && (
                <>
                  <div className="space-y-1">
                    <Label>KM da troca</Label>
                    <Input
                      inputMode="numeric"
                      value={resolveData.km}
                      onChange={(e) => setResolveData((p) => ({ ...p, km: e.target.value }))}
                    />
                  </div>
                  {oleoPreview && oleoPreview.proxOleo && (
                    <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                      <div>KM atual será atualizado para <strong>{oleoPreview.km.toLocaleString("pt-BR")} km</strong></div>
                      <div>Próxima troca de óleo: <strong>{oleoPreview.proxOleo.toLocaleString("pt-BR")} km</strong></div>
                      {oleoPreview.proxFiltro && (
                        <div>Próxima troca de filtro: <strong>{oleoPreview.proxFiltro.toLocaleString("pt-BR")} km</strong></div>
                      )}
                    </div>
                  )}
                </>
              )}
              {resolveItem.module === "manutencao" && (
                <div className="space-y-1">
                  <Label>Custo</Label>
                  <Input
                    inputMode="decimal"
                    value={resolveData.valor}
                    onChange={(e) => setResolveData((p) => ({ ...p, valor: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Observação (opcional)</Label>
                <Textarea
                  rows={2}
                  value={resolveData.observacao}
                  onChange={(e) => setResolveData((p) => ({ ...p, observacao: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveItem(null)}>Cancelar</Button>
            <Button onClick={handleResolve}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CollectionActionDialog
        item={chargeItem}
        rule={chargeItem ? rules[chargeItem.module] : rules.pagamento}
        followups={followups}
        onClose={() => setChargeItem(null)}
        onRegister={async (it, channel, msg, stage) => {
          await registerFollowup(it, channel, msg, stage);
        }}
        onSaveRule={saveRule}
        onMarkResolved={(it) => openResolve(it)}
      />

      <MessagePopup
        open={messagePopup.open}
        onOpenChange={(o) => setMessagePopup((p) => ({ ...p, open: o }))}
        title={messagePopup.title}
        mensagem={messagePopup.mensagem}
        placa={messagePopup.placa}
        cliente={messagePopup.cliente}
        telefone={messagePopup.telefone}
        highlights={messagePopup.highlights}
        templateKey={messagePopup.templateKey}
        tokens={messagePopup.tokens}
      />
    </div>
  );
}