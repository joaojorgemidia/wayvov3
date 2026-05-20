import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Settings, Plus, ChevronDown, ChevronRight, Search, Upload,
  Download, Trash2, FileVideo, ImageIcon, Loader2, Eye, Send, Copy, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { getActiveCompanyId } from "@/lib/companies";
import { Motorcycle } from "@/lib/types";
import { formatDate } from "@/lib/alerts";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { applyTokens, buildAllTokens } from "@/lib/message-tokens";
import { DEFAULT_STAGES } from "@/lib/collections";
import { useCollections } from "@/hooks/useCollections";
import { CollectionRuleEditor } from "@/components/CollectionRuleEditor";

function VistoriaRuleSection() {
  const { rules, saveRule } = useCollections();
  const [rule, setRule] = useState(rules.vistoria);
  useEffect(() => { setRule(rules.vistoria); }, [rules.vistoria]);
  return (
    <div className="pt-4 border-t space-y-2">
      <div>
        <Label className="text-base font-semibold">Régua de cobrança da Vistoria</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Etapas e mensagens enviadas quando a vistoria está vencida. Estas configurações também aparecem em Lista de tarefas › Configurações.
        </p>
      </div>
      <CollectionRuleEditor
        hideTitle
        rule={rule}
        onChange={setRule}
        onSave={async (r) => { await saveRule(r); toast.success("Régua de Vistoria salva"); }}
      />
    </div>
  );
}

interface InspectionMedia {
  storagePath?: string;
  fileId?: string;        // legado Google Drive
  name: string;
  type: string; // mime
  size: number;
  webViewLink?: string | null;  // legado
  folder?: string;              // legado
}

interface Inspection {
  id: string;
  moto_id: string;
  data: string;
  km: number | null;
  observacao: string;
  media: InspectionMedia[];
  created_at: string;
}

interface InspectionSettings {
  interval_days: number;
  warning_days: number;
}

const DEFAULT_SETTINGS: InspectionSettings = { interval_days: 30, warning_days: 7 };
const MAX_PHOTOS = 10;
const MAX_VIDEOS = 2;
const MAX_FILE_MB = 50;

const REQUEST_TEMPLATE_KEY = "wayvo:vistoria:request-template";
const DEFAULT_REQUEST_TEMPLATE = `Oi {NOME}! Solicitação de vistoria da Loca2Rodas para a moto {PLACA} / {MODELO}.

Instruções para gravar o vídeo:
• Filme em um lugar com bastante iluminação
• Moto ligada
• Fale/escreva em um papel e mostre o dia que está sendo realizada
• Mostre o KM total
• Mostre o estado dos pneus
• Mostre as carenagens
• Faça um 360º completo ao redor mostrando todos os detalhes
• Vídeo com no mínimo 1 minuto e 30 segundos

Aguardo o envio. Obrigado!`;

function loadRequestTemplate(): string {
  try {
    const raw = localStorage.getItem(REQUEST_TEMPLATE_KEY);
    return raw && raw.trim() ? raw : DEFAULT_REQUEST_TEMPLATE;
  } catch {
    return DEFAULT_REQUEST_TEMPLATE;
  }
}

type Situation = "em_dia" | "atencao" | "vencida" | "sem_dados";

function daysBetween(iso: string, today = new Date()): number {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return Math.floor((today.getTime() - d.getTime()) / 86400000);
}

function computeSituation(
  lastDate: string | null,
  settings: InspectionSettings,
  activeRentalStart?: string | null,
): { situation: Situation; daysSince: number | null; daysLeft: number | null } {
  if (!lastDate) {
    // Sem registro: se está em locação ativa e o tempo desde o início ultrapassa o prazo,
    // considerar vencida (a moto rodou sem nenhuma vistoria registrada além do permitido).
    if (activeRentalStart) {
      const d = daysBetween(activeRentalStart);
      if (d > settings.interval_days) {
        return { situation: "vencida", daysSince: d, daysLeft: settings.interval_days - d };
      }
    }
    return { situation: "sem_dados", daysSince: null, daysLeft: null };
  }
  const d = daysBetween(lastDate);
  const left = settings.interval_days - d;
  if (d > settings.interval_days) return { situation: "vencida", daysSince: d, daysLeft: left };
  if (left <= settings.warning_days) return { situation: "atencao", daysSince: d, daysLeft: left };
  return { situation: "em_dia", daysSince: d, daysLeft: left };
}

const SITUATION_LABEL: Record<Situation, string> = {
  em_dia: "Em dia",
  atencao: "Atenção",
  vencida: "Vencida",
  sem_dados: "Sem vistoria",
};

const SITUATION_TONE: Record<Situation, string> = {
  em_dia: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  atencao: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  vencida: "bg-destructive/15 text-destructive border-destructive/30",
  sem_dados: "bg-muted text-muted-foreground border-border",
};

export default function VistoriaPage() {
  const cache = useDataCacheSnapshot();
  const motos = useMemo(
    () => cache.motos.filter((m) => m.status !== "vendida" && m.status !== "inativa"),
    [cache.motos],
  );

  // Mapa: motoId -> nome do locatário ativo (para criar a subpasta do Drive)
  const activeRenterByMoto = useMemo(() => {
    const map = new Map<string, string>();
    cache.rentals
      .filter((r) => r.status === "ativa")
      .forEach((r) => {
        const cli = cache.clients.find((c) => c.id === r.clienteId);
        if (cli?.nome) map.set(r.motoId, cli.nome);
      });
    return map;
  }, [cache.rentals, cache.clients]);

  // Mapa: motoId -> data_inicio da locação ativa (para detectar atraso quando não há vistoria)
  const activeRentalStartByMoto = useMemo(() => {
    const map = new Map<string, string>();
    cache.rentals
      .filter((r) => r.status === "ativa")
      .forEach((r) => {
        if (r.dataInicio) map.set(r.motoId, r.dataInicio);
      });
    return map;
  }, [cache.rentals]);

  // Mapa: motoId -> cliente ativo completo (para enviar mensagens de WhatsApp)
  const activeClientByMoto = useMemo(() => {
    const map = new Map<string, typeof cache.clients[number]>();
    cache.rentals
      .filter((r) => r.status === "ativa")
      .forEach((r) => {
        const cli = cache.clients.find((c) => c.id === r.clienteId);
        if (cli) map.set(r.motoId, cli);
      });
    return map;
  }, [cache.rentals, cache.clients]);

  // Diálogo de envio de solicitação de vistoria
  const [requestDialog, setRequestDialog] = useState<{
    moto: Motorcycle;
    cliente: typeof cache.clients[number] | null;
    message: string;
  } | null>(null);

  function openRequestDialog(moto: Motorcycle) {
    const cliente = activeClientByMoto.get(moto.id) || null;
    if (!cliente) {
      toast.error("Esta moto não tem locatário ativo");
      return;
    }
    const template = loadRequestTemplate();
    const tokens = buildAllTokens({ moto, cliente });
    const message = applyTokens(template, tokens);
    setRequestDialog({ moto, cliente, message });
  }

  function buildMessageForMoto(moto: Motorcycle): string {
    const cliente = activeClientByMoto.get(moto.id) || null;
    const template = loadRequestTemplate();
    const tokens = buildAllTokens({ moto, cliente: cliente ?? undefined });
    return applyTokens(template, tokens);
  }

  async function copyMessageForMoto(moto: Motorcycle) {
    const cliente = activeClientByMoto.get(moto.id) || null;
    if (!cliente) {
      toast.error("Esta moto não tem locatário ativo");
      return;
    }
    try {
      await navigator.clipboard.writeText(buildMessageForMoto(moto));
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function copyPhoneForMoto(moto: Motorcycle) {
    const cliente = activeClientByMoto.get(moto.id) || null;
    if (!cliente?.telefone) {
      toast.error("Locatário sem telefone");
      return;
    }
    try {
      await navigator.clipboard.writeText(cliente.telefone);
      toast.success("Telefone copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [settings, setSettings] = useState<InspectionSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [registerMoto, setRegisterMoto] = useState<Motorcycle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<{
    items: InspectionMedia[];
    inspectionId: string;
    index: number;
    url: string | null;
    loading: boolean;
  } | null>(null);

  const companyId = getActiveCompanyId();

  async function loadAll() {
    setLoading(true);
    const [insRes, cfgRes] = await Promise.all([
      supabase
        .from("inspections")
        .select("id, moto_id, data, km, observacao, media, created_at")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .order("data", { ascending: false }),
      supabase
        .from("inspection_settings")
        .select("interval_days, warning_days")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);
    if (insRes.error) toast.error("Erro ao carregar vistorias: " + insRes.error.message);
    else {
      setInspections(
        (insRes.data || []).map((r: any) => ({
          id: r.id,
          moto_id: r.moto_id,
          data: r.data,
          km: r.km,
          observacao: r.observacao || "",
          media: Array.isArray(r.media) ? r.media : [],
          created_at: r.created_at,
        })),
      );
    }
    if (cfgRes.data) setSettings({ interval_days: cfgRes.data.interval_days, warning_days: cfgRes.data.warning_days });
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const inspectionsByMoto = useMemo(() => {
    const map = new Map<string, Inspection[]>();
    inspections.forEach((i) => {
      const list = map.get(i.moto_id) || [];
      list.push(i);
      map.set(i.moto_id, list);
    });
    map.forEach((list) => list.sort((a, b) => b.data.localeCompare(a.data)));
    return map;
  }, [inspections]);

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return motos
      .filter((m) => {
        if (!q) return true;
        if (m.placa.toUpperCase().includes(q)) return true;
        if (m.modelo.toUpperCase().includes(q)) return true;
        const nome = activeClientByMoto.get(m.id)?.nome?.toUpperCase() ?? "";
        return nome.includes(q);
      })
      .map((m) => {
        const list = inspectionsByMoto.get(m.id) || [];
        const last = list[0] || null;
        const status = computeSituation(
          last?.data ?? null,
          settings,
          activeRentalStartByMoto.get(m.id) ?? null,
        );
        return { moto: m, last, status, history: list };
      })
      .sort((a, b) => {
        const order: Record<Situation, number> = { vencida: 0, atencao: 1, sem_dados: 2, em_dia: 3 };
        const diff = order[a.status.situation] - order[b.status.situation];
        if (diff !== 0) return diff;
        return a.moto.placa.localeCompare(b.moto.placa);
      });
  }, [motos, inspectionsByMoto, settings, search, activeRentalStartByMoto, activeClientByMoto]);

  const counts = useMemo(() => {
    const acc = { vencida: 0, atencao: 0, em_dia: 0, sem_dados: 0 };
    rows.forEach((r) => acc[r.status.situation]++);
    return acc;
  }, [rows]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteInspection(insp: Inspection) {
    if (!confirm("Excluir esta vistoria e seus arquivos?")) return;
    // Os arquivos no Google Drive não são removidos automaticamente — soft delete na vistoria.
    const { error } = await supabase
      .from("inspections")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", insp.id);
    if (error) {
      toast.error("Falha ao excluir: " + error.message);
      return;
    }
    toast.success("Vistoria excluída");
    await loadAll();
  }

  function buildMediaUrl(media: InspectionMedia, inspectionId: string, download = false): string {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const base = `https://${projectId}.supabase.co/functions/v1/get-vistoria-media`;
    const identifier = media.storagePath
      ? `storagePath=${encodeURIComponent(media.storagePath)}`
      : `fileId=${encodeURIComponent(media.fileId ?? "")}`;
    return `${base}?${identifier}&inspectionId=${encodeURIComponent(inspectionId)}${download ? "&download=1" : ""}`;
  }

  async function downloadMedia(media: InspectionMedia, inspectionId: string) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { toast.error("Sessão expirada"); return; }
      const res = await fetch(buildMediaUrl(media, inspectionId, true), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { toast.error("Falha ao baixar arquivo"); return; }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = media.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      toast.error("Falha ao baixar: " + (e instanceof Error ? e.message : "erro"));
    }
  }

  async function fetchMediaBlobUrl(media: InspectionMedia, inspectionId: string): Promise<string | null> {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { toast.error("Sessão expirada"); return null; }
    const res = await fetch(buildMediaUrl(media, inspectionId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { toast.error("Falha ao carregar arquivo"); return null; }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  async function openPreview(items: InspectionMedia[], inspectionId: string, index: number) {
    setPreview({ items, inspectionId, index, url: null, loading: true });
    const url = await fetchMediaBlobUrl(items[index], inspectionId);
    setPreview((prev) =>
      prev && prev.inspectionId === inspectionId && prev.index === index
        ? { ...prev, url, loading: false }
        : prev,
    );
  }

  async function navigatePreview(delta: number) {
    if (!preview) return;
    const next = preview.index + delta;
    if (next < 0 || next >= preview.items.length) return;
    if (preview.url) URL.revokeObjectURL(preview.url);
    setPreview({ ...preview, index: next, url: null, loading: true });
    const url = await fetchMediaBlobUrl(preview.items[next], preview.inspectionId);
    setPreview((prev) =>
      prev && prev.index === next ? { ...prev, url, loading: false } : prev,
    );
  }

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Vistoria</h2>
          <p className="text-sm text-muted-foreground">
            Cada moto ativa deve ser vistoriada a cada {settings.interval_days} dias.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 mr-2" /> Configurações
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Vencidas" value={counts.vencida} tone="danger" />
        <KpiCard label="Atenção" value={counts.atencao} tone="warning" />
        <KpiCard label="Em dia" value={counts.em_dia} tone="success" />
        <KpiCard label="Sem registro" value={counts.sem_dados} tone="muted" />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa, modelo ou locatário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{selected.size}</span> {selected.size === 1 ? "item selecionado" : "itens selecionados"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar seleção
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma moto encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 w-8">
                      <Checkbox
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.moto.id))}
                        onCheckedChange={(checked) => {
                          if (checked) setSelected(new Set(rows.map((r) => r.moto.id)));
                          else setSelected(new Set());
                        }}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 font-semibold">Placa</th>
                    <th className="px-3 py-2 font-semibold">Modelo</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Última vistoria</th>
                    <th className="px-3 py-2 font-semibold">Próxima em</th>
                    <th className="px-3 py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ moto, last, status, history }) => {
                    const isOpen = expanded.has(moto.id);
                    return (
                      <Fragment key={moto.id}>
                        <tr className={cn("border-b hover:bg-muted/30 transition-colors", selected.has(moto.id) && "bg-primary/5")}>
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={selected.has(moto.id)}
                              onCheckedChange={() => toggleSelected(moto.id)}
                              aria-label={`Selecionar ${moto.placa}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => toggle(moto.id)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Expandir"
                            >
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-mono font-bold text-foreground">{moto.placa}</div>
                            {activeClientByMoto.get(moto.id)?.nome && (
                              <div className="text-xs text-primary uppercase tracking-wide">
                                {activeClientByMoto.get(moto.id)!.nome}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{moto.modelo || "—"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={cn("font-medium", SITUATION_TONE[status.situation])}>
                              {SITUATION_LABEL[status.situation]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {last ? (
                              <span className="text-foreground">
                                {formatDate(last.data)}{" "}
                                <span className="text-muted-foreground">
                                  ({status.daysSince} {status.daysSince === 1 ? "dia" : "dias"})
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {status.daysLeft == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : status.daysLeft < 0 ? (
                              <span className="text-destructive font-semibold">
                                Atrasada {Math.abs(status.daysLeft)}d
                              </span>
                            ) : (
                              <span className="text-foreground">{status.daysLeft}d</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyMessageForMoto(moto)}
                                disabled={!activeClientByMoto.get(moto.id)}
                                title="Copiar mensagem de solicitação"
                              >
                                <Copy className="h-3.5 w-3.5 mr-1" /> Mensagem
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyPhoneForMoto(moto)}
                                disabled={!activeClientByMoto.get(moto.id)?.telefone}
                                title="Copiar telefone do locatário"
                              >
                                <Phone className="h-3.5 w-3.5 mr-1" /> Telefone
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openRequestDialog(moto)}
                                disabled={!activeClientByMoto.get(moto.id)}
                                title={
                                  activeClientByMoto.get(moto.id)
                                    ? "Enviar solicitação de vistoria via WhatsApp"
                                    : "Sem locatário ativo"
                                }
                              >
                                <Send className="h-3.5 w-3.5 mr-1" /> Solicitar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRegisterMoto(moto)}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Nova
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-muted/20">
                            <td></td>
                            <td></td>
                            <td colSpan={6} className="px-3 py-3">
                              {history.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">Nenhuma vistoria registrada.</p>
                              ) : (
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Histórico
                                  </h4>
                                  <div className="space-y-2">
                                    {history.map((insp) => (
                                      <div
                                        key={insp.id}
                                        className="rounded-md border bg-card p-3 flex flex-wrap items-start gap-3"
                                      >
                                        <div className="flex-1 min-w-[200px]">
                                          <div className="flex items-center gap-3 text-sm">
                                            <span className="font-semibold">{formatDate(insp.data)}</span>
                                            {insp.km != null && (
                                              <span className="text-muted-foreground font-mono">
                                                {insp.km.toLocaleString("pt-BR")} km
                                              </span>
                                            )}
                                          </div>
                                          {insp.observacao && (
                                            <p className="text-sm text-muted-foreground mt-1">{insp.observacao}</p>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {insp.media.map((m, idx) => (
                                            <div key={m.storagePath ?? m.fileId ?? idx} className="inline-flex rounded-md border overflow-hidden">
                                              <button
                                                type="button"
                                                onClick={() => openPreview(insp.media, insp.id, insp.media.indexOf(m))}
                                                className="h-7 px-2 inline-flex items-center gap-1 text-xs hover:bg-muted transition-colors"
                                                title={`Visualizar ${m.name}`}
                                              >
                                                {m.type.startsWith("video") ? (
                                                  <FileVideo className="h-3 w-3" />
                                                ) : (
                                                  <ImageIcon className="h-3 w-3" />
                                                )}
                                                <Eye className="h-3 w-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => downloadMedia(m, insp.id)}
                                                className="h-7 px-2 inline-flex items-center text-xs border-l hover:bg-muted transition-colors"
                                                title={`Baixar ${m.name}`}
                                              >
                                                <Download className="h-3 w-3" />
                                              </button>
                                            </div>
                                          ))}
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteInspection(insp)}
                                            className="h-7 text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {registerMoto && (
        <RegisterDialog
          moto={registerMoto}
          companyId={companyId}
          locatarioNome={activeRenterByMoto.get(registerMoto.id) ?? ""}
          onClose={() => setRegisterMoto(null)}
          onSaved={async () => {
            setRegisterMoto(null);
            await loadAll();
          }}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        companyId={companyId}
        settings={settings}
        onSaved={(s) => setSettings(s)}
      />

      {requestDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) setRequestDialog(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Solicitar vistoria</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border">
                  Vistoria
                </Badge>
                <span className="font-mono font-bold">{requestDialog.moto.placa}</span>
                <span className="text-sm text-muted-foreground">
                  {requestDialog.moto.modelo}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {requestDialog.cliente?.nome || "Sem locatário vinculado"}
                {requestDialog.cliente?.telefone ? ` • ${requestDialog.cliente.telefone}` : ""}
              </div>
              <Textarea
                rows={6}
                value={requestDialog.message}
                onChange={(e) =>
                  setRequestDialog((prev) => (prev ? { ...prev, message: e.target.value } : prev))
                }
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Use <code className="font-mono">{"{NOME}"}</code>, <code className="font-mono">{"{PLACA}"}</code> e <code className="font-mono">{"{MODELO}"}</code> para personalizar dinamicamente.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(requestDialog.message);
                    toast.success("Mensagem copiada");
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" /> Copiar mensagem
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!requestDialog.cliente?.telefone}
                  onClick={async () => {
                    if (!requestDialog.cliente?.telefone) return;
                    await navigator.clipboard.writeText(requestDialog.cliente.telefone);
                    toast.success("Telefone copiado");
                  }}
                >
                  <Phone className="h-4 w-4 mr-1" /> Copiar telefone
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      localStorage.setItem(REQUEST_TEMPLATE_KEY, requestDialog.message);
                      toast.success("Modelo padrão atualizado");
                    } catch {
                      toast.error("Não foi possível salvar o modelo");
                    }
                  }}
                >
                  Salvar como padrão
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    try { localStorage.removeItem(REQUEST_TEMPLATE_KEY); } catch {}
                    const tokens = buildAllTokens({
                      moto: requestDialog.moto,
                      cliente: requestDialog.cliente ?? undefined,
                    });
                    const message = applyTokens(DEFAULT_REQUEST_TEMPLATE, tokens);
                    setRequestDialog((prev) => (prev ? { ...prev, message } : prev));
                    toast.success("Modelo restaurado ao padrão original");
                  }}
                >
                  Restaurar padrão
                </Button>
                <Button
                  size="sm"
                  disabled={!requestDialog.cliente?.telefone}
                  onClick={() => {
                    if (!requestDialog.cliente?.telefone) return;
                    window.open(
                      buildWhatsAppUrl(requestDialog.cliente.telefone, requestDialog.message),
                      "_blank",
                    );
                    toast.success("WhatsApp aberto");
                    setRequestDialog(null);
                  }}
                >
                  <Send className="h-4 w-4 mr-1" /> Enviar WhatsApp
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {preview && (
        <Dialog open onOpenChange={(o) => { if (!o) closePreview(); }}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background">
            <div className="relative bg-black flex items-center justify-center min-h-[60vh] max-h-[80vh]">
              {preview.loading || !preview.url ? (
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              ) : preview.items[preview.index].type.startsWith("video") ? (
                <video src={preview.url} controls autoPlay className="max-h-[80vh] max-w-full" />
              ) : (
                <img src={preview.url} alt={preview.items[preview.index].name} className="max-h-[80vh] max-w-full object-contain" />
              )}
              {preview.items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => navigatePreview(-1)}
                    disabled={preview.index === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 hover:bg-background disabled:opacity-30 inline-flex items-center justify-center"
                    aria-label="Anterior"
                  >
                    <ChevronRight className="h-5 w-5 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigatePreview(1)}
                    disabled={preview.index === preview.items.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 hover:bg-background disabled:opacity-30 inline-flex items-center justify-center"
                    aria-label="Próximo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t">
              <div className="text-sm min-w-0">
                <p className="font-medium truncate">{preview.items[preview.index].name}</p>
                <p className="text-xs text-muted-foreground">
                  {preview.index + 1} de {preview.items.length}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadMedia(preview.items[preview.index], preview.inspectionId)}
              >
                <Download className="h-4 w-4 mr-2" /> Baixar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "success" | "muted" }) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warning"
      ? "border-amber-500/30 bg-amber-500/5"
      : tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-border bg-muted/30";
  const valueClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-foreground";
  return (
    <Card className={cn("border", toneClass)}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold mt-1", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function RegisterDialog({
  moto,
  companyId,
  locatarioNome,
  onClose,
  onSaved,
}: {
  moto: Motorcycle;
  companyId: string;
  locatarioNome?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState<string>(moto.kmAtual ? String(moto.kmAtual) : "");
  const [obs, setObs] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const photos = files.filter((f) => f.type.startsWith("image"));
    const videos = files.filter((f) => f.type.startsWith("video"));
    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} excede ${MAX_FILE_MB}MB`);
        continue;
      }
      const isVideo = f.type.startsWith("video");
      const isImage = f.type.startsWith("image");
      if (!isVideo && !isImage) {
        toast.error(`${f.name}: tipo não suportado`);
        continue;
      }
      if (isVideo && videos.length + valid.filter((v) => v.type.startsWith("video")).length >= MAX_VIDEOS) {
        toast.error(`Máximo ${MAX_VIDEOS} vídeos`);
        continue;
      }
      if (isImage && photos.length + valid.filter((v) => v.type.startsWith("image")).length >= MAX_PHOTOS) {
        toast.error(`Máximo ${MAX_PHOTOS} fotos`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid]);
  }

  async function handleSave() {
    if (!data) {
      toast.error("Informe a data");
      return;
    }
    setSaving(true);
    try {
      const inspectionId = crypto.randomUUID();
      const uploaded: InspectionMedia[] = [];
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada");
        return;
      }
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const uploadUrl = `https://${projectId}.supabase.co/functions/v1/upload-vistoria-drive`;
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("placa", moto.placa);
        fd.append("data", data);
        fd.append("company_id", companyId);
        if (locatarioNome) fd.append("locatario", locatarioNome);
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "erro" }));
          toast.error(`Falha ao enviar ${f.name}: ${err.error ?? res.status}`);
          continue;
        }
        const out = await res.json();
        uploaded.push({
          storagePath: out.storagePath,
          name: f.name,
          type: f.type,
          size: f.size,
        });
      }
      const kmNum = km ? parseInt(km.replace(/\D/g, ""), 10) : null;
      const { error } = await supabase.from("inspections").insert({
        id: inspectionId,
        company_id: companyId,
        moto_id: moto.id,
        data,
        km: kmNum,
        observacao: obs,
        media: uploaded as any,
      });
      if (error) {
        toast.error("Falha ao salvar: " + error.message);
        return;
      }
      // Atualiza km_atual da moto se o km da vistoria for maior que o da última troca de óleo
      if (kmNum != null) {
        const lastOilKm = moto.kmTrocaOleo ?? 0;
        if (kmNum > lastOilKm) {
          const { error: upErr } = await supabase
            .from("motorcycles")
            .update({ km_atual: kmNum })
            .eq("id", moto.id);
          if (upErr) console.warn("Falha ao atualizar km_atual:", upErr.message);
        }
      }
      toast.success("Vistoria registrada");
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Nova vistoria · <span className="font-mono">{moto.placa}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>KM</Label>
              <Input
                inputMode="numeric"
                placeholder="Ex: 12500"
                value={km}
                onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Pontos verificados, problemas detectados..."
            />
          </div>
          <div>
            <Label>Fotos / Vídeos</Label>
            <div className="mt-1.5 space-y-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Adicionar arquivos
              </Button>
              <p className="text-xs text-muted-foreground">
                Até {MAX_PHOTOS} fotos e {MAX_VIDEOS} vídeos · máx {MAX_FILE_MB}MB cada
              </p>
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between text-sm border rounded px-2 py-1 bg-muted/30"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {f.type.startsWith("video") ? (
                          <FileVideo className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(f.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                      </span>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar vistoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  companyId,
  settings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  settings: InspectionSettings;
  onSaved: (s: InspectionSettings) => void;
}) {
  const [intervalDays, setIntervalDays] = useState(String(settings.interval_days));
  const [warning, setWarning] = useState(String(settings.warning_days));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIntervalDays(String(settings.interval_days));
    setWarning(String(settings.warning_days));
  }, [settings, open]);

  async function save() {
    const i = parseInt(intervalDays, 10);
    const w = parseInt(warning, 10);
    if (!i || i < 1) return toast.error("Intervalo inválido");
    if (isNaN(w) || w < 0 || w >= i) return toast.error("Aviso prévio deve ser menor que o intervalo");
    setSaving(true);
    const { error } = await supabase
      .from("inspection_settings")
      .upsert(
        { company_id: companyId, interval_days: i, warning_days: w },
        { onConflict: "company_id" },
      );
    setSaving(false);
    if (error) {
      toast.error("Falha: " + error.message);
      return;
    }
    toast.success("Configuração salva");
    onSaved({ interval_days: i, warning_days: w });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações de Vistoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Intervalo entre vistorias (dias)</Label>
            <Input
              inputMode="numeric"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, ""))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              A cada quantos dias cada moto ativa precisa ser vistoriada. Padrão: 30.
            </p>
          </div>
          <div>
            <Label>Aviso prévio (dias)</Label>
            <Input
              inputMode="numeric"
              value={warning}
              onChange={(e) => setWarning(e.target.value.replace(/\D/g, ""))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Quantos dias antes do vencimento a moto entra em "Atenção". Padrão: 7.
            </p>
          </div>
          <VistoriaRuleSection />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
