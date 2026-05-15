import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Copy, Phone, Send, Settings as SettingsIcon, Check,
  Clock, Bike, AlertTriangle, MessageSquare, History,
} from "lucide-react";
import { toast } from "sonner";
import {
  CollectionFollowup,
  CollectionRule,
  MODULE_LABELS,
  PendingItem,
} from "@/lib/collections";
import { CollectionRuleEditor } from "@/components/CollectionRuleEditor";
import { getDataCache, isDataCacheInitialized } from "@/lib/data-cache";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { applyTokens, buildAllTokens } from "@/lib/message-tokens";

interface Props {
  item: PendingItem | null;
  rule: CollectionRule;
  followups: CollectionFollowup[];
  onClose: () => void;
  onRegister: (
    item: PendingItem,
    channel: "whatsapp" | "copy_msg" | "copy_phone" | "manual",
    message: string,
    stageNumber: number,
  ) => Promise<void>;
  onSaveRule: (rule: CollectionRule) => Promise<void>;
  onMarkResolved?: (item: PendingItem) => void;
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  copy_msg: "Mensagem copiada",
  copy_phone: "Telefone copiado",
  manual: "Ação manual",
};

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function CollectionActionDialog({
  item, rule, followups, onClose, onRegister, onSaveRule, onMarkResolved,
}: Props) {
  const open = !!item;
  const cliente = item?.clienteId && isDataCacheInitialized()
    ? getDataCache().clients.find((c) => c.id === item.clienteId) : null;
  const moto = item?.motoId && isDataCacheInitialized()
    ? getDataCache().motos.find((m) => m.id === item.motoId) : null;

  const itemFollowups = useMemo(() => {
    if (!item) return [];
    return followups
      .filter((f) => f.module === item.module && f.entity_id === item.entityId)
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  }, [followups, item]);

  const [selectedStage, setSelectedStage] = useState<number>(item?.nextStage ?? 1);
  const [message, setMessage] = useState<string>("");
  const [editingRule, setEditingRule] = useState<CollectionRule>(rule);
  const [phone, setPhone] = useState<string>(cliente?.telefone || "");

  useEffect(() => {
    if (!item) return;
    setSelectedStage(item.nextStage);
    setEditingRule(rule);
    setPhone(cliente?.telefone || "");
  }, [item, rule, cliente?.telefone]);

  // Recompila a mensagem ao trocar a etapa
  useEffect(() => {
    if (!item) return;
    const stageDef = rule.stages.find((s) => s.stage === selectedStage)
      || rule.stages[rule.stages.length - 1];
    const baseTokens = buildAllTokens({ moto, cliente });
    const valorFmt = item.valor != null
      ? item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "";
    const dueFmt = item.dueDateISO
      ? new Date(item.dueDateISO.length === 10 ? item.dueDateISO + "T00:00:00" : item.dueDateISO)
          .toLocaleDateString("pt-BR")
      : "";
    const extraTokens = {
      "{VALOR_PENDENTE}": valorFmt,
      "{VALOR}": valorFmt,
      "{DIAS_ATRASO}": item.daysLate != null ? String(item.daysLate) : "",
      "{CATEGORIA}": item.categoriaLabel ?? "",
      "{DESCRICAO}": item.descricao ?? "",
      "{DATA_VENCIMENTO}": dueFmt,
      "{DATA_AGENDADA}": dueFmt,
    };
    const tokens = { ...baseTokens, ...extraTokens };
    setMessage(applyTokens(stageDef?.template || "", tokens));
  }, [selectedStage, item, rule, moto, cliente]);

  if (!item) return null;

  const sentByStage = new Map<number, CollectionFollowup>();
  for (const f of itemFollowups) {
    if (!sentByStage.has(f.stage_number)) sentByStage.set(f.stage_number, f);
  }

  const handleCopyMsg = async () => {
    await navigator.clipboard.writeText(message);
    toast.success(`Mensagem da etapa ${selectedStage} copiada`);
  };
  const handleCopyPhone = async () => {
    if (!phone) return toast.error("Sem telefone cadastrado");
    await navigator.clipboard.writeText(phone);
    toast.success("Telefone copiado");
  };
  const handleWhats = async () => {
    const url = buildWhatsAppUrl(phone, message);
    window.open(url, "_blank");
    await onRegister(item, "whatsapp", message, selectedStage);
    toast.success(`Etapa ${selectedStage} registrada`, {
      description: "WhatsApp aberto em nova aba.",
    });
    onClose();
  };
  const handleMarkDone = async () => {
    await onRegister(item, "manual", message, selectedStage);
    toast.success(`Etapa ${selectedStage} marcada como concluída`, {
      description: `Follow-up de ${MODULE_LABELS[item.module].toLowerCase()} registrado no histórico.`,
    });
    onClose();
  };
  const handleMarkResolved = () => {
    if (!item || !onMarkResolved) return;
    onMarkResolved(item);
    toast.success("Tarefa marcada como realizada", {
      description: "Item removido da lista de pendências.",
    });
    onClose();
  };
  const handleSaveRule = async () => {
    await onSaveRule(editingRule);
    toast.success("Régua atualizada");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden flex flex-col max-h-[92vh]">
        {/* HEADER — destinatário em destaque */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-gradient-to-br from-primary/5 to-transparent">
          <DialogTitle className="sr-only">Realizar cobrança</DialogTitle>
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center text-base font-bold">
              {initials(cliente?.nome)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-semibold truncate">{cliente?.nome || "Sem locatário"}</span>
                {item.daysLate > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground border-0 gap-1 text-[11px]">
                    <AlertTriangle className="h-3 w-3" /> {item.daysLate}d em atraso
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                <span>{MODULE_LABELS[item.module]}</span>
                {moto && (
                  <span className="inline-flex items-center gap-1">
                    <Bike className="h-3 w-3" />
                    <span className="font-mono font-semibold text-foreground">{moto.placa}</span>
                    <span>{moto.modelo}</span>
                  </span>
                )}
                <span>•</span>
                <span>{itemFollowups.length} follow-up(s) já enviados</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="enviar" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-3 self-start">
            <TabsTrigger value="enviar" className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> Enviar
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico
              {itemFollowups.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{itemFollowups.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5">
              <SettingsIcon className="h-3.5 w-3.5" /> Régua
            </TabsTrigger>
          </TabsList>

          {/* ── Aba Enviar ─────────────────────────────────────────── */}
          <TabsContent value="enviar" className="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-4 mt-0">
            {/* Timeline horizontal compacta */}
            <div>
              <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                Selecione a etapa do follow-up
              </div>
              <div className="relative">
                <div className="absolute left-4 right-4 top-4 h-0.5 bg-border" />
                <div className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${rule.stages.length}, minmax(0, 1fr))` }}>
                  {rule.stages.map((s) => {
                    const sent = sentByStage.get(s.stage);
                    const isSel = selectedStage === s.stage;
                    return (
                      <button
                        key={s.stage}
                        type="button"
                        onClick={() => setSelectedStage(s.stage)}
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div className={`relative z-10 h-8 w-8 rounded-full grid place-items-center text-xs font-bold transition-all ring-2 ring-background ${
                          sent ? "bg-success text-success-foreground"
                               : isSel ? "bg-primary text-primary-foreground scale-110 shadow-md"
                               : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20"
                        }`}>
                          {sent ? <Check className="h-4 w-4" /> : s.stage}
                        </div>
                        <div className={`text-[11px] font-medium leading-tight text-center ${isSel ? "text-primary" : "text-foreground"}`}>
                          Etapa {s.stage}
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-tight">
                          {sent ? fmtDateTime(sent.sent_at).split(",")[0] : `+${s.offset_days}d`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Compositor de mensagem — bloco principal */}
            <div className="rounded-xl border-2 border-primary/20 bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  Mensagem da etapa {selectedStage}
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCopyMsg}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                </Button>
              </div>
              <Textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="border-0 rounded-none focus-visible:ring-0 resize-none text-sm"
              />
            </div>

            {/* Telefone com ação inline */}
            <div>
              <Label className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                Telefone do destinatário
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleCopyPhone} disabled={!phone}>
                  <Phone className="h-4 w-4 mr-1.5" /> Copiar
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Aba Histórico ──────────────────────────────────────── */}
          <TabsContent value="historico" className="flex-1 overflow-y-auto px-6 pt-4 pb-2 mt-0">
            {itemFollowups.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-10">
                Nenhum follow-up registrado ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {itemFollowups.map((f) => (
                  <div key={f.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">Etapa {f.stage_number}</Badge>
                        <span className="text-xs font-medium">{CHANNEL_LABEL[f.channel] || f.channel}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />{fmtDateTime(f.sent_at)}
                      </span>
                    </div>
                    {f.message_snapshot && (
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                        {f.message_snapshot}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Aba Régua ──────────────────────────────────────────── */}
          <TabsContent value="config" className="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-3 mt-0">
            <p className="text-xs text-muted-foreground">
              Configure aqui as etapas, prazos e mensagens. Estas alterações também valem na página de {MODULE_LABELS[item.module]}.
            </p>
            <CollectionRuleEditor
              hideTitle
              rule={editingRule}
              onChange={setEditingRule}
              onSave={handleSaveRule}
            />
          </TabsContent>
        </Tabs>

        {/* FOOTER sticky — ação primária dominante */}
        <div className="border-t bg-card px-6 py-3 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <div className="flex items-center gap-2">
            {onMarkResolved && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleMarkResolved}
                className="border-success/40 text-success hover:bg-success/10 hover:text-success"
              >
                <Check className="h-4 w-4 mr-2" /> Marcar como realizada
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={handleWhats}
              disabled={!phone}
            >
              <Send className="h-4 w-4 mr-2" /> WhatsApp
            </Button>
            <Button
              size="lg"
              onClick={handleMarkDone}
              className="bg-success text-success-foreground hover:bg-success/90 shadow-md font-semibold"
            >
              <Check className="h-4 w-4 mr-2" /> Marcar etapa {selectedStage} como feita
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}