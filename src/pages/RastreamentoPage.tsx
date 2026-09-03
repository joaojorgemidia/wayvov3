import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import {
  DRIVERS, loadTrackerProvider, saveTrackerProvider, clearTrackerProvider,
  loadSharedTrackerConfig, saveSharedTrackerConfig, clearSharedTrackerConfig,
  loadSharedDeviceNames, saveSharedDeviceName,
  type TrackerProvider, type TrackerDriver, type AnyTrackerToken, type AnyTrackerConfig,
  type DeviceInfo, type DeviceTrack, type PlaybackPoint, type AlarmRecord,
} from "@/lib/tracker";
import * as gt06 from "@/lib/gt06";
import type { KmSyncConfig } from "@/lib/brasilsat";
import { loadMotos, loadRentals, loadClients, saveMotos } from "@/lib/store";
import { isPrivacyEnabled, getRealDataCache, useDataCacheSnapshot } from "@/lib/data-cache";
import { useCompany } from "@/contexts/CompanyContext";
import { maskPlaca, maskName, maskImei } from "@/lib/privacy-mask";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  MapPin, Wifi, WifiOff, Settings, RefreshCw, Gauge, Clock,
  AlertTriangle, History, Bell, Navigation, Search, X,
  Zap, Battery, Thermometer, Fuel, Pencil, Lock, Unlock, Milestone, Sliders,
  MessageCircle, ShoppingCart, ExternalLink, LogOut, Satellite, Tag, Plus, Link2, Unlink,
} from "lucide-react";

// Um aparelho é tratado como "TAG" (etiqueta) quando é um GT06 avulso OU quando
// o nome dele no provedor de nuvem contém "TAG" (ex.: "SDA5052 - TAG" na
// Velotrack) — nesses casos é hardware de etiqueta, não um rastreador completo.
export const deviceNameIsTag = (name?: string | null) => /\btag\b/i.test(name ?? "");

// ─── Ícones Leaflet ───────────────────────────────────────────────────────────
// Rastreador (nuvem): pino redondo com ícone de moto — como já era.
// TAG: pino quadrado com borda tracejada + ícone de etiqueta — pra dar
// pra diferenciar um do outro só de bater o olho no mapa, sem depender da cor
// (que já é usada pelo status/movimento e não pelo tipo de dispositivo).
function makeIcon(color: string, small = false, isTag = false) {
  const s = small ? 30 : 38;
  const bikeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(s * 0.6)}" height="${Math.round(s * 0.6)}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
  const tagSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(s * 0.55)}" height="${Math.round(s * 0.55)}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1" fill="white" stroke="none"/></svg>`;
  const glyph = isTag ? tagSvg : bikeSvg;
  const shapeStyle = isTag
    ? "border-radius:8px;border:2.5px dashed white;"
    : "border-radius:50%;border:2.5px solid white;";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${s}px;height:${s + 6}px;">
      <div style="position:absolute;left:0;top:0;width:${s}px;height:${s}px;${shapeStyle}background:${color};box-shadow:0 3px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">${glyph}</div>
      <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${color};filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));"></div>
    </div>`,
    iconSize: [s, s + 6],
    iconAnchor: [s / 2, s + 6],
    popupAnchor: [0, -(s + 4)],
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Legenda do pino no mapa: prefixa o nome com o tipo (cor + palavra), igual ao
// selo já usado na lista/painel — o formato do próprio pino (redondo vs
// quadrado tracejado) é sutil demais pra notar de relance num mapa cheio de
// ruas, então aqui repete a informação de forma explícita e legível.
function tooltipHtml(name: string, isTag: boolean) {
  const label = isTag
    ? `<span style="color:#1d4ed8;font-weight:700;">TAG</span>`
    : `<span style="color:#047857;font-weight:700;">Rastreador</span>`;
  return `${label} · ${escapeHtml(name)}`;
}

function deviceIcon(t: DeviceTrack, isTag = false) {
  const sc = (t.statusCode ?? "").toLowerCase();
  if (sc.includes("offline")) return makeIcon("#6b7280", false, isTag);
  if (t.speed > 0) return makeIcon("#22c55e", false, isTag);
  if (t.acc === 1) return makeIcon("#f59e0b", false, isTag);
  // acc undefined = fonte não sabe informar o motor (TAGs) — cor própria
  // pra não ficar visualmente idêntico ao cinza de "offline".
  if (t.acc == null) return makeIcon("#3b82f6", false, isTag);
  return makeIcon("#6b7280", false, isTag);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR");
}
function fmtSpeed(s: number) { return `${Math.round(s)} km/h`; }
function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h${m}m${s}s` : m > 0 ? `${m}m${s}s` : `${s}s`;
}
// Acima disso, o "há Xh" no canto da lista fica destacado em âmbar — sinal de
// que o rastreador pode estar sem sinal, mesmo que o status ainda diga
// "Parado" (o provedor de nuvem às vezes demora a marcar como Offline).
const STALE_UPDATE_MS = 30 * 60 * 1000;
function timeSince(ts: number): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
function toInputDatetime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function statusLabel(t: DeviceTrack): { label: string; color: string } {
  const sc = (t.statusCode ?? "").toLowerCase();
  if (sc.includes("offline")) return { label: "Offline", color: "#6b7280" };
  if (t.speed > 0) return { label: `Em movimento · ${fmtSpeed(t.speed)}`, color: "#22c55e" };
  if (t.acc === 1) return { label: "Parado · motor ligado", color: "#f59e0b" };
  // acc undefined (TAGs GT06, sem leitura confiável de ignição) — não afirma
  // "motor desligado" quando não se sabe, só "Parado".
  if (t.acc == null) return { label: "Parado", color: "#3b82f6" };
  return { label: "Parado · motor desligado", color: "#6b7280" };
}

// ─── Selo "Rastreador" (nuvem, principal) vs "TAG" (GT06, backup) — deixa
// explícito o tipo de dispositivo tanto na lista quanto no painel de detalhes,
// em vez de precisar inferir pelo ícone/nome. ──────────────────────────────
function DeviceTypeBadge({ isTag }: { isTag: boolean }) {
  return isTag ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 shrink-0">
      <Tag className="h-2.5 w-2.5" /> TAG
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
      <Satellite className="h-2.5 w-2.5" /> Rastreador
    </span>
  );
}

// ─── Mapa Leaflet (puro) ──────────────────────────────────────────────────────
interface LeafletMapProps {
  id: string;
  style?: React.CSSProperties;
  className?: string;
  onReady: (map: L.Map) => void;
}

