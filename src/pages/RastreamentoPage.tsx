import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import {
  authenticate, getDeviceList, trackDevices, getPlayback, getAlarms,
  setMileage, setRelay,
  loadBrasilSatConfig, saveBrasilSatConfig,
  loadDeviceNames, saveDeviceName,
  type BrasilSatConfig, type BrasilSatToken, type DeviceInfo,
  type DeviceTrack, type PlaybackPoint, type AlarmRecord,
} from "@/lib/brasilsat";
import { loadMotos, loadRentals, loadClients } from "@/lib/store";
import { isPrivacyEnabled, getRealDataCache, useDataCacheSnapshot } from "@/lib/data-cache";
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
  Zap, Battery, Thermometer, Fuel, Pencil, Lock, Unlock, Milestone,
} from "lucide-react";

// ─── Ícones Leaflet ───────────────────────────────────────────────────────────
function makeIcon(color: string, small = false) {
  const s = small ? 30 : 38;
  // Ícone de moto (lucide "bike") sobre um pino circular colorido
  const bikeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(s * 0.6)}" height="${Math.round(s * 0.6)}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${s}px;height:${s + 6}px;">
      <div style="position:absolute;left:0;top:0;width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 3px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">${bikeSvg}</div>
      <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${color};filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));"></div>
    </div>`,
    iconSize: [s, s + 6],
    iconAnchor: [s / 2, s + 6],
    popupAnchor: [0, -(s + 4)],
  });
}

function deviceIcon(t: DeviceTrack) {
  const sc = (t.statusCode ?? "").toLowerCase();
  if (sc.includes("offline")) return makeIcon("#6b7280");
  if (t.speed > 0) return makeIcon("#22c55e");
  if (t.acc === 1) return makeIcon("#f59e0b");
  return makeIcon("#6b7280");
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
  return { label: "Parado · motor desligado", color: "#6b7280" };
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
  relayLoading: boolean;
  onClose: () => void;
  onRename: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onUpdateKm: () => void;
}

function DeviceDetail({
  track, device, displayName, relayLoading,
  onClose, onRename, onBlock, onUnblock, onUpdateKm,
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

  type Row = { label: string; value: React.ReactNode; icon?: React.ReactNode };
  const rows: Row[] = [
    ...(track.alarm ? [{ label: "Selecionar", value: track.alarm }] : []),
    { label: "Motor", value: motorStr, icon: <Zap className="h-3.5 w-3.5" /> },
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
    {
      label: "IMEI",
      value: <span className="font-mono text-[11px]">{track.imei}</span>,
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
            <span className="font-bold text-sm text-primary">{displayName}</span>
            {device.deviceType && (
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
      <div className="px-3 py-2.5 border-t space-y-1">
        <button
          onClick={onUpdateKm}
          className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1.5 rounded-md transition-colors"
        >
          <Milestone className="h-3.5 w-3.5" /> Atualizar quilometragem
        </button>

        {isBlocked ? (
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
        )}
      </div>
    </div>
  );
}

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface AuthState { token: BrasilSatToken; devices: DeviceInfo[] }

// ─── Página principal ─────────────────────────────────────────────────────────
export default function RastreamentoPage() {
  // Re-render quando o modo demo é ativado/desativado
  useDataCacheSnapshot();
  const privacy = isPrivacyEnabled();

  const [auth, setAuth]             = useState<AuthState | null>(null);
  const [config, setConfig]         = useState<BrasilSatConfig>(
    () => loadBrasilSatConfig() ?? { account: "", password: "" },
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [tracks, setTracks]             = useState<DeviceTrack[]>([]);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [selectedImei, setSelectedImei] = useState<string | null>(null);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");

  const [customNames, setCustomNames] = useState<Record<string, string>>(() => loadDeviceNames());

  const [renameOpen, setRenameOpen]   = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [kmOpen, setKmOpen]           = useState(false);
  const [kmValue, setKmValue]         = useState("");
  const [relayLoading, setRelayLoading] = useState<Set<string>>(new Set());

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
  const fetchTracksRef  = useRef<(() => Promise<void>) | null>(null);

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
    // Nome cadastrado na BrasilSat (da lista ou do track)
    const brasilsatName = auth?.devices.find(d => d.imei === imei)?.deviceName || trackDeviceName || "";
    if (brasilsatName && brasilsatName !== imei) return brasilsatName;
    // Fallback: apelido local (se BrasilSat não tiver nome cadastrado)
    return customNames[imei] || imei;
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

  // ── Locatário atual do dispositivo (via placa → moto → locação ativa) ────
  const getRenterName = useCallback((imei: string, trackDeviceName?: string): string => {
    // Sempre usa o nome REAL do dispositivo da BrasilSat para o lookup
    const realName = (auth?.devices.find(d => d.imei === imei)?.deviceName || trackDeviceName || customNames[imei] || imei).toUpperCase();
    const norm = normalizePlate(realName);
    if (!norm) return "";
    for (const [plate, info] of activeRentalsByPlate) {
      if (norm.includes(plate)) return info.renter;
    }
    return "";
  }, [activeRentalsByPlate, auth, customNames]);

  // ── Token ─────────────────────────────────────────────────────────────────
  const getValidToken = useCallback(async (): Promise<string> => {
    if (auth && Date.now() < auth.token.expires_at) return auth.token.access_token;
    const saved = loadBrasilSatConfig();
    if (!saved?.account) throw new Error("Configure as credenciais primeiro");
    const token = await authenticate(saved);
    setAuth(prev => prev ? { ...prev, token } : null);
    return token.access_token;
  }, [auth]);

  // ── Sincronização km moto → rastreador ────────────────────────────────────
  const syncKm = useCallback(async (freshTracks: DeviceTrack[]) => {
    // Usa dados REAIS para que o sync funcione mesmo com modo demo ativo
    const motos = getRealDataCache().motos;
    if (!motos.length || !freshTracks.length) return;
    let token: string;
    try { token = await getValidToken(); } catch { return; }

    for (const track of freshTracks) {
      // Nome REAL do dispositivo (não o mascarado)
      const realName = (auth?.devices.find(d => d.imei === track.imei)?.deviceName || track.deviceName || customNames[track.imei] || track.imei).toUpperCase();
      const moto = motos.find(m => m.placa && realName.includes(m.placa.toUpperCase()));
      if (!moto || moto.kmAtual == null) continue;
      if (syncedKmRef.current.get(track.imei) === moto.kmAtual) continue;
      const trackerKm = track.mileage ?? 0;
      if (moto.kmAtual > trackerKm) {
        try {
          await setMileage(token, track.imei, moto.kmAtual);
          syncedKmRef.current.set(track.imei, moto.kmAtual);
          toast.success(`KM sincronizado: ${getDisplayName(track.imei)} → ${moto.kmAtual.toLocaleString("pt-BR")} km`);
        } catch (e: any) {
          console.warn("syncKm:", e.message);
        }
      }
    }
  }, [getValidToken, customNames, getDisplayName, auth]);

  // ── Conexão ────────────────────────────────────────────────────────────────
  const connect = useCallback(async (cfg: BrasilSatConfig) => {
    if (!cfg.account || !cfg.password) { toast.error("Informe conta e senha"); return; }
    setConnecting(true);
    try {
      const token   = await authenticate(cfg);
      const devices = await getDeviceList(token.access_token);
      setAuth({ token, devices });
      saveBrasilSatConfig(cfg);
      setConfigOpen(false);
      toast.success(`Conectado · ${devices.length} dispositivo(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha na conexão");
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Buscar posições ────────────────────────────────────────────────────────
  const fetchTracks = useCallback(async () => {
    if (!auth) return;
    setLoadingTrack(true);
    try {
      const token = await getValidToken();
      const imeis = auth.devices.map(d => d.imei).filter(Boolean);
      if (!imeis.length) return;
      const result = await trackDevices(token, imeis);
      setTracks(result);
      syncKm(result);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao buscar posições");
    } finally {
      setLoadingTrack(false);
    }
  }, [auth, getValidToken, syncKm]);

  // ── Mantém ref da função atualizada (evita stale closure no setInterval) ──
  useEffect(() => { fetchTracksRef.current = fetchTracks; }, [fetchTracks]);

  // ── Atualiza marcadores no mapa ──────────────────────────────────────────
  useEffect(() => {
    const map = trackMapRef.current;
    if (!map) return;
    const valid = tracks.filter(t => t.lat && t.lng);
    const seen = new Set<string>();
    let isFirst = trackMarkersRef.current.size === 0 && valid.length > 0;

    valid.forEach(t => {
      seen.add(t.imei);
      const name = getDisplayName(t.imei, t.deviceName);
      const icon = deviceIcon(t);
      const existing = trackMarkersRef.current.get(t.imei);
      if (existing) {
        existing.setLatLng([t.lat, t.lng]);
        existing.setIcon(icon);
        (existing as any)._tooltip && existing.setTooltipContent(name);
      } else {
        const m = L.marker([t.lat, t.lng], { icon })
          .addTo(map)
          .on("click", () => setSelectedImei(t.imei));
        m.bindTooltip(name, { permanent: true, direction: "top", offset: [0, -24], className: "leaflet-tooltip-device" });
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
  }, [tracks, getDisplayName, mapReady]);

  // ── Centraliza no dispositivo selecionado ────────────────────────────────
  useEffect(() => {
    if (!selectedImei) return;
    const t = tracks.find(t => t.imei === selectedImei);
    if (!t?.lat || !t?.lng) return;
    // Delay garante que invalidateSize da troca de aba já ocorreu
    const id = setTimeout(() => {
      const map = trackMapRef.current;
      if (map) map.setView([t.lat, t.lng], Math.max(map.getZoom(), 15), { animate: true });
    }, 80);
    return () => clearTimeout(id);
  }, [selectedImei, tracks]);

  // ── invalidateSize ao trocar de aba ─────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      if (activeTab === "mapa") trackMapRef.current?.invalidateSize();
      else if (activeTab === "historico") histMapRef.current?.invalidateSize();
    }, 60);
    return () => clearTimeout(id);
  }, [activeTab]);

  // Intervalo dinâmico: mais rápido quando há dispositivos em movimento
  const anyMoving = tracks.some(t => (t.speed ?? 0) > 0);
  const refreshSecs = anyMoving ? REFRESH_SECS_MOVING : REFRESH_SECS_IDLE;
  const refreshSecsRef = useRef(refreshSecs);
  useEffect(() => { refreshSecsRef.current = refreshSecs; }, [refreshSecs]);

  // ── Auto-refresh com countdown ────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    fetchTracks();
    setCountdown(refreshSecsRef.current);
    const tickId = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          fetchTracksRef.current?.();
          return refreshSecsRef.current;
        }
        // Se mudou para modo "movimento" e o countdown atual está acima do novo limite, reduz
        return Math.min(c - 1, refreshSecsRef.current);
      });
    }, 1000);
    return () => clearInterval(tickId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  // ── Histórico ─────────────────────────────────────────────────────────────
  const loadPlayback = async () => {
    if (!histImei) { toast.error("Selecione um dispositivo"); return; }
    setLoadingHist(true);
    try {
      const token = await getValidToken();
      const pts = await getPlayback(
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
    if (!alarmImei) { toast.error("Selecione um dispositivo"); return; }
    setLoadingAlarms(true);
    try {
      const token = await getValidToken();
      const result = await getAlarms(
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

  // ── Inicialização ─────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadBrasilSatConfig();
    if (saved?.account) connect(saved);
    else setConfigOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ações de dispositivo ──────────────────────────────────────────────────
  const handleRename = () => {
    if (!selectedImei) return;
    const name = renameValue.trim();
    if (!name) { toast.error("Informe um nome"); return; }
    saveDeviceName(selectedImei, name);
    const updated = loadDeviceNames();
    setCustomNames(updated);
    const marker = trackMarkersRef.current.get(selectedImei);
    marker?.setTooltipContent(name);
    setRenameOpen(false);
    toast.success("Nome atualizado");
  };

  const handleUpdateKm = async () => {
    if (!selectedImei) return;
    const km = parseFloat(kmValue);
    if (isNaN(km) || km < 0) { toast.error("KM inválido"); return; }
    try {
      const token = await getValidToken();
      await setMileage(token, selectedImei, km);
      syncedKmRef.current.set(selectedImei, km);
      setKmOpen(false);
      toast.success(`KM atualizado: ${km.toLocaleString("pt-BR")} km`);
      fetchTracks();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar KM");
    }
  };

  const handleBlock = async (imei: string) => {
    setRelayLoading(prev => new Set(prev).add(imei));
    try {
      const token = await getValidToken();
      await setRelay(token, imei, 0);
      toast.success("Dispositivo bloqueado");
      fetchTracks();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao bloquear");
    } finally {
      setRelayLoading(prev => { const s = new Set(prev); s.delete(imei); return s; });
    }
  };

  const handleUnblock = async (imei: string) => {
    setRelayLoading(prev => new Set(prev).add(imei));
    try {
      const token = await getValidToken();
      await setRelay(token, imei, 1);
      toast.success("Dispositivo desbloqueado");
      fetchTracks();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao desbloquear");
    } finally {
      setRelayLoading(prev => { const s = new Set(prev); s.delete(imei); return s; });
    }
  };

  // ── Listas filtradas ──────────────────────────────────────────────────────
  const onlineCount  = tracks.filter(t => !(t.statusCode ?? "").toLowerCase().includes("offline")).length;
  const offlineCount = (auth?.devices.length ?? 0) - onlineCount;

  const filteredDevices = (auth?.devices ?? []).filter(dev => {
    const track = tracks.find(t => t.imei === dev.imei);
    const sc = (track?.statusCode ?? "").toLowerCase();
    const offline = sc.includes("offline") || (!track?.acc && !track?.speed);
    if (deviceFilter === "online" && offline) return false;
    if (deviceFilter === "offline" && !offline) return false;
    const q = deviceSearch.toLowerCase().trim();
    if (!q) return true;
    const name = getDisplayName(dev.imei, track?.deviceName).toLowerCase();
    const renter = getRenterName(dev.imei, track?.deviceName).toLowerCase();
    return name.includes(q) || renter.includes(q);
  });

  const selectedTrack  = tracks.find(t => t.imei === selectedImei) ?? null;
  const selectedDevice = auth?.devices.find(d => d.imei === selectedImei) ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Cabeçalho */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b bg-background">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Rastreamento</h2>
          {auth ? (
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 text-[11px]">
              <Wifi className="h-2.5 w-2.5 mr-1" />
              Conectado · {auth.devices.length} dispositivos · {onlineCount} online
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted text-muted-foreground text-[11px]">
              <WifiOff className="h-2.5 w-2.5 mr-1" /> Desconectado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {auth && (
            <Button size="sm" variant="ghost" onClick={fetchTracks} disabled={loadingTrack}>
              <RefreshCw className={`h-4 w-4 ${loadingTrack ? "animate-spin" : ""}`} />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
            <Settings className="h-4 w-4 mr-1.5" /> Configurações
          </Button>
        </div>
      </div>

      {/* Corpo */}
      {!auth ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-sm">
            <MapPin className="h-14 w-14 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground">Configure as credenciais da BrasilSat para começar</p>
            <Button onClick={() => setConfigOpen(true)}>
              <Settings className="h-4 w-4 mr-2" /> Configurar
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 w-fit shrink-0">
            <TabsTrigger value="mapa"><MapPin className="h-3.5 w-3.5 mr-1.5" />Mapa</TabsTrigger>
            <TabsTrigger value="historico"><History className="h-3.5 w-3.5 mr-1.5" />Histórico</TabsTrigger>
            <TabsTrigger value="alarmes"><Bell className="h-3.5 w-3.5 mr-1.5" />Alarmes</TabsTrigger>
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
                          ? `Todos (${auth.devices.length})`
                          : f === "online"
                          ? `Online (${onlineCount})`
                          : `Offline (${offlineCount})`}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { fetchTracks(); setCountdown(refreshSecs); }}
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
                  {filteredDevices.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-8">Nenhum dispositivo</p>
                  )}
                  {filteredDevices.map(dev => {
                    const track = tracks.find(t => t.imei === dev.imei);
                    const { color } = track ? statusLabel(track) : { color: "#6b7280" };
                    const since = track ? timeSince(track.gpstime) : "—";
                    const isSelected = dev.imei === selectedImei;
                    const name = getDisplayName(dev.imei, track?.deviceName);
                    const renter = getRenterName(dev.imei, track?.deviceName);
                    return (
                      <button
                        key={dev.imei}
                        onClick={() => {
                          const next = isSelected ? null : dev.imei;
                          setSelectedImei(next);
                          if (next) setActiveTab("mapa");
                        }}
                        className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/60 transition-colors ${
                          isSelected ? "bg-primary/10 border-l-2 border-l-primary" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate pr-2">{name}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{since}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-[11px] text-muted-foreground truncate">
                            {track ? statusLabel(track).label : "Sem dados"}
                          </span>
                        </div>
                        {renter && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            👤 {renter}
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
                    relayLoading={relayLoading.has(selectedImei)}
                    onClose={() => setSelectedImei(null)}
                    onRename={() => { setRenameValue(getDisplayName(selectedImei, selectedTrack.deviceName)); setRenameOpen(true); }}
                    onBlock={() => handleBlock(selectedImei)}
                    onUnblock={() => handleUnblock(selectedImei)}
                    onUpdateKm={() => { setKmValue(String(selectedTrack.mileage ?? "")); setKmOpen(true); }}
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
                    {auth.devices.map(d => {
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
                    {auth.devices.map(d => {
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
                        {a.address && <p className="text-xs text-muted-foreground truncate">{a.address}</p>}
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
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Credenciais BrasilSat GPS</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-1.5">
              <Label>Conta</Label>
              <Input
                placeholder="Usuário BrasilSat"
                value={config.account}
                onChange={e => setConfig(c => ({ ...c, account: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Senha</Label>
              <Input
                type="password"
                placeholder="Senha BrasilSat"
                value={config.password}
                onChange={e => setConfig(c => ({ ...c, password: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              As credenciais são salvas localmente neste dispositivo.
            </p>
            <Button className="w-full" onClick={() => connect(config)} disabled={connecting}>
              {connecting
                ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                : <Wifi className="h-4 w-4 mr-2" />}
              {connecting ? "Conectando..." : "Conectar"}
            </Button>
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
              O nome é salvo localmente neste dispositivo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename}>Salvar</Button>
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