function LeafletMap({ id, style, className, onReady }: LeafletMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  useEffect(() => {
    if (!divRef.current || initRef.current) return;
    initRef.current = true;
    const map = L.map(divRef.current, { center: [-15.8, -47.9], zoom: 5 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    onReady(map);
    return () => { map.remove(); initRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={divRef} id={id} style={style} className={className} />;
}

// ─── Painel de detalhes ────────────────────────────────────────────────────────
interface DeviceDetailProps {
  track: DeviceTrack;
  device: DeviceInfo;
  displayName: string;
  displayImei: string;
  isTag: boolean;
  relayLoading: boolean;
  // GT06 (avulso) não suporta km/bloqueio remoto — protocolo básico não reporta
  // km rodado, e nem todo aparelho clone tem o relé de corte de energia.
  showKm: boolean;
  showRelay: boolean;
  onClose: () => void;
  onRename: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onUpdateKm: () => void;
  // Só TAGs GT06 têm esse controle — rastreador de nuvem não tem o conceito de
  // "vínculo" no app, ele é inferido pelo nome/placa cadastrados na BrasilSat/Velotrack.
  motoOptions: { id: string; placa: string; modelo: string }[];
  onLinkMoto: (motoId: string | null) => void;
  linkMotoLoading: boolean;
}

function DeviceDetail({
  track, device, displayName, displayImei, isTag, relayLoading, showKm, showRelay,
  onClose, onRename, onBlock, onUnblock, onUpdateKm,
  motoOptions, onLinkMoto, linkMotoLoading,
}: DeviceDetailProps) {
  const { color } = statusLabel(track);
  const isBlocked = track.relay === 0;

  const statusBase = (() => {
    const sc = (track.statusCode ?? "").toLowerCase();
    if (sc.includes("offline")) return "Offline";
    if (track.speed > 0) return "Em movimento";
    if (track.acc === 1) return "Parado";
    return "Parado";
  })();
  const statusStr = track.statusDuration
    ? `${statusBase} (${fmtDuration(track.statusDuration)})`
    : statusBase;

  const motorStr = track.acc === 1
    ? `Ligado${track.accDuration ? ` (${fmtDuration(track.accDuration)})` : ""}`
    : `Desligado${track.accDuration ? ` (${fmtDuration(track.accDuration)})` : ""}`;

  const updateIsStale = Date.now() - track.gpstime > STALE_UPDATE_MS;

  type Row = { label: string; value: React.ReactNode; icon?: React.ReactNode };
  const rows: Row[] = [
    {
      label: "Última atualização",
      value: (
        <span className={updateIsStale ? "text-amber-600 dark:text-amber-500 font-semibold" : undefined}>
          há {timeSince(track.gpstime)} ({fmtTime(track.gpstime)})
        </span>
      ),
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    ...(track.alarm ? [{ label: "Selecionar", value: track.alarm }] : []),
    // acc undefined = fonte não informa motor de forma confiável (TAGs GT06) —
    // some a linha inteira em vez de mostrar "Desligado" como se fosse um dado real.
    ...(track.acc != null
      ? [{ label: "Motor", value: motorStr, icon: <Zap className="h-3.5 w-3.5" /> }]
      : []),
    ...(track.mileage != null
      ? [{ label: "Quilometragem", value: `${track.mileage.toFixed(2)}km`, icon: <Milestone className="h-3.5 w-3.5" /> }]
      : []),
    ...(track.mileageDay != null
      ? [{ label: "Quilometragem Dia", value: `${track.mileageDay.toFixed(2)}km`, icon: <Milestone className="h-3.5 w-3.5 opacity-60" /> }]
      : []),
    ...(track.battery != null
      ? [{ label: "Bateria", value: `${track.battery}%`, icon: <Battery className="h-3.5 w-3.5" /> }]
      : []),
    ...(track.externalBattery != null
      ? [{ label: "Tensão Bateria Externa", value: `${track.externalBattery.toFixed(1)}V`, icon: <Battery className="h-3.5 w-3.5" /> }]
      : []),
    ...(track.fuel != null
      ? [{ label: "Combustível", value: `${track.fuel}%`, icon: <Fuel className="h-3.5 w-3.5" /> }]
      : []),
    ...(track.temperature != null
      ? [{ label: "Temperatura", value: `${track.temperature}°C`, icon: <Thermometer className="h-3.5 w-3.5" /> }]
      : []),
    ...(track.address
      ? [{ label: "Endereço", value: <span className="text-[11px]">{track.address}</span> }]
      : []),
    {
      label: "IMEI",
      value: <span className="font-mono text-[11px]">{displayImei}</span>,
    },
    {
      label: "Coordenada",
      value: (
        <a
          href={`https://www.google.com/maps?q=${track.lat},${track.lng}`}
          target="_blank" rel="noreferrer"
          className="text-blue-500 hover:underline font-mono text-[11px]"
        >
          {track.lat.toFixed(6)},{track.lng.toFixed(6)}
        </a>
      ),
    },
  ];

  return (
    <div className="absolute top-3 left-3 z-[1000] w-80 bg-background border rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-3 py-2.5 border-b bg-muted/30">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <DeviceTypeBadge isTag={isTag} />
            <span className="font-bold text-sm text-primary">{displayName}</span>
            {device.deviceType && device.deviceType !== "GT06" && (
              <span className="text-[11px] text-muted-foreground">({device.deviceType})</span>
            )}
            <button
              onClick={onRename}
              className="rounded p-0.5 hover:bg-muted transition-colors"
              title="Renomear / Apelido"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-muted transition-colors shrink-0 ml-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Veículo vinculado — só TAGs GT06 (rastreador de nuvem não tem esse conceito) */}
      {device.deviceType === "GT06" && (
        <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/10">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select
            value={device.motoId ?? "none"}
            onValueChange={v => onLinkMoto(v === "none" ? null : v)}
            disabled={linkMotoLoading}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Sem veículo vinculado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="flex items-center gap-1.5"><Unlink className="h-3 w-3" /> Sem veículo vinculado</span>
              </SelectItem>
              {motoOptions.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.placa} · {m.modelo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status */}
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-sm font-medium flex-1">{statusStr}</span>
        {isBlocked && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Bloqueado</Badge>}
      </div>

      {/* Dados */}
      <div className="px-3 py-2 space-y-2 max-h-64 overflow-auto">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1 text-muted-foreground shrink-0">
              {r.icon}
              <span className="text-xs font-medium">{r.label}:</span>
            </div>
            <div className="text-xs text-right">{r.value}</div>
          </div>
        ))}
      </div>

      {/* Ações */}
      {(showKm || showRelay) && (
        <div className="px-3 py-2.5 border-t space-y-1">
          {showKm && (
            <button
              onClick={onUpdateKm}
              className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1.5 rounded-md transition-colors"
            >
              <Milestone className="h-3.5 w-3.5" /> Atualizar quilometragem
            </button>
          )}

          {showRelay && (isBlocked ? (
            <button
              onClick={onUnblock}
              disabled={relayLoading}
              className="flex items-center gap-1.5 w-full text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-2 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {relayLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
              Desbloquear dispositivo
            </button>
          ) : (
            <button
              onClick={onBlock}
              disabled={relayLoading}
              className="flex items-center gap-1.5 w-full text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 px-2 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {relayLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              Bloquear dispositivo
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface AuthState { token: AnyTrackerToken; devices: DeviceInfo[] }

// ─── Página principal ─────────────────────────────────────────────────────────
export default function RastreamentoPage() {
  // Re-render quando o modo demo é ativado/desativado
  useDataCacheSnapshot();
  const privacy = isPrivacyEnabled();
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id ?? "default";

  const [provider, setProvider]     = useState<TrackerProvider | null>(null);
  const [dialogProvider, setDialogProvider] = useState<TrackerProvider>("brasilsat");
  const [auth, setAuth]             = useState<AuthState | null>(null);
  const [config, setConfig]         = useState<AnyTrackerConfig>({});
  const [configOpen, setConfigOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Reconexão automática em andamento (config compartilhada da empresa já existe).
  // Enquanto true, o corpo mostra "Conectando..." em vez da tela de configuração,
  // pra não "piscar" a tela de login toda vez que a página abre.
  const [autoConnecting, setAutoConnecting] = useState(false);

  const driver: TrackerDriver | null = provider ? DRIVERS[provider] : null;

  const [tracks, setTracks]             = useState<DeviceTrack[]>([]);
  const [loadingTrack, setLoadingTrack] = useState(false);

  // TAGs GT06 (avulsas) — fonte separada da nuvem, sempre buscada pra empresa
  // ativa (sem "conectar"), combinada com auth/tracks só na camada de exibição
  // (ver allDevices/allTracks mais abaixo).
  const [gt06Devices, setGt06Devices] = useState<DeviceInfo[]>([]);
  const [gt06Tracks, setGt06Tracks]   = useState<DeviceTrack[]>([]);

  // ── Combinação nuvem + GT06 (só na camada de exibição) ────────────────────
  // auth/tracks continuam descrevendo só a conexão de nuvem (BrasilSat/
  // Velotrack) — usados sozinhos em tudo que é ação específica de nuvem (km,
  // relé, playback, alarmes). allDevices/allTracks é só pra listar/mostrar.
  // Precisa vir logo após os states acima (não mais abaixo, perto do render):
  // useEffects mais adiante referenciam allTracks na própria lista de
  // dependências, que é avaliada de forma síncrona durante o render — declarar
  // depois causa "Cannot access before initialization".
  const allDevices = React.useMemo(
    () => [...(auth?.devices ?? []), ...gt06Devices],
    [auth, gt06Devices],
  );
  const allTracks = React.useMemo(
    () => [...tracks, ...gt06Tracks],
    [tracks, gt06Tracks],
  );
  const gt06ImeiSet = React.useMemo(
    () => new Set(gt06Devices.map(d => d.imei)),
    [gt06Devices],
  );
  // Aparelhos de nuvem cujo nome no provedor tem "TAG" (ex.: "SDA5052 - TAG" na
  // Velotrack) — são hardware de etiqueta, entram na seção TAG junto dos GT06.
  // Usa o nome CRU do provedor (não o apelido do Wayvo), pra classificação não
  // mudar quando alguém renomeia pra tirar o "- TAG" da tela.
  const cloudTagImeiSet = React.useMemo(
    () => new Set((auth?.devices ?? []).filter(d => deviceNameIsTag(d.deviceName)).map(d => d.imei)),
    [auth],
  );
  const isTagImei = React.useCallback(
    (imei: string) => gt06ImeiSet.has(imei) || cloudTagImeiSet.has(imei),
    [gt06ImeiSet, cloudTagImeiSet],
  );

  const [selectedImei, setSelectedImei] = useState<string | null>(null);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");
  // Filtro por tipo de dispositivo — afeta lista E mapa (ver pickForTypeFilter).
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<"all" | "rastreador" | "tag">("all");

  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  const [kmConfig, setKmConfig]           = useState<KmSyncConfig>({ marginKm: 0 });
  const [kmMarginInput, setKmMarginInput] = useState("0");

  const [renameOpen, setRenameOpen]   = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [kmOpen, setKmOpen]           = useState(false);
  const [kmValue, setKmValue]         = useState("");
  const [relayLoading, setRelayLoading] = useState<Set<string>>(new Set());

  // ── Cadastro de nova TAG GT06 (vincula um IMEI já conectado no servidor à empresa) ─
  const [registerTagOpen, setRegisterTagOpen]     = useState(false);
  const [registerImei, setRegisterImei]           = useState("");
  const [registerMotoId, setRegisterMotoId]       = useState<string>("");
  const [registerApelido, setRegisterApelido]     = useState("");
  const [registerLoading, setRegisterLoading]     = useState(false);
  // ── Trocar o veículo vinculado a uma TAG que a empresa já tem (painel de detalhes) ─
  const [linkMotoLoading, setLinkMotoLoading]     = useState(false);

  const [activeTab, setActiveTab] = useState("mapa");
  const [mapReady, setMapReady]   = useState(false);
  const [countdown, setCountdown] = useState(15);

  const REFRESH_SECS_IDLE = 15;
  const REFRESH_SECS_MOVING = 4;

  const trackMapRef     = useRef<L.Map | null>(null);
  const trackMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const histMapRef      = useRef<L.Map | null>(null);
  const histLayerRef    = useRef<L.LayerGroup | null>(null);
  const syncedKmRef     = useRef<Map<string, number>>(new Map());
  // Quantas vezes o push de KM falhou por dispositivo nesta sessão (aba aberta)
  // — depois de 3 falhas seguidas pro mesmo imei, para de tentar E de avisar
  // por toast (senão, um rastreador com erro persistente no BrasilSat — ex.:
  // "send command fail" — spamma a mesma mensagem a cada ciclo de polling).
  const kmSyncFailuresRef = useRef<Map<string, number>>(new Map());
  const KM_SYNC_MAX_RETRIES = 3;
  const fetchTracksRef  = useRef<(() => Promise<void>) | null>(null);
  const fetchAllRef     = useRef<(() => Promise<void>) | null>(null);

  // Histórico
  const [histImei, setHistImei]   = useState("");
  const [histBegin, setHistBegin] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return toInputDatetime(d);
  });
  const [histEnd, setHistEnd] = useState(() => toInputDatetime(new Date()));
  const [playback, setPlayback]     = useState<PlaybackPoint[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // Alarmes
  const [alarmImei, setAlarmImei]   = useState("");
  const [alarmBegin, setAlarmBegin] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return toInputDatetime(d);
  });
  const [alarmEnd, setAlarmEnd]     = useState(() => toInputDatetime(new Date()));
  const [alarms, setAlarms]         = useState<AlarmRecord[]>([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);

  // ── Nome de exibição: BrasilSat > apelido local > imei ───────────────────
  const getDisplayName = useCallback((imei: string, trackDeviceName?: string) => {
    if (privacy) return maskPlaca(imei);
    // Apelido definido no Wayvo (compartilhado pela empresa) ganha do nome que
    // vem do provedor — deixa arrumar a nomenclatura aqui sem depender de
    // renomear na BrasilSat/Velotrack.
    const localName = customNames[imei];
    if (localName && localName.trim()) return localName;
    // Senão, usa o nome cadastrado no provedor (da lista ou do track)
    const providerName = auth?.devices.find(d => d.imei === imei)?.deviceName || trackDeviceName || "";
    if (providerName && providerName !== imei) return providerName;
    return imei;
  }, [customNames, auth, privacy]);

  // ── Locações ativas (placa → nome do locatário) ─────────────────────────
  const normalizePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Sempre usa dados REAIS para o lookup (placas reais batem com nome real do
  // dispositivo da BrasilSat). O mascaramento é aplicado depois, na exibição.
  const activeRentalsByPlate = React.useMemo(() => {
    const real = getRealDataCache();
    const motos = real.motos;
    const rentals = real.rentals.filter(r => r.status === "ativa");
    const clients = real.clients;
    const map = new Map<string, { plate: string; renter: string; motoId: string; realPlate: string }>();
    for (const r of rentals) {
      const moto = motos.find(m => m.id === r.motoId);
      if (!moto?.placa) continue;
      const client = clients.find(c => c.id === r.clienteId);
      const realName = client?.nome ?? "—";
      map.set(normalizePlate(moto.placa), {
        plate: privacy ? maskPlaca(moto.id) : moto.placa,
        realPlate: moto.placa,
        renter: privacy && client ? maskName(client.id || client.cpf || client.nome) : realName,
        motoId: moto.id,
      });
    }
    return map;
  }, [tracks, auth, privacy]); // recompute when tracks/auth refresh (cheap)

  // ── Agrupamento por veículo: rastreador principal (nuvem) + TAG backup (GT06) ─
  // Na operação real, uma moto pode ter os dois — o rastreador de nuvem é o
  // principal, a TAG GT06 é um backup pro caso o principal falhar. Isso junta
  // os dois numa única "linha" por veículo em vez de mostrar como dispositivos
  // não relacionados (ver lista/mapa mais abaixo, que passam a iterar
  // vehicleGroups em vez de allDevices/allTracks direto).
  interface VehicleGroup {
    key: string; // `moto:<id>` quando casa com uma moto cadastrada, senão `imei:<imei>`
    plate: string | null;
    renter: string | null;
    primary: { info: DeviceInfo; track: DeviceTrack | null } | null; // nuvem
    backup: { info: DeviceInfo; track: DeviceTrack | null } | null;  // GT06
  }
  const vehicleGroups = React.useMemo<VehicleGroup[]>(() => {
    const motos = getRealDataCache().motos;
    // Todas as motos com placa (não só as com locação ativa) — uma TAG backup
    // pode estar numa moto parada no pátio, sem locação no momento.
    const motosByPlate = new Map<string, { id: string; placa: string }>();
    for (const m of motos) {
      if (m.placa) motosByPlate.set(normalizePlate(m.placa), { id: m.id, placa: m.placa });
    }
    const findMoto = (realName: string) => {
      const norm = normalizePlate(realName);
      if (!norm) return null;
      for (const [plateNorm, moto] of motosByPlate) {
        if (norm.includes(plateNorm)) return moto;
      }
      return null;
    };
    const renterFor = (plate: string | null) => {
      if (!plate) return null;
      return activeRentalsByPlate.get(normalizePlate(plate))?.renter ?? null;
    };

    const groups = new Map<string, VehicleGroup>();

    // 1) Cada dispositivo de nuvem sempre é o "primary" de um grupo.
    for (const dev of auth?.devices ?? []) {
      const track = tracks.find(t => t.imei === dev.imei) ?? null;
      const realName = dev.deviceName || track?.deviceName || dev.imei;
      const moto = findMoto(realName);
      const key = moto ? `moto:${moto.id}` : `imei:${dev.imei}`;
      groups.set(key, {
        key, plate: moto?.placa ?? null, renter: renterFor(moto?.placa ?? null),
        primary: { info: dev, track }, backup: null,
      });
    }

    // 2) Cada TAG GT06: vira "backup" de um grupo já existente (mesma moto),
    // ou "primary" do próprio grupo se não houver rastreador de nuvem casando
    // com essa moto (ou a TAG ainda não estiver vinculada a nenhuma moto).
    for (const dev of gt06Devices) {
      const track = gt06Tracks.find(t => t.imei === dev.imei) ?? null;
      const key = dev.motoId ? `moto:${dev.motoId}` : `imei:${dev.imei}`;
      const existing = groups.get(key);
      if (existing?.primary) {
        existing.backup = { info: dev, track };
      } else {
        const moto = dev.motoId ? motos.find(m => m.id === dev.motoId) : null;
        groups.set(key, {
          key, plate: moto?.placa ?? null, renter: renterFor(moto?.placa ?? null),
          primary: { info: dev, track }, backup: null,
        });
      }
    }

    return Array.from(groups.values());
  }, [auth, tracks, gt06Devices, gt06Tracks, activeRentalsByPlate]);

  // Dispositivo "efetivo" de um grupo pra exibição: principal se existir, senão o backup.
  const effectiveOf = (g: VehicleGroup) => g.primary ?? g.backup;
  // Track "efetivo" pro mapa: usa o principal só se ele tiver posição válida e
  // não estiver offline — senão cai pro backup (é o "TAG assume se o principal
  // cair" combinado com o usuário).
  const effectiveMapTrack = (g: VehicleGroup): DeviceTrack | null => {
    const p = g.primary?.track;
    const pOk = p && p.lat && p.lng && !(p.statusCode ?? "").toLowerCase().includes("offline");
    if (pOk) return p!;
    const b = g.backup?.track;
    if (b && b.lat && b.lng) return b;
    return p ?? b ?? null;
  };
  // Dispositivo do grupo que corresponde ao filtro "só Rastreadores"/"só TAGs"
  // (lista de dispositivos, ver deviceTypeFilter). "all" mantém o comportamento
  // padrão (effectiveOf); "rastreador" só considera o principal se ele NÃO for
  // GT06 (esconde o veículo inteiro se só tiver TAG); "tag" só considera um
  // dispositivo GT06, seja ele o principal (grupo sem rastreador de nuvem) ou o
  // backup do grupo.
  const pickForTypeFilter = (g: VehicleGroup): { info: DeviceInfo; track: DeviceTrack | null } | null => {
    if (deviceTypeFilter === "all") return effectiveOf(g);
    const primaryIsTag = g.primary ? isTagImei(g.primary.info.imei) : false;
    if (deviceTypeFilter === "rastreador") {
      return g.primary && !primaryIsTag ? g.primary : null;
    }
    // deviceTypeFilter === "tag"
    if (g.primary && primaryIsTag) return g.primary;
    return g.backup ?? null;
  };

  // ── Token ─────────────────────────────────────────────────────────────────
  const getValidToken = useCallback(async (): Promise<AnyTrackerToken> => {
    if (!driver) throw new Error("Selecione um provedor de rastreamento");
    if (auth && Date.now() < auth.token.expires_at) return auth.token;
    const saved = driver.loadConfig(companyId);
    if (!saved) throw new Error("Configure as credenciais primeiro");
    const token = await driver.authenticate(saved);
    setAuth(prev => prev ? { ...prev, token } : null);
    return token;
  }, [auth, companyId, driver]);

  // ── Sincronização km rastreador ↔ sistema ────────────────────────────────
  const syncKm = useCallback(async (freshTracks: DeviceTrack[]): Promise<boolean> => {
    // Usa dados REAIS para que o sync funcione mesmo com modo demo ativo
    const motos = getRealDataCache().motos;
    if (!driver || !motos.length || !freshTracks.length) return false;
    let token: AnyTrackerToken;
    try { token = await getValidToken(); } catch { return false; }

    const { marginKm } = driver.loadKmSyncConfig(companyId);
    let anySynced = false;
    // Motos cujo kmAtual deve ser atualizado com o valor do rastreador
    const kmUpdates = new Map<string, number>();

    for (const track of freshTracks) {
      const realName = (auth?.devices.find(d => d.imei === track.imei)?.deviceName || track.deviceName || customNames[track.imei] || track.imei).toUpperCase();
      // Compara só letras/números (sem traço/espaço) — o nome cadastrado no
      // rastreador nem sempre usa a mesma formatação da placa no cadastro
      // (ex.: "SCF-3D55" no sistema vs "SCF3D55" na BrasilSat), então uma
      // comparação literal (sem normalizar) deixava de bater e o km nunca
      // sincronizava pra placas com traço/espaço.
      const normalizedRealName = normalizePlate(realName);
      const moto = motos.find(m => m.placa && normalizedRealName.includes(normalizePlate(m.placa)));
      if (!moto) continue;

      const trackerKm = track.mileage ?? 0;
      const kmAtual = moto.kmAtual ?? 0;

      // Rastreador à frente: atualiza kmAtual no sistema para refletir em todas as páginas
      if (trackerKm > kmAtual) {
        kmUpdates.set(moto.id, trackerKm);
      }

      // KM alvo para push = kmAtual efetivo + margem configurada
      const effectiveKmAtual = kmUpdates.get(moto.id) ?? kmAtual;
      const targetKm = effectiveKmAtual + (marginKm ?? 0);

      // Pula se já sincronizamos este valor na sessão atual
      const lastSynced = syncedKmRef.current.get(track.imei) ?? -1;
      if (lastSynced >= targetKm) continue;

      // Pula se já sincronizamos este valor em sessão anterior (evita chamada desnecessária ao reabrir a página)
      const persistKey = `wayvo:km-synced:${companyId}:${track.imei}`;
      try {
        const persisted = Number(localStorage.getItem(persistKey) ?? -1);
        if (persisted >= targetKm) {
          syncedKmRef.current.set(track.imei, persisted);
          continue;
        }
      } catch { /* ignora falha de localStorage */ }

      // Já falhou demais pra este dispositivo nesta sessão — para de tentar
      // (e de avisar) até a página ser recarregada.
      if ((kmSyncFailuresRef.current.get(track.imei) ?? 0) >= KM_SYNC_MAX_RETRIES) continue;

      if (kmAtual > trackerKm) {
        // Sistema tem km maior (ex: troca de óleo registrada): push para o rastreador
        try {
          await driver.setMileage(token, track.imei, targetKm);
          toast.success(`KM sincronizado: ${getDisplayName(track.imei)} → ${targetKm.toLocaleString("pt-BR")} km`);
          // Marca como sincronizado apenas após sucesso — falhas não bloqueiam retries futuros
          syncedKmRef.current.set(track.imei, targetKm);
          try { localStorage.setItem(persistKey, String(targetKm)); } catch { /* ignora */ }
          anySynced = true;
        } catch (e: any) {
          const failCount = (kmSyncFailuresRef.current.get(track.imei) ?? 0) + 1;
          kmSyncFailuresRef.current.set(track.imei, failCount);
          console.warn(`syncKm (falha ${failCount}/${KM_SYNC_MAX_RETRIES}):`, e.message);
          if (failCount <= KM_SYNC_MAX_RETRIES) {
            toast.error(`Falha ao sincronizar KM do rastreador ${getDisplayName(track.imei)}: ${e.message}`);
          }
        }
      } else {
        // Rastreador igual ou maior: marca targetKm como visto para evitar re-checagem
        syncedKmRef.current.set(track.imei, targetKm);
        try { localStorage.setItem(persistKey, String(targetKm)); } catch { /* ignora */ }
      }
    }

    // Persiste atualizações de kmAtual vindas do rastreador para todas as páginas refletirem
    if (kmUpdates.size > 0) {
      const allMotos = getRealDataCache().motos;
      const updatedList = allMotos.map(m =>
        kmUpdates.has(m.id) ? { ...m, kmAtual: kmUpdates.get(m.id)! } : m
      );
      saveMotos(updatedList);
    }

    return anySynced;
  }, [getValidToken, customNames, getDisplayName, auth, companyId, driver]);

  // ── Conexão ────────────────────────────────────────────────────────────────
  const connect = useCallback(async (providerArg: TrackerProvider, cfg: AnyTrackerConfig) => {
    const drv = DRIVERS[providerArg];
    if (drv.credentialFields.some(f => !cfg[f.key]?.trim())) {
      toast.error("Preencha todos os campos"); return;
    }
    setConnecting(true);
    try {
      const token   = await drv.authenticate(cfg);
      const devices = await drv.getDeviceList(token);
      setProvider(providerArg);
      setAuth({ token, devices });
      // Cache local do navegador (rápido) + config compartilhada da empresa (banco):
      // com a compartilhada salva, qualquer usuário/dispositivo da empresa entra
      // direto no mapa sem passar pela tela de login de novo.
      drv.saveConfig(companyId, cfg);
      saveTrackerProvider(companyId, providerArg);
      const shared = await saveSharedTrackerConfig(companyId, providerArg, cfg);
      setConfigOpen(false);
      toast.success(
        `Conectado · ${devices.length} dispositivo(s)` +
        (shared ? "" : " · credenciais salvas só neste dispositivo"),
      );
    } catch (e: any) {
      toast.error(e.message ?? "Falha na conexão");
    } finally {
      setConnecting(false);
      setAutoConnecting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ── Buscar posições ────────────────────────────────────────────────────────
  const fetchTracks = useCallback(async () => {
    if (!auth || !driver) return;
    setLoadingTrack(true);
    try {
      const token = await getValidToken();
      const imeis = auth.devices.map(d => d.imei).filter(Boolean);
      if (!imeis.length) return;
      const result = await driver.trackDevices(token, imeis);
      setTracks(result);
      const hadSync = await syncKm(result);
      // Se algum km foi sincronizado, re-busca após 2s para exibir o valor atualizado do rastreador
      if (hadSync) setTimeout(() => { fetchTracksRef.current?.(); }, 2000);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao buscar posições");
    } finally {
      setLoadingTrack(false);
    }
  }, [auth, getValidToken, syncKm, driver]);

  // ── Recarrega a lista de TAGs GT06 da empresa (após cadastrar/vincular uma nova) ─
  const refetchGt06Devices = useCallback(async () => {
    if (!companyId) return;
    try {
      const devices = await gt06.getDeviceList(companyId);
      setGt06Devices(devices);
    } catch (e: any) {
      console.warn("[gt06] getDeviceList:", e.message);
    }
  }, [companyId]);

  // ── Buscar posições das TAGs GT06 (sem login — sempre roda p/ a empresa ativa) ─
  const fetchGt06Tracks = useCallback(async () => {
    if (!companyId) return;
    try {
      const result = await gt06.trackDevices(companyId);
      setGt06Tracks(result);
    } catch (e: any) {
      console.warn("[gt06] trackDevices:", e.message);
    }
  }, [companyId]);

  // ── Busca combinada (nuvem + GT06) — usada pelo polling e pelo botão manual ──
  const fetchAll = useCallback(async () => {
    await Promise.all([
      auth && driver ? fetchTracks() : Promise.resolve(),
      fetchGt06Tracks(),
    ]);
  }, [auth, driver, fetchTracks, fetchGt06Tracks]);

  // ── Mantém refs atualizadas (evita stale closure no setInterval) ──────────
  useEffect(() => { fetchTracksRef.current = fetchTracks; }, [fetchTracks]);
  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

  // ── Atualiza marcadores no mapa ──────────────────────────────────────────
  // Um marcador por VEÍCULO (não por dispositivo cru): usa a posição do
  // rastreador principal, ou da TAG backup se o principal estiver sem sinal
  // (ver effectiveMapTrack) — assim o veículo não some do mapa só porque o
  // principal caiu, e não aparecem 2 pinos pro mesmo veículo.
  useEffect(() => {
    const map = trackMapRef.current;
    if (!map) return;
    const byImei = new Map<string, DeviceTrack>();
    for (const g of vehicleGroups) {
      // "all" mostra o efetivo (principal, com fallback pro backup se cair);
      // com um filtro de tipo ativo, mostra só o dispositivo daquele tipo —
      // sem fallback, senão um filtro "só TAGs" acabaria mostrando rastreador.
      const t = deviceTypeFilter === "all" ? effectiveMapTrack(g) : (pickForTypeFilter(g)?.track ?? null);
      if (t && t.lat && t.lng) byImei.set(t.imei, t);
    }
    // Se o usuário clicou especificamente na TAG backup (que normalmente fica
    // escondida atrás do marcador do principal — só um pino por veículo),
    // garante que o pino dela apareça mesmo assim enquanto ela estiver
    // selecionada, senão o mapa centraliza num lugar sem nenhum marcador.
    if (selectedImei && !byImei.has(selectedImei)) {
      const selected = allTracks.find(t => t.imei === selectedImei);
      if (selected && selected.lat && selected.lng) byImei.set(selectedImei, selected);
    }
    const valid = Array.from(byImei.values());
    const seen = new Set<string>();
    let isFirst = trackMarkersRef.current.size === 0 && valid.length > 0;

    valid.forEach(t => {
      seen.add(t.imei);
      const name = getDisplayName(t.imei, t.deviceName);
      const isTag = isTagImei(t.imei);
      const icon = deviceIcon(t, isTag);
      const tooltip = tooltipHtml(name, isTag);
      const existing = trackMarkersRef.current.get(t.imei);
      if (existing) {
        existing.setLatLng([t.lat, t.lng]);
        existing.setIcon(icon);
        (existing as any)._tooltip && existing.setTooltipContent(tooltip);
      } else {
        const m = L.marker([t.lat, t.lng], { icon })
          .addTo(map)
          .on("click", () => setSelectedImei(t.imei));
        m.bindTooltip(tooltip, { permanent: true, direction: "top", offset: [0, -24], className: "leaflet-tooltip-device" });
        trackMarkersRef.current.set(t.imei, m);
      }
    });

    trackMarkersRef.current.forEach((m, imei) => {
      if (!seen.has(imei)) { m.remove(); trackMarkersRef.current.delete(imei); }
    });

    if (isFirst) {
      const bounds = L.latLngBounds(valid.map(t => [t.lat, t.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleGroups, getDisplayName, mapReady, deviceTypeFilter, selectedImei, allTracks, gt06ImeiSet, isTagImei]);

  // ── Centraliza no dispositivo selecionado ────────────────────────────────
  useEffect(() => {
    if (!selectedImei) return;
    const t = allTracks.find(t => t.imei === selectedImei);
    if (!t?.lat || !t?.lng) return;
    // Delay garante que invalidateSize da troca de aba já ocorreu
    const id = setTimeout(() => {
      const map = trackMapRef.current;
      if (map) map.setView([t.lat, t.lng], Math.max(map.getZoom(), 15), { animate: true });
    }, 80);
    return () => clearTimeout(id);
  }, [selectedImei, allTracks]);

  // ── Histórico/Alarmes exigem um provedor de nuvem conectado (GT06 não tem
  // essas APIs) — sem isso a aba some da barra, então garante que a aba ativa
  // nunca fica "presa" numa delas quando não há mais provedor de nuvem ───────
  useEffect(() => {
    if (!driver && activeTab !== "mapa") setActiveTab("mapa");
  }, [driver, activeTab]);

  // ── invalidateSize ao trocar de aba ─────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      if (activeTab === "mapa") trackMapRef.current?.invalidateSize();
      else if (activeTab === "historico") histMapRef.current?.invalidateSize();
    }, 60);
    return () => clearTimeout(id);
  }, [activeTab]);

  // Intervalo dinâmico: mais rápido quando há dispositivos em movimento (nuvem ou GT06)
  const anyMoving = tracks.some(t => (t.speed ?? 0) > 0) || gt06Tracks.some(t => (t.speed ?? 0) > 0);
  const refreshSecs = anyMoving ? REFRESH_SECS_MOVING : REFRESH_SECS_IDLE;
  const refreshSecsRef = useRef(refreshSecs);
  useEffect(() => { refreshSecsRef.current = refreshSecs; }, [refreshSecs]);

  // ── Auto-refresh com countdown ────────────────────────────────────────────
  // Roda sempre que há empresa ativa — GT06 não depende de conexão de nuvem
  // (auth), então não faz mais sentido gatear o polling só por ela.
  useEffect(() => {
    if (!companyId) return;
    fetchAll();
    setCountdown(refreshSecsRef.current);
    const tickId = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          fetchAllRef.current?.();
          return refreshSecsRef.current;
        }
        // Se mudou para modo "movimento" e o countdown atual está acima do novo limite, reduz
        return Math.min(c - 1, refreshSecsRef.current);
      });
    }, 1000);
    return () => clearInterval(tickId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, auth]);

  // ── Histórico ─────────────────────────────────────────────────────────────
  const loadPlayback = async () => {
    if (!histImei || !driver) { toast.error("Selecione um dispositivo"); return; }
    setLoadingHist(true);
    try {
      const token = await getValidToken();
      const pts = await driver.getPlayback(
        token, histImei,
        new Date(histBegin).getTime(), new Date(histEnd).getTime(),
      );
      setPlayback(pts);
      const map = histMapRef.current;
      if (map) {
        if (histLayerRef.current) histLayerRef.current.clearLayers();
        else { histLayerRef.current = L.layerGroup().addTo(map); }
        if (pts.length > 0) {
          const ll: [number, number][] = pts.map(p => [p.lat, p.lng]);
          L.polyline(ll, { color: "#3b82f6", weight: 3, opacity: 0.8 }).addTo(histLayerRef.current!);
          L.marker(ll[0], { icon: makeIcon("#22c55e", true) }).bindPopup("Início").addTo(histLayerRef.current!);
          L.marker(ll[ll.length - 1], { icon: makeIcon("#ef4444", true) })
            .bindPopup(`Fim · ${fmtTime(pts[pts.length - 1].gpstime)}`).addTo(histLayerRef.current!);
          map.fitBounds(L.latLngBounds(ll), { padding: [48, 48] });
        }
      }
      if (!pts.length) toast.info("Nenhum registro no período");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar histórico");
    } finally {
      setLoadingHist(false);
    }
  };

  // ── Alarmes ───────────────────────────────────────────────────────────────
  const loadAlarms = async () => {
    if (!alarmImei || !driver) { toast.error("Selecione um dispositivo"); return; }
    setLoadingAlarms(true);
    try {
      const token = await getValidToken();
      const result = await driver.getAlarms(
        token, alarmImei,
        new Date(alarmBegin).getTime(), new Date(alarmEnd).getTime(),
      );
      setAlarms(result);
      if (!result.length) toast.info("Nenhum alarme no período");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar alarmes");
    } finally {
      setLoadingAlarms(false);
    }
  };

  // ── Inicialização e troca de empresa ─────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    // Desconecta e limpa tudo da empresa anterior
    setAuth(null);
    setTracks([]);
    setGt06Devices([]);
    setGt06Tracks([]);
    setSelectedImei(null);
    syncedKmRef.current.clear();
    trackMarkersRef.current.forEach(m => m.remove());
    trackMarkersRef.current.clear();

    // GT06 (TAGs avulsas) sempre carrega pra empresa ativa, independente de
    // haver rastreador de nuvem conectado — não é um "provedor" que se escolhe,
    // é um registro direto no banco já isolado por empresa via RLS (gt06.ts).
    let cancelled = false;
    gt06.getDeviceList(companyId)
      .then(devices => { if (!cancelled) setGt06Devices(devices); })
      .catch(e => console.warn("[gt06] getDeviceList:", e.message));
    const gt06Names = gt06.loadDeviceNames(companyId);

    // Otimista: assume que vai reconectar sozinho, pra não piscar a tela de
    // login. A rotina async abaixo desliga isso se não houver o que conectar.
    setAutoConnecting(true);

    (async () => {
      // Apelidos compartilhados pela empresa (banco) — ganham do nome do provedor
      // e do cache local. Buscados em paralelo com a config.
      const sharedNames = await loadSharedDeviceNames(companyId);
      if (cancelled) return;

      // 1) Config compartilhada da empresa (banco) — fonte de verdade. Se existe,
      //    qualquer usuário/dispositivo entra direto, sem a tela de login.
      const shared = await loadSharedTrackerConfig(companyId);
      if (cancelled) return;

      if (shared) {
        const drv = DRIVERS[shared.provider];
        setProvider(shared.provider);
        setDialogProvider(shared.provider);
        setConfig(shared.credentials);
        setCustomNames({ ...gt06Names, ...drv.loadDeviceNames(companyId), ...sharedNames });
        const kmCfg = drv.loadKmSyncConfig(companyId);
        setKmConfig(kmCfg);
        setKmMarginInput(String(kmCfg.marginKm));
        // Espelha no cache local pra próxima abertura ser instantânea
        saveTrackerProvider(companyId, shared.provider);
        drv.saveConfig(companyId, shared.credentials);
        connect(shared.provider, shared.credentials); // desliga autoConnecting no finally
        return;
      }

      // 2) Fallback: cache local só deste navegador (retrocompat com quem já
      //    tinha configurado antes desta mudança).
      const savedProvider = loadTrackerProvider(companyId);
      setProvider(savedProvider);
      setDialogProvider(savedProvider ?? "brasilsat");

      if (!savedProvider) {
        setConfig({});
        setCustomNames({ ...gt06Names, ...sharedNames });
        setKmConfig({ marginKm: 0 });
        setKmMarginInput("0");
        setAutoConnecting(false); // mostra TAGs GT06 (se houver) + opção de conectar
        return;
      }

      const drv = DRIVERS[savedProvider];
      const savedCfg = drv.loadConfig(companyId);
      setConfig(savedCfg ?? {});
      setCustomNames({ ...gt06Names, ...drv.loadDeviceNames(companyId), ...sharedNames });
      const savedKmCfg = drv.loadKmSyncConfig(companyId);
      setKmConfig(savedKmCfg);
      setKmMarginInput(String(savedKmCfg.marginKm));

      if (savedCfg) connect(savedProvider, savedCfg);
      else setAutoConnecting(false); // provedor escolhido mas sem credenciais → formulário
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ── Ações de dispositivo ──────────────────────────────────────────────────
  const handleRename = () => {
    if (!selectedImei) return;
    const imei = selectedImei;
    const name = renameValue.trim();
    if (!name) { toast.error("Informe um nome"); return; }
    const isGt06Selected = gt06Devices.some(d => d.imei === imei);
    // Cache local (rápido)
    if (isGt06Selected) {
      gt06.saveDeviceName(companyId, imei, name);
    } else if (driver) {
      driver.saveDeviceName(companyId, imei, name);
    }
    // Apelido compartilhado pela empresa (banco) — é o que vale pra todo mundo.
    void saveSharedDeviceName(companyId, imei, name).then(ok => {
      if (!ok) toast.warning("Nome salvo só neste dispositivo (sem permissão para a empresa toda).");
    });
    // Reconstrói o mapa combinado (GT06 + nuvem, se houver) pra refletir o rename.
    const updated = {
      ...gt06.loadDeviceNames(companyId),
      ...(driver?.loadDeviceNames(companyId) ?? {}),
      ...customNames,
      [imei]: name,
    };
    setCustomNames(updated);
    const marker = trackMarkersRef.current.get(imei);
    marker?.setTooltipContent(tooltipHtml(name, isTagImei(imei)));
    setRenameOpen(false);
    toast.success("Nome atualizado");
  };

  // Reivindica uma TAG GT06 já conectada no servidor (por IMEI) pra empresa
  // atual, com um veículo/apelido opcionais já na hora do cadastro.
  const handleRegisterTag = async () => {
    const imei = registerImei.trim();
    if (!imei) { toast.error("Informe o IMEI da TAG"); return; }
    setRegisterLoading(true);
    try {
      // Sem apelido digitado mas com veículo escolhido: usa "GT06 | <placa>" —
      // todo GT06 tem que ficar identificável pela placa da moto.
      const placaEscolhida = registerMotoId
        ? getRealDataCache().motos.find(m => m.id === registerMotoId)?.placa ?? ""
        : "";
      const apelidoFinal = registerApelido.trim() || (placaEscolhida ? gt06.gt06Apelido(placaEscolhida) : "");
      const claimed = await gt06.claimDevice(companyId, imei, {
        motoId: registerMotoId || null,
        apelido: apelidoFinal,
      });
      if (!claimed) {
        const already = await gt06.deviceBelongsToCompany(companyId, imei);
        toast.error(
          already
            ? "Esse IMEI já está cadastrado nessa empresa."
            : "IMEI não encontrado — confirme que a TAG está ligada e já mandou algum sinal (ou se já pertence a outra empresa).",
        );
        return;
      }
      await refetchGt06Devices();
      toast.success("TAG vinculada com sucesso");
      setRegisterTagOpen(false);
      setRegisterImei("");
      setRegisterMotoId("");
      setRegisterApelido("");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao cadastrar TAG");
    } finally {
      setRegisterLoading(false);
    }
  };

  // Troca (ou remove) o veículo vinculado a uma TAG que a empresa já possui —
  // usado no painel de detalhes, pra reorganizar backup ↔ veículo sem SQL.
  const handleLinkMoto = async (imei: string, motoId: string | null) => {
    setLinkMotoLoading(true);
    try {
      // Vincula e já grava a placa como apelido — todo GT06 identificado pela moto.
      const placa = motoId ? getRealDataCache().motos.find(m => m.id === motoId)?.placa ?? null : null;
      await gt06.linkDeviceToMoto(companyId, imei, motoId, placa);
      await refetchGt06Devices();
      toast.success(motoId ? "Veículo vinculado" : "Vínculo removido");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao vincular veículo");
    } finally {
      setLinkMotoLoading(false);
    }
  };

  const handleUpdateKm = async () => {
    if (!selectedImei || !driver) return;
    const km = parseFloat(kmValue);
    if (isNaN(km) || km < 0) { toast.error("KM inválido"); return; }
    try {
      const token = await getValidToken();
      await driver.setMileage(token, selectedImei, km);
      syncedKmRef.current.set(selectedImei, km);
      setKmOpen(false);
      toast.success(`KM atualizado: ${km.toLocaleString("pt-BR")} km`);
      fetchTracks();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar KM");
    }
  };

  const handleSaveKmConfig = () => {
    if (!driver) return;
    const margin = parseFloat(kmMarginInput);
    if (isNaN(margin) || margin < 0) { toast.error("Margem inválida"); return; }
    const cfg: KmSyncConfig = { marginKm: margin };
    driver.saveKmSyncConfig(companyId, cfg);
    setKmConfig(cfg);
    // Limpa o cache de sync para que o próximo fetchTracks reaplique com a nova margem
    syncedKmRef.current.clear();
    toast.success("Configuração de KM salva");
  };

  const handleBlock = async (imei: string) => {
    if (!driver) return;
    setRelayLoading(prev => new Set(prev).add(imei));
    try {
      const token = await getValidToken();
      await driver.setRelay(token, imei, 0);
      toast.success("Dispositivo bloqueado");
      fetchTracks();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao bloquear");
    } finally {
      setRelayLoading(prev => { const s = new Set(prev); s.delete(imei); return s; });
    }
  };

  const handleUnblock = async (imei: string) => {
    if (!driver) return;
    setRelayLoading(prev => new Set(prev).add(imei));
    try {
      const token = await getValidToken();
      await driver.setRelay(token, imei, 1);
      toast.success("Dispositivo desbloqueado");
      fetchTracks();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao desbloquear");
    } finally {
      setRelayLoading(prev => { const s = new Set(prev); s.delete(imei); return s; });
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    driver?.clearConfig(companyId);
    void clearSharedTrackerConfig(companyId);
    setAuth(null);
    setTracks([]);
    setSelectedImei(null);
    setConfig({});
    setAutoConnecting(false);
    syncedKmRef.current.clear();
    trackMarkersRef.current.forEach(m => m.remove());
    trackMarkersRef.current.clear();
    toast.success(`Desconectado do ${driver?.label ?? "rastreador"}`);
  };

  // ── Troca de provedor (volta à tela de escolha) ──────────────────────────
  const handleChangeProvider = () => {
    driver?.clearConfig(companyId);
    clearTrackerProvider(companyId);
    void clearSharedTrackerConfig(companyId);
    setProvider(null);
    setAuth(null);
    setTracks([]);
    setSelectedImei(null);
    setConfig({});
    setAutoConnecting(false);
    setConfigOpen(false);
  };

  // ── Listas filtradas (por veículo, não por dispositivo cru) ───────────────
  // Offline só quando NENHUM dos dois (principal/backup) tem sinal — se um
  // caiu mas o outro responde, o veículo continua contando como online.
  const isTrackOffline = (t: DeviceTrack | null | undefined): boolean => {
    if (!t) return true;
    const sc = (t.statusCode ?? "").toLowerCase();
    if (sc.includes("offline")) return true;
    // acc === 0 (motor confirmado desligado) reforça o heurístico; acc
    // undefined (TAGs GT06, sem leitura de ignição) não deve contar sozinho.
    if (t.acc === 0 && !t.speed) return true;
    return false;
  };
  const isGroupOffline = (g: VehicleGroup): boolean => {
    const primaryOffline = g.primary ? isTrackOffline(g.primary.track) : true;
    const backupOffline = g.backup ? isTrackOffline(g.backup.track) : true;
    if (g.primary && g.backup) return primaryOffline && backupOffline;
    return g.primary ? primaryOffline : backupOffline;
  };

  const onlineCount  = vehicleGroups.filter(g => !isGroupOffline(g)).length;
  const offlineCount = vehicleGroups.length - onlineCount;
  const rastreadorCount = vehicleGroups.filter(g => g.primary && !isTagImei(g.primary.info.imei)).length;
  const tagCount = vehicleGroups.filter(g => (g.primary && isTagImei(g.primary.info.imei)) || g.backup).length;

  const filteredGroups = vehicleGroups.filter(g => {
    const eff = pickForTypeFilter(g);
    if (!eff) return false;
    const offline = isGroupOffline(g);
    if (deviceFilter === "online" && offline) return false;
    if (deviceFilter === "offline" && !offline) return false;
    const q = deviceSearch.toLowerCase().trim();
    if (!q) return true;
    const name = getDisplayName(eff.info.imei, eff.track?.deviceName).toLowerCase();
    const renter = (g.renter ?? "").toLowerCase();
    return name.includes(q) || renter.includes(q);
  });

  const selectedTrack  = allTracks.find(t => t.imei === selectedImei) ?? null;
  const selectedDevice = allDevices.find(d => d.imei === selectedImei) ?? null;
  const isSelectedGt06 = selectedImei ? gt06ImeiSet.has(selectedImei) : false;
  const isSelectedTag = selectedImei ? isTagImei(selectedImei) : false;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Cabeçalho */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b bg-background">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Rastreamento</h2>
          {allDevices.length > 0 ? (
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 text-[11px]">
              <Wifi className="h-2.5 w-2.5 mr-1" />
              {vehicleGroups.length} veículo{vehicleGroups.length !== 1 ? "s" : ""} · {onlineCount} online
              {driver ? ` · ${driver.label}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted text-muted-foreground text-[11px]">
              <WifiOff className="h-2.5 w-2.5 mr-1" /> Desconectado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allDevices.length > 0 && (
            <Button size="sm" variant="ghost" onClick={fetchAll} disabled={loadingTrack}>
              <RefreshCw className={`h-4 w-4 ${loadingTrack ? "animate-spin" : ""}`} />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setRegisterTagOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Cadastrar TAG
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
            <Settings className="h-4 w-4 mr-1.5" /> Configurações
          </Button>
          {auth && (
            <Button size="sm" variant="ghost" onClick={handleLogout} title={`Sair do ${driver?.label ?? "rastreador"}`}>
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Corpo */}
      {allDevices.length === 0 && (autoConnecting || connecting) ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <p className="text-sm">Conectando ao rastreador…</p>
          </div>
        </div>
      ) : allDevices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-6 max-w-sm w-full">
            <div className="flex flex-col items-center gap-3">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Rastreamento não configurado</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {provider
                    ? `Esta empresa ainda não conectou o ${driver?.label}.`
                    : "Escolha o rastreador GPS que essa empresa utiliza."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {!provider ? (
                Object.entries(DRIVERS).map(([key, drv]) => (
                  <Button
                    key={key}
                    variant="outline"
                    className="w-full"
                    onClick={() => { setDialogProvider(key as TrackerProvider); setConfig({}); setConfigOpen(true); }}
                  >
                    <Settings className="h-4 w-4 mr-2" /> Configurar {drv.label}
                  </Button>
                ))
              ) : (
                <>
                  <Button className="w-full" onClick={() => setConfigOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" /> Conectar {driver?.label}
                  </Button>
                  <button
                    onClick={handleChangeProvider}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Usar outro rastreador
                  </button>
                </>
              )}

              <a
                href={`https://wa.me/?text=${encodeURIComponent("Olá! Gostaria de saber mais sobre a integração de rastreamento GPS no WAYVO.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-[#25D366]" /> Falar com o suporte
              </a>

              <a
                href="https://brasilsat.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ShoppingCart className="h-4 w-4" /> Comprar rastreador BrasilSat
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </div>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 w-fit shrink-0">
            <TabsTrigger value="mapa"><MapPin className="h-3.5 w-3.5 mr-1.5" />Mapa</TabsTrigger>
            {/* Histórico/Alarmes exigem um provedor de nuvem conectado (BrasilSat/
                Velotrack) — TAGs GT06 não têm essas APIs, mas não impedem essas
                abas de aparecer se houver TAMBÉM um provedor de nuvem conectado. */}
            {!!driver && (
              <TabsTrigger value="historico"><History className="h-3.5 w-3.5 mr-1.5" />Histórico</TabsTrigger>
            )}
            {!!driver && (
              <TabsTrigger value="alarmes"><Bell className="h-3.5 w-3.5 mr-1.5" />Alarmes</TabsTrigger>
            )}
          </TabsList>

          {/* ── Tab: Mapa ── */}
          <TabsContent value="mapa" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden flex">
            <div className="flex h-full w-full">

              {/* Painel esquerdo: dispositivos */}
              <div className="w-72 shrink-0 border-r flex flex-col bg-background">
                <div className="p-2.5 border-b space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-sm"
                      placeholder="Buscar por placa ou locatário..."
                      value={deviceSearch}
                      onChange={e => setDeviceSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["all", "online", "offline"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setDeviceFilter(f)}
                        className={`flex-1 text-[11px] py-1 rounded-md border transition-colors ${
                          deviceFilter === f
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {f === "all"
                          ? `Todos (${vehicleGroups.length})`
                          : f === "online"
                          ? `Online (${onlineCount})`
                          : `Offline (${offlineCount})`}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {(["all", "rastreador", "tag"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setDeviceTypeFilter(f)}
                        className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-md border transition-colors ${
                          deviceTypeFilter === f
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {f === "all" && "Todos"}
                        {f === "rastreador" && <><Satellite className="h-3 w-3" />{`Rastreadores (${rastreadorCount})`}</>}
                        {f === "tag" && <><Tag className="h-3 w-3" />{`TAGs (${tagCount})`}</>}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { fetchAll(); setCountdown(refreshSecs); }}
                    disabled={loadingTrack}
                    className="flex items-center justify-between w-full text-[11px] px-2 py-1.5 rounded-md bg-muted/60 hover:bg-muted border border-border transition-colors disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingTrack ? "animate-spin" : ""}`} />
                      Atualizar agora
                    </span>
                    <span className="text-muted-foreground tabular-nums">{countdown}s</span>
                  </button>
                </div>

                {activeRentalsByPlate.size > 0 && (
                  <details className="border-b bg-muted/20">
                    <summary className="cursor-pointer text-[11px] font-medium px-3 py-2 hover:bg-muted/40">
                      Locações ativas ({activeRentalsByPlate.size})
                    </summary>
                    <div className="max-h-40 overflow-auto px-3 pb-2 space-y-1">
                      {Array.from(activeRentalsByPlate.values()).map(r => (
                        <button
                          key={r.motoId}
                          onClick={() => setDeviceSearch(r.plate)}
                          className="block w-full text-left text-[11px] hover:bg-muted/60 rounded px-1.5 py-1"
                        >
                          <span className="font-mono font-semibold">{r.plate}</span>
                          <span className="text-muted-foreground"> · {r.renter}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}

                <div className="flex-1 overflow-auto">
                  {filteredGroups.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-8">Nenhum veículo</p>
                  )}
                  {filteredGroups.map(g => {
                    const eff = pickForTypeFilter(g);
                    if (!eff) return null;
                    const track = eff.track;
                    const { color } = track ? statusLabel(track) : { color: "#6b7280" };
                    const since = track ? timeSince(track.gpstime) : "—";
                    const isStale = !!track && Date.now() - track.gpstime > STALE_UPDATE_MS;
                    const isSelected = eff.info.imei === selectedImei;
                    const name = getDisplayName(eff.info.imei, track?.deviceName);
                    const isBackupSelected = g.backup && g.backup.info.imei === selectedImei;
                    const effIsTag = isTagImei(eff.info.imei);
                    return (
                      <button
                        key={g.key}
                        onClick={() => {
                          const next = isSelected ? null : eff.info.imei;
                          setSelectedImei(next);
                          if (next) setActiveTab("mapa");
                        }}
                        className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/60 transition-colors ${
                          isSelected ? "bg-primary/10 border-l-2 border-l-primary" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <DeviceTypeBadge isTag={effIsTag} />
                            <span className="font-medium text-sm truncate">{name}</span>
                          </div>
                          <span
                            title={track ? `Última posição recebida: ${fmtTime(track.gpstime)}` : "Sem dado de posição"}
                            className={`text-[11px] shrink-0 flex items-center gap-1 ${
                              isStale ? "text-amber-600 dark:text-amber-500 font-semibold" : "text-muted-foreground"
                            }`}
                          >
                            {isStale && <AlertTriangle className="h-3 w-3" />}
                            {track ? `há ${since}` : since}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-[11px] text-muted-foreground truncate">
                            {track ? statusLabel(track).label : "Sem dados"}
                          </span>
                        </div>
                        {g.renter && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            👤 {g.renter}
                          </div>
                        )}
                        {/* Frota real: rastreador principal (nuvem) + TAG GT06 como backup no
                            mesmo veículo — mostra os dois com o mesmo destaque de selo, não
                            como uma nota de rodapé pequena, pra ficar óbvio que são dois
                            dispositivos diferentes no mesmo veículo. */}
                        {/* Só mostra o backup junto quando o filtro está em "Todos" — nos
                            modos "só Rastreadores"/"só TAGs" cada tipo já aparece isolado
                            (ver pickForTypeFilter), então repetir aqui seria redundante. */}
                        {deviceTypeFilter === "all" && g.backup && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); setSelectedImei(g.backup!.info.imei); setActiveTab("mapa"); }}
                            className={`mt-2 pt-2 border-t flex items-center justify-between gap-2 rounded-b-md -mx-3 -mb-2.5 px-3 pb-2 transition-colors ${
                              isBackupSelected ? "bg-primary/10" : "hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <DeviceTypeBadge isTag />
                              <span className="text-[11px] text-muted-foreground truncate">backup deste veículo</span>
                            </div>
                            {g.backup.track && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                                <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: statusLabel(g.backup.track).color }} />
                                {statusLabel(g.backup.track).label}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mapa */}
              <div className="flex-1 relative">
                <LeafletMap
                  id="track-map"
                  style={{ height: "100%", width: "100%" }}
                  onReady={m => { trackMapRef.current = m; setMapReady(true); }}
                />
                {selectedTrack && selectedImei && selectedDevice && (
                  <DeviceDetail
                    track={selectedTrack}
                    device={selectedDevice}
                    displayName={getDisplayName(selectedImei, selectedTrack.deviceName)}
                    displayImei={privacy ? maskImei(selectedImei) : selectedImei}
                    isTag={isSelectedTag}
                    relayLoading={relayLoading.has(selectedImei)}
                    showKm={!!driver && !isSelectedGt06}
                    showRelay={!!driver && !isSelectedGt06}
                    onClose={() => setSelectedImei(null)}
                    onRename={() => { setRenameValue(getDisplayName(selectedImei, selectedTrack.deviceName)); setRenameOpen(true); }}
                    onBlock={() => handleBlock(selectedImei)}
                    onUnblock={() => handleUnblock(selectedImei)}
                    onUpdateKm={() => { setKmValue(String(selectedTrack.mileage ?? "")); setKmOpen(true); }}
                    motoOptions={getRealDataCache().motos
                      .filter(m => m.placa && m.status !== "vendida")
                      .sort((a, b) => a.placa.localeCompare(b.placa))
                      .map(m => ({ id: m.id, placa: m.placa, modelo: m.modelo }))}
                    onLinkMoto={motoId => handleLinkMoto(selectedImei, motoId)}
                    linkMotoLoading={linkMotoLoading}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Histórico ── */}
          <TabsContent value="historico" className="flex-1 min-h-0 mt-0 flex flex-col gap-3 px-4 pt-3 pb-4 data-[state=inactive]:hidden">
            <div className="flex flex-wrap gap-3 items-end shrink-0">
              <div className="grid gap-1.5">
                <Label className="text-xs">Dispositivo</Label>
                <Select value={histImei} onValueChange={setHistImei}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(auth?.devices ?? []).map(d => {
                      const t = tracks.find(x => x.imei === d.imei);
                      return <SelectItem key={d.imei} value={d.imei}>{getDisplayName(d.imei, t?.deviceName)}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">De</Label>
                <Input type="datetime-local" className="w-48" value={histBegin} onChange={e => setHistBegin(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Até</Label>
                <Input type="datetime-local" className="w-48" value={histEnd} onChange={e => setHistEnd(e.target.value)} />
              </div>
              <Button onClick={loadPlayback} disabled={loadingHist}>
                {loadingHist
                  ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  : <History className="h-4 w-4 mr-2" />}
                Carregar trajeto
              </Button>
              {playback.length > 0 && (
                <span className="text-sm text-muted-foreground">{playback.length} pontos</span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <LeafletMap
                id="hist-map"
                style={{
                  height: "100%", width: "100%",
                  borderRadius: "0.75rem",
                  border: "1px solid hsl(var(--border))",
                }}
                onReady={m => { histMapRef.current = m; }}
              />
            </div>
          </TabsContent>

          {/* ── Tab: Alarmes ── */}
          <TabsContent value="alarmes" className="flex-1 min-h-0 mt-0 overflow-auto px-4 pt-3 pb-4 data-[state=inactive]:hidden">
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">Dispositivo</Label>
                <Select value={alarmImei} onValueChange={setAlarmImei}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(auth?.devices ?? []).map(d => {
                      const t = tracks.find(x => x.imei === d.imei);
                      return <SelectItem key={d.imei} value={d.imei}>{getDisplayName(d.imei, t?.deviceName)}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">De</Label>
                <Input type="datetime-local" className="w-48" value={alarmBegin} onChange={e => setAlarmBegin(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Até</Label>
                <Input type="datetime-local" className="w-48" value={alarmEnd} onChange={e => setAlarmEnd(e.target.value)} />
              </div>
              <Button onClick={loadAlarms} disabled={loadingAlarms}>
                {loadingAlarms
                  ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  : <Bell className="h-4 w-4 mr-2" />}
                Buscar alarmes
              </Button>
            </div>

            {!alarms.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Bell className="h-10 w-10 opacity-20 mb-3" />
                <p>Nenhum alarme para exibir</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alarms.map((a, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 flex items-start gap-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.alarmTypeName}</p>
                        {a.address && !privacy && <p className="text-xs text-muted-foreground truncate">{a.address}</p>}
                        <p className="text-xs text-muted-foreground">{fmtTime(a.gpstime)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm">{fmtSpeed(a.speed)}</p>
                        {a.lat && a.lng && (
                          <a
                            href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                            target="_blank" rel="noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            Ver local
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Dialog: Credenciais */}
      <Dialog open={configOpen} onOpenChange={open => {
        setConfigOpen(open);
        if (open) setKmMarginInput(String(DRIVERS[dialogProvider].loadKmSyncConfig(companyId).marginKm));
      }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configurações · {DRIVERS[dialogProvider].label}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-1.5">
              <Label>Rastreador</Label>
              <Select
                value={dialogProvider}
                onValueChange={v => {
                  const p = v as TrackerProvider;
                  setDialogProvider(p);
                  setConfig(DRIVERS[p].loadConfig(companyId) ?? {});
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DRIVERS).map(([key, drv]) => (
                    <SelectItem key={key} value={key}>{drv.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {DRIVERS[dialogProvider].credentialFields.map(f => (
              <div key={f.key} className="grid gap-1.5">
                <Label>{f.label}</Label>
                <Input
                  type={f.type === "password" ? "password" : "text"}
                  placeholder={f.label}
                  value={config[f.key] ?? ""}
                  onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              As credenciais ficam salvas para a empresa toda — configure uma vez e
              todos os usuários entram direto no mapa, sem passar por aqui de novo.
            </p>
            <Button className="w-full" onClick={() => connect(dialogProvider, config)} disabled={connecting}>
              {connecting
                ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                : <Wifi className="h-4 w-4 mr-2" />}
              {connecting ? "Conectando..." : "Conectar"}
            </Button>

            {/* Seção: Sincronização de KM */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Sincronização de quilometragem</span>
              </div>
              <div className="grid gap-1.5">
                <Label>Margem de erro (km)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    placeholder="0"
                    value={kmMarginInput}
                    onChange={e => setKmMarginInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSaveKmConfig()}
                  />
                  <span className="text-sm text-muted-foreground shrink-0">km</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Valor adicionado ao KM do sistema ao sincronizar com o rastreador.
                  {kmConfig.marginKm > 0 && (
                    <span className="font-medium text-primary"> Atual: +{kmConfig.marginKm} km</span>
                  )}
                </p>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={handleSaveKmConfig}>
                <Milestone className="h-3.5 w-3.5 mr-1.5" /> Salvar margem
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Renomear */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Renomear dispositivo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Nome do dispositivo"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O nome vale para a empresa toda e aparece no lugar do nome vindo do
              rastreador (BrasilSat/Velotrack).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cadastrar TAG GT06 */}
      <Dialog open={registerTagOpen} onOpenChange={open => {
        setRegisterTagOpen(open);
        if (!open) { setRegisterImei(""); setRegisterMotoId(""); setRegisterApelido(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cadastrar TAG GT06</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Digite o IMEI impresso no aparelho. Só funciona depois que a TAG já
              ligou e mandou sinal pelo menos uma vez (pode levar alguns minutos
              após ligar).
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">IMEI da TAG</Label>
              <Input
                placeholder="Ex.: 000000000000000"
                value={registerImei}
                onChange={e => setRegisterImei(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Veículo (opcional — dá pra vincular depois)</Label>
              <Select value={registerMotoId || "none"} onValueChange={v => setRegisterMotoId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sem vínculo por enquanto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo por enquanto</SelectItem>
                  {getRealDataCache().motos
                    .filter(m => m.placa && m.status !== "vendida")
                    .sort((a, b) => a.placa.localeCompare(b.placa))
                    .map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.placa} · {m.modelo}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Apelido (opcional — usa "GT06 | placa" do veículo se ficar em branco)</Label>
              <Input
                placeholder='Ex.: GT06 | ABC1D23'
                value={registerApelido}
                onChange={e => setRegisterApelido(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRegisterTag()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterTagOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegisterTag} disabled={registerLoading}>
              {registerLoading ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Vincular TAG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Atualizar km */}
      <Dialog open={kmOpen} onOpenChange={setKmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Atualizar quilometragem</DialogTitle></DialogHeader>
          <div className="pt-2">
            <Input
              type="number"
              min={0}
              placeholder="KM atual"
              value={kmValue}
              onChange={e => setKmValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUpdateKm()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKmOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateKm}>Atualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
