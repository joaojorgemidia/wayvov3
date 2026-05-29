import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { saveMotos } from "@/lib/store";
import { Motorcycle, OilChangeRecord } from "@/lib/types";
import { formatDate } from "@/lib/alerts";
import {
  ChevronDown, ChevronRight, Pencil, Droplets, Search, Settings,
  Copy, Check, MessageCircle, AlertTriangle, TrendingUp, Activity,
  Repeat, Send, Phone, BellOff, Clock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  getSnoozeUntil, snoozeMoto, clearSnooze, onSnoozeChange, isSnoozed,
} from "@/lib/oil-snooze";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/InfoTooltip";
import {
  HowItWorksDialog,
  HowItWorksInlineButton,
  HowItWorksContent,
} from "@/components/HowItWorksDialog";
import {
  BrandConfig, OilGlobalConfig, OilSituation,
  loadBrandConfig, saveBrandConfig, loadGlobalConfig, saveGlobalConfig,
  brandConfigFor, lastOilChange, getOilStatus,
  computeKpis, keywordOfTheDay,
  buildReincidenciaMessage, clientLateCount, clientAvgLateKm,
} from "@/lib/oil-kpis";
import { buildWhatsAppUrl, sanitizeWhatsAppNumber } from "@/lib/whatsapp";
import { buildAllTokens, applyTokens } from "@/lib/message-tokens";
import { maskPhone } from "@/lib/masks";
import { TokenPalette } from "@/components/TokenPalette";
import { useCollections } from "@/hooks/useCollections";
import { CollectionRuleEditor } from "@/components/CollectionRuleEditor";
import { MessagePopup } from "@/components/MessagePopup";

function OleoRuleSection() {
  const { rules, saveRule } = useCollections();
  const [rule, setRule] = useState(rules.oleo);
  useEffect(() => { setRule(rules.oleo); }, [rules.oleo]);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
          <Repeat className="h-4 w-4 text-warning" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Régua de cobrança da Troca de Óleo</h3>
          <p className="text-[11px] text-muted-foreground">
            Etapas e mensagens enviadas para locatários em atraso. Compartilhada com Lista de tarefas › Configurações.
          </p>
        </div>
      </div>
      <CollectionRuleEditor
        hideTitle
        rule={rule}
        onChange={setRule}
        onSave={async (r) => { await saveRule(r); toast.success("Régua de Troca de Óleo salva"); }}
      />
    </section>
  );
}

// ============== Conteúdo "Como funciona" ==============
const TROCA_OLEO_HELP: HowItWorksContent = {
  pageTitle: "Troca de Óleo",
  intro: (
    <>
      Esta página avisa quando cada moto da sua frota precisa trocar o óleo,
      mostra quem está atrasado e cria a mensagem pronta para você enviar ao
      locatário pelo WhatsApp.
    </>
  ),
  steps: [
    {
      title: "1. Cada marca tem um limite próprio de km",
      description: (
        <>
          Você define em "Intervalos por marca" a cada quantos km cada marca
          deve trocar o óleo (por exemplo, Honda a cada 1.000 km e Yamaha a cada
          2.000 km). O sistema soma esse valor ao km da última troca para saber
          em que km a próxima troca precisa acontecer.
        </>
      ),
    },
    {
      title: "2. O sistema compara com o km atual da moto",
      description: (
        <>
          Toda vez que você atualiza o km da moto, o sistema mostra um destes
          status: <strong>Em dia</strong> (ainda falta bastante para o limite),
          <strong> Atenção</strong> (está chegando no limite, dentro da margem
          de tolerância) ou <strong>passou do limite</strong> (aí ele faz a
          verificação do passo 3 para decidir se já é vencida).
        </>
      ),
    },
    {
      title: "3. Quando passou do limite, o sistema decide se está vencida",
      description: (
        <>
          Se o locatário tem um histórico bom (várias trocas seguidas feitas no
          prazo), o sistema sabe quantos km por dia ele costuma rodar e usa isso
          para prever se o atraso vai virar problema. Se o locatário é novo ou
          já atrasou antes, o sistema usa uma regra mais simples: passou do
          limite e ficou X dias sem trocar, está <strong>vencida</strong>.
        </>
      ),
    },
    {
      title: "4. O sistema cria a mensagem de cobrança pronta",
      description: (
        <>
          Quando uma moto fica vencida, basta clicar em "Copiar mensagem" e o
          texto já vem pronto. Se for a primeira vez do locatário, a mensagem
          pede uma foto do painel. Se ele já atrasou outras vezes, a mensagem
          pede um vídeo da moto mostrando uma palavra-chave do dia (assim você
          tem certeza que o vídeo é atual e não foi gravado antes).
        </>
      ),
    },
    {
      title: "5. Os indicadores no topo são atualizados sozinhos",
      description: (
        <>
          A cada troca que você registra, os números no topo da página
          (quantas estão vencidas agora, quantas trocas foram feitas no prazo,
          atraso médio em km e quem mais costuma atrasar) são recalculados
          automaticamente. Você não precisa fazer nada para isso.
        </>
      ),
    },
  ],
  examples: [
    {
      title: "Está chegando perto do limite",
      body: (
        <>
          Uma Honda que trocou óleo aos 15.000 km precisa trocar de novo aos
          16.000 km. Se o painel marca <strong>15.950 km</strong>, faltam só
          50 km — o sistema mostra <strong>"Atenção"</strong> para você já avisar
          o locatário.
        </>
      ),
    },
    {
      title: "Locatário bom, mas passou um pouco do limite",
      body: (
        <>
          Locatário que sempre troca no prazo está com a moto 200 km além do
          limite. Como ele roda em média 100 km por dia, em 10 dias vai estar
          1.200 km além do limite — longe demais. O sistema marca como
          <strong> vencida</strong> para você cobrar logo.
        </>
      ),
    },
    {
      title: "Locatário novo ou que já atrasou antes",
      body: (
        <>
          Como o sistema não tem como confiar no ritmo dele, usa a regra simples:
          se passou do limite e ficou <strong>mais de 10 dias</strong> sem
          registrar nova troca, está <strong>vencida</strong>.
        </>
      ),
    },
    {
      title: "Locatário que já atrasou várias vezes",
      body: (
        <>
          Quando você copia a mensagem, o texto pede um vídeo da moto e dentro
          dele o locatário precisa mostrar uma palavra-chave do dia (por
          exemplo, "girassol") junto com a data e o km do painel. Isso garante
          que o vídeo foi gravado naquele dia, não é antigo.
        </>
      ),
    },
  ],
  glossary: [
    {
      term: "Tolerância (±km)",
      definition:
        "Margem de km antes e depois do limite que o sistema aceita como troca no prazo. Por exemplo, se a tolerância é 70 km, trocar entre 70 km antes e 70 km depois do limite ainda conta como certo.",
    },
    {
      term: "Padrão da frota (km/semana)",
      definition:
        "Quantos km uma moto roda por semana, em média, na sua frota. O sistema usa esse número para fazer previsões quando ainda não conhece o ritmo de um locatário novo.",
    },
    {
      term: "Dias para VENCIDA",
      definition:
        "Quantos dias o sistema espera, depois que a moto passou do limite de km, antes de marcar como vencida. Vale para locatários novos ou que já atrasaram antes.",
    },
    {
      term: "Trocas consecutivas conformes",
      definition:
        "Quantas trocas seguidas no prazo o locatário precisa ter para o sistema considerar que ele é confiável. A partir daí, o sistema passa a usar o ritmo real dele em vez da regra de dias.",
    },
    {
      term: "Período da palavra-chave",
      definition:
        "Por quantos dias a mesma palavra-chave continua valendo antes de o sistema sortear uma nova. Se for 1 dia, troca de palavra todo dia; se for 7, troca toda semana.",
    },
  ],
};

// ============== Página ==============
export default function TrocaOleoPage() {
  const cache = useDataCacheSnapshot();
  const motos = cache.motos.filter((m) => m.status !== "vendida" && m.status !== "inativa");
  const rentals = cache.rentals;
  const clients = cache.clients;

  const [brandConfig, setBrandConfig] = useState<Record<string, BrandConfig>>(() => loadBrandConfig());
  const [globalConfig, setGlobalConfig] = useState<OilGlobalConfig>(() => loadGlobalConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // map motoId -> {clienteId, clienteNome}
  const motoClientMap = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; telefone: string }>();
    rentals
      .filter((r) => r.status === "ativa")
      .forEach((r) => {
        const c = clients.find((cl) => cl.id === r.clienteId);
        if (c) map.set(r.motoId, { id: c.id, nome: c.nome, telefone: c.telefone || "" });
      });
    return map;
  }, [rentals, clients]);

  const kmBounds = useMemo(() => {
    const kms = motos.map((m) => m.kmAtual ?? 0);
    const max = kms.length ? Math.max(...kms) : 100000;
    return { min: 0, max: Math.max(max, 1000) };
  }, [motos]);

  const [search, setSearch] = useState("");
  const [kmRange, setKmRange] = useState<[number, number]>([kmBounds.min, kmBounds.max]);
  const [situacaoFilter, setSituacaoFilter] = useState<"todas" | OilSituation>("todas");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editMoto, setEditMoto] = useState<Motorcycle | null>(null);
  const [registerMoto, setRegisterMoto] = useState<Motorcycle | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  // Popup unificado (sucesso de troca OU cobrança de atraso)
  const [messagePopup, setMessagePopup] = useState<{
    open: boolean;
    title: string;
    mensagem: string;
    placa: string;
    cliente: string;
    telefone: string;
    highlights: { label: string; value: string; tone: "primary" | "warning" | "danger" }[];
    keyword?: string;
    templateKey: string;
    tokens: Record<string, string>;
    motoId?: string;
  }>({ open: false, title: "", mensagem: "", placa: "", cliente: "", telefone: "", highlights: [], templateKey: "", tokens: {} });

  // Snooze: adiar notificação de troca vencida → move para "em dia" por N dias.
  // Usa oil-snooze.ts como fonte de verdade (mesma chave que SnoozeButton usa).
  const buildSnoozeMap = () => {
    const map: Record<string, string> = {};
    try {
      const raw = localStorage.getItem("wayvo:oleo-snooze");
      const parsed: Record<string, string> = raw ? JSON.parse(raw) : {};
      const today = new Date().toISOString().slice(0, 10);
      for (const [id, until] of Object.entries(parsed)) {
        if (until >= today) map[id] = until;
      }
    } catch { /* ignora */ }
    return map;
  };
  const [snoozeMap, setSnoozeMap] = useState<Record<string, string>>(buildSnoozeMap);
  const [snoozeDialog, setSnoozeDialog] = useState<{ open: boolean; moto: Motorcycle | null; days: number }>({
    open: false, moto: null, days: 3,
  });

  // Mantém snoozeMap em sincronia quando SnoozeButton (ou outra aba) gravar
  useEffect(() => onSnoozeChange(() => setSnoozeMap(buildSnoozeMap())), []);

  function handleSnooze(moto: Motorcycle, days: number) {
    snoozeMoto(moto.id, days);          // grava na chave wayvo:oleo-snooze
    setSnoozeMap(buildSnoozeMap());     // atualiza estado imediatamente
    const until = new Date();
    until.setDate(until.getDate() + days);
    setSnoozeDialog({ open: false, moto: null, days: 3 });
    toast.success(`Adiada por ${days} dia${days !== 1 ? "s" : ""} — volta em ${until.toLocaleDateString("pt-BR")}`);
  }

  // Motos já contactadas (popup fechado) → vão para o FINAL da fila para
  // ajudar a entender quem já entramos em contato. Persistido em localStorage.
  const CONTACTED_KEY = "wayvo:troca-oleo:contacted";
  const [contactedAt, setContactedAt] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(CONTACTED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const markContacted = (motoId?: string) => {
    if (!motoId) return;
    setContactedAt((prev) => {
      const next = { ...prev, [motoId]: Date.now() };
      try { localStorage.setItem(CONTACTED_KEY, JSON.stringify(next)); } catch { /* ignora */ }
      return next;
    });
  };

  // Mantém o slider acompanhando os limites reais da frota:
  // - se o usuário estava no máximo anterior (ou ainda no inicial 0), expande para o novo máximo
  // - clampa para dentro dos novos limites
  const prevBoundsRef = useRef<{ min: number; max: number }>({ min: kmBounds.min, max: kmBounds.max });
  useEffect(() => {
    setKmRange(([lo, hi]) => {
      const prev = prevBoundsRef.current;
      const newLo = Math.max(kmBounds.min, lo);
      const wasAtMax = hi === 0 || hi >= prev.max;
      const newHi = wasAtMax ? kmBounds.max : Math.min(kmBounds.max, Math.max(hi, kmBounds.min));
      prevBoundsRef.current = { min: kmBounds.min, max: kmBounds.max };
      return [newLo, newHi];
    });
  }, [kmBounds.max, kmBounds.min]);

  // Status calculado por moto (com snooze aplicado)
  const motoStatusMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getOilStatus>>();
    const msDia = 1000 * 60 * 60 * 24;
    const todayMs = new Date().setHours(0, 0, 0, 0);
    motos.forEach((m) => {
      let status = getOilStatus(m, brandConfig, globalConfig, rentals);
      const snoozeUntil = snoozeMap[m.id];
      if (snoozeUntil && status.situation === "vencida") {
        const snoozeMs = new Date(snoozeUntil).setHours(0, 0, 0, 0);
        if (todayMs <= snoozeMs) {
          // Ainda no período de adiamento (inclusive o último dia) → exibe como "em dia"
          status = { ...status, situation: "ok", label: `Adiada até ${formatDate(snoozeUntil)}` };
        } else {
          // Adiamento expirou → dias de atraso contam a partir do dia seguinte ao prazo
          const diasAposSnooze = Math.floor((todayMs - snoozeMs) / msDia) + 1;
          const kmPart = status.kmAtraso > 0 ? ` · +${status.kmAtraso.toLocaleString("pt-BR")} km` : "";
          status = {
            ...status,
            diasDesdeUltima: diasAposSnooze,
            label: `Vencida (${diasAposSnooze} dia${diasAposSnooze !== 1 ? "s" : ""} vencido${kmPart})`,
          };
        }
      }
      map.set(m.id, status);
    });
    return map;
  }, [motos, brandConfig, globalConfig, rentals, snoozeMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return motos
      .filter((m) => {
        if (!q) return true;
        if (m.placa.toUpperCase().startsWith(q)) return true;
        const nome = motoClientMap.get(m.id)?.nome?.toUpperCase() ?? "";
        return nome.includes(q);
      })
      .filter((m) => {
        // Ao buscar por placa/cliente, ignora o filtro de KM para não esconder
        // motos cujo kmAtual saiu do intervalo do slider.
        if (q) return true;
        const km = m.kmAtual ?? 0;
        return km >= kmRange[0] && km <= kmRange[1];
      })
      .filter((m) => {
        if (situacaoFilter === "todas") return true;
        return motoStatusMap.get(m.id)?.situation === situacaoFilter;
      })
      .sort((a, b) => {
        // Motos já contactadas (popup fechado) vão para o FINAL da fila.
        // Se houver uma troca registrada APÓS o contato, considera "resetado".
        const la = lastOilChange(a);
        const lb = lastOilChange(b);
        const ta = la ? new Date(la.data).getTime() : 0;
        const tb = lb ? new Date(lb.data).getTime() : 0;
        const rawCa = contactedAt[a.id] ?? 0;
        const rawCb = contactedAt[b.id] ?? 0;
        const ca = rawCa > ta ? rawCa : 0;
        const cb = rawCb > tb ? rawCb : 0;
        if ((ca > 0) !== (cb > 0)) return ca > 0 ? 1 : -1;
        if (ca && cb && ca !== cb) return ca - cb; // mais antigo contato primeiro
        // Quem cadastrou troca mais recentemente vai para o FINAL da fila.
        // Sem registro => topo (precisa trocar primeiro).
        if (ta !== tb) return ta - tb;
        return a.placa.localeCompare(b.placa);
      });
  }, [motos, search, kmRange, situacaoFilter, motoStatusMap, motoClientMap, contactedAt]);

  const vencidasList = useMemo(
    () => filtered.filter(
      (m) => motoStatusMap.get(m.id)?.situation === "vencida" && motoClientMap.has(m.id),
    ),
    [filtered, motoStatusMap, motoClientMap],
  );
  const emDiaList = useMemo(
    () =>
      filtered.filter(
        (m) =>
          motoStatusMap.get(m.id)?.situation !== "vencida" &&
          motoClientMap.has(m.id),
      ),
    [filtered, motoStatusMap, motoClientMap],
  );
  const estoqueList = useMemo(
    () => filtered.filter((m) => !motoClientMap.has(m.id)),
    [filtered, motoClientMap],
  );

  // KPIs
  const kpis = useMemo(
    () => computeKpis(motos, rentals, brandConfig, globalConfig),
    [motos, rentals, brandConfig, globalConfig],
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCSV() {
    const rows = [
      ["Placa", "Modelo", "Locatário", "Situação", "Km atual", "Última troca km", "Última troca data", "Próxima troca km"],
    ];
    filtered.forEach((m) => {
      const last = lastOilChange(m);
      const status = motoStatusMap.get(m.id);
      rows.push([
        m.placa,
        m.modelo,
        motoClientMap.get(m.id)?.nome ?? "",
        status?.label ?? "",
        String(m.kmAtual ?? 0),
        last ? String(last.km) : "",
        last ? formatDate(last.data) : "",
        String(status?.proxOleoKm ?? 0),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `troca-oleo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function persistMotos(updated: Motorcycle[]) {
    saveMotos(updated);
  }

  function handleSaveEdit(updated: Motorcycle) {
    const next = cache.motos.map((m) => (m.id === updated.id ? updated : m));
    persistMotos(next);
    setEditMoto(null);
    toast.success("Moto atualizada");
  }

  function handleRegisterOilChange(moto: Motorcycle, data: string, km: number, trocouFiltro: boolean) {
    const record: OilChangeRecord = { id: crypto.randomUUID(), data, km };
    const updated: Motorcycle = {
      ...moto,
      historicoOleo: [...(moto.historicoOleo || []), record],
      ultimaTrocaOleo: data,
      kmTrocaOleo: km,
      // Preserva o maior valor: troca de óleo é registrada NO km informado,
      // mas nunca deve reduzir o hodômetro acumulado da moto.
      kmAtual: Math.max(moto.kmAtual ?? 0, km),
    };
    const next = cache.motos.map((m) => (m.id === updated.id ? updated : m));
    persistMotos(next);
    setRegisterMoto(null);
    setNewDialogOpen(false);
    // Remove snooze ao registrar nova troca
    if (isSnoozed(moto.id)) {
      clearSnooze(moto.id);
      setSnoozeMap(buildSnoozeMap());
    }

    const cfg = brandConfigFor(moto.modelo, brandConfig);
    const proxOleoKm = km + cfg.oilKm;
    const cliente = motoClientMap.get(moto.id)?.nome ?? "";
    const telefone = motoClientMap.get(moto.id)?.telefone ?? "";
    const dataFmt = formatDate(data);

    // Excesso: quanto passou do limite (moto ainda tem histórico antigo aqui)
    const ultimaTroca = lastOilChange(moto);
    const limiteKm = ultimaTroca != null ? ultimaTroca.km + cfg.oilKm : null;
    const excesoKm = limiteKm != null && km > limiteKm ? km - limiteKm : 0;

    const linhas: string[] = [];
    linhas.push(`Olá, ${cliente || "[NOME]"}! 👋`);
    linhas.push("");
    linhas.push(`Sua moto *${moto.placa}*${moto.modelo ? ` (${moto.modelo})` : ""} está com o óleo novo. ✅`);
    linhas.push("");
    if (excesoKm > 0) {
      linhas.push(`⚠️ _Troca realizada com *${excesoKm.toLocaleString("pt-BR")} km* além do limite recomendado_`);
      linhas.push("");
    }
    if (cfg.filterKm && trocouFiltro) {
      const proxFiltroKm = km + cfg.filterKm;
      linhas.push(`_(realizada em ${km.toLocaleString("pt-BR")} Km · ${dataFmt})_`);
      linhas.push("");
      linhas.push("📍 *PRÓXIMAS MANUTENÇÕES:*");
      linhas.push(`🔧 Troca de óleo → *${proxOleoKm.toLocaleString("pt-BR")} Km*`);
      linhas.push(`🔴 Troca de filtro → *${proxFiltroKm.toLocaleString("pt-BR")} Km*`);
    } else {
      linhas.push(`_(realizada em ${km.toLocaleString("pt-BR")} Km · ${dataFmt})_`);
      linhas.push("");
      linhas.push("📍 *PRÓXIMA MANUTENÇÃO:*");
      linhas.push(`🔧 Troca de óleo → *${proxOleoKm.toLocaleString("pt-BR")} Km*`);
    }
    linhas.push("");
    linhas.push("Qualquer dúvida, estamos à disposição. 🏍️");
    const mensagem = linhas.join("\n");

    const highlights: { label: string; value: string; tone: "primary" | "warning" | "danger" }[] = [
      { label: "Próxima troca de óleo", value: `${proxOleoKm.toLocaleString("pt-BR")} km`, tone: "primary" },
    ];
    if (excesoKm > 0) {
      highlights.push({ label: "Passou do limite", value: `+${excesoKm.toLocaleString("pt-BR")} km`, tone: "danger" });
    }
    if (cfg.filterKm && trocouFiltro) {
      highlights.push({
        label: "Próxima troca de filtro",
        value: `${(km + cfg.filterKm).toLocaleString("pt-BR")} km`,
        tone: "warning",
      });
    }

    setMessagePopup({
      open: true,
      title: "Mensagem para o Locatário",
      mensagem,
      placa: moto.placa,
      cliente,
      telefone,
      highlights,
      templateKey: cfg.filterKm && trocouFiltro ? "oleo:sucesso-com-filtro" : "oleo:sucesso",
      motoId: moto.id,
      tokens: buildAllTokens({
        moto,
        rental: rentals.find((r) => r.motoId === moto.id && r.status === "ativa") ?? null,
        cliente: clients.find((c) => c.id === motoClientMap.get(moto.id)?.id) ?? null,
        oil: {
          kmTroca: km,
          dataTroca: data,
          proxOleoKm,
          proxFiltroKm: cfg.filterKm && trocouFiltro ? km + cfg.filterKm : null,
        },
      }),
    });
  }

  function handleCobrarAtraso(moto: Motorcycle) {
    const status = motoStatusMap.get(moto.id);
    if (!status || status.situation !== "vencida") {
      // Para situações não vencidas: abre mensagem de "em dia / atenção".
      handleMensagemEmDia(moto);
      return;
    }
    const clienteInfo = motoClientMap.get(moto.id);
    const clienteNome = clienteInfo?.nome ?? "";
    const telefone = clienteInfo?.telefone ?? "";
    const clienteId = clienteInfo?.id ?? null;
    const lateCount = clientLateCount(clienteId, motos, rentals, brandConfig, globalConfig.windowKm);
    const kmAtual = moto.kmAtual ?? 0;

    // Sempre que VENCIDA: enviar mensagem completa (vistoria em vídeo + palavra-chave + média de atraso).
    const palavra = keywordOfTheDay(
        globalConfig.keywords,
        new Date(),
        globalConfig.keywordPeriodDays ?? 1,
      );
    const dataHoje = new Date().toLocaleDateString("pt-BR");
    const { mediaKm, amostras } = clientAvgLateKm(
      clienteId, motos, rentals, brandConfig, globalConfig.windowKm, 3,
    );
    const mensagem = buildReincidenciaMessage({
        clienteNome, placa: moto.placa, modelo: moto.modelo,
        kmAtual, proxOleoKm: status.proxOleoKm, kmAtraso: status.kmAtraso,
        palavraChave: palavra, dataHoje,
        diasSemTroca: status.diasDesdeUltima,
        mediaAtrasoKm: mediaKm,
        amostrasAtraso: amostras,
      });
    const reincidenteHL = lateCount >= 1
      ? [{ label: "Reincidência", value: `${lateCount + 1}ª ocorrência`, tone: "danger" as const }]
      : [];
    const mediaHL = mediaKm != null && amostras > 0
      ? [{ label: `Média (últimas ${amostras})`, value: `+${Math.round(mediaKm).toLocaleString("pt-BR")} km`, tone: "warning" as const }]
      : [];
    // Seleciona a etapa da régua de cobrança (1ª, 2ª ou 3ª) por nº de cobranças anteriores.
    const stage = Math.min(3, lateCount + 1);
    const stageLabel = stage === 1 ? "1ª cobrança" : stage === 2 ? "2ª cobrança" : "3ª cobrança";
    setMessagePopup({
        open: true,
        title: `⚠️ Cobrança de Troca de Óleo · ${stageLabel}`,
        mensagem,
        placa: moto.placa,
        cliente: clienteNome,
        telefone,
        highlights: [
          { label: "Atraso", value: `+${status.kmAtraso.toLocaleString("pt-BR")} km`, tone: "danger" },
          ...mediaHL,
          ...reincidenteHL,
        ],
        keyword: palavra,
        templateKey: `oleo:vencida-${stage}`,
        motoId: moto.id,
        tokens: buildAllTokens({
          moto,
          rental: rentals.find((r) => r.motoId === moto.id && r.status === "ativa") ?? null,
          cliente: clients.find((c) => c.id === clienteId) ?? null,
          oil: {
            proxOleoKm: status.proxOleoKm,
            kmAtraso: status.kmAtraso,
            diasSemTroca: status.diasDesdeUltima,
            mediaAtrasoKm: mediaKm,
            amostrasAtraso: amostras,
            palavraChave: palavra,
            dataHoje,
          },
        }),
      });
  }

  function handleMensagemEmDia(moto: Motorcycle) {
    const status = motoStatusMap.get(moto.id);
    const clienteInfo = motoClientMap.get(moto.id);
    const clienteNome = clienteInfo?.nome ?? "";
    const telefone = clienteInfo?.telefone ?? "";
    const clienteId = clienteInfo?.id ?? null;
    const cfg = brandConfigFor(moto.modelo, brandConfig);
    const last = lastOilChange(moto);
    const kmAtual = moto.kmAtual ?? 0;
    const proxOleoKm = status?.proxOleoKm ?? (last?.km ?? kmAtual) + cfg.oilKm;
    const kmRestantes = Math.max(0, proxOleoKm - kmAtual);

    const isAtencao = status?.situation === "atencao";
    const templateKey = isAtencao ? "oleo:atencao" : "oleo:em-dia";

    const linhas: string[] = [];
    linhas.push(`Olá, ${clienteNome || "[NOME]"}! 👋`);
    linhas.push("");
    if (isAtencao) {
      linhas.push(`Sua moto *${moto.placa}*${moto.modelo ? ` (${moto.modelo})` : ""} está se aproximando do limite da próxima troca de óleo. ⚠️`);
    } else {
      linhas.push(`Passando para confirmar a situação da sua moto *${moto.placa}*${moto.modelo ? ` (${moto.modelo})` : ""}. ✅`);
    }
    linhas.push("");
    linhas.push(`📍 *Próxima troca de óleo:* ${proxOleoKm.toLocaleString("pt-BR")} Km`);
    linhas.push(`🔵 *Km atual:* ${kmAtual.toLocaleString("pt-BR")} Km`);
    linhas.push(`🟢 *Restam:* ${kmRestantes.toLocaleString("pt-BR")} Km`);
    linhas.push("");
    linhas.push(`Pode nos enviar uma *foto do painel* atualizada para confirmarmos a quilometragem? 📸`);
    linhas.push("");
    linhas.push(`Qualquer dúvida, estamos à disposição. 🏍️`);
    const mensagem = linhas.join("\n");

    setMessagePopup({
      open: true,
      title: isAtencao ? "Aviso · Próxima Troca de Óleo" : "Mensagem para o Locatário",
      mensagem,
      placa: moto.placa,
      cliente: clienteNome,
      telefone,
      highlights: [
        { label: "Próxima troca", value: `${proxOleoKm.toLocaleString("pt-BR")} km`, tone: "primary" },
        { label: "Restam", value: `${kmRestantes.toLocaleString("pt-BR")} km`, tone: isAtencao ? "warning" : "primary" },
      ],
      templateKey,
      motoId: moto.id,
      tokens: buildAllTokens({
        moto,
        rental: rentals.find((r) => r.motoId === moto.id && r.status === "ativa") ?? null,
        cliente: clients.find((c) => c.id === clienteId) ?? null,
        oil: { proxOleoKm, kmTroca: last?.km, dataTroca: last?.data },
      }),
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Dashboard de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          title="Taxa de Conformidade"
          value={kpis.conformidadePct == null ? "—" : `${kpis.conformidadePct.toFixed(0)}%`}
          hint={`±${globalConfig.windowKm} km · ${kpis.conformidadeOk}/${kpis.conformidadeTotal} trocas`}
          tone={
            kpis.conformidadePct == null ? "neutral"
              : kpis.conformidadePct >= 80 ? "ok"
              : kpis.conformidadePct >= 60 ? "warning" : "danger"
          }
          description={`% de trocas realizadas dentro da janela de tolerância (±${globalConfig.windowKm} km) em relação ao km programado. Quanto maior, melhor a disciplina da frota.`}
        />
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          title="Atraso Médio por Troca"
          value={kpis.atrasoMedioKm == null ? "—" : `${Math.round(kpis.atrasoMedioKm).toLocaleString("pt-BR")} km`}
          hint={`${kpis.atrasoAmostras} troca(s) com atraso`}
          tone={
            kpis.atrasoMedioKm == null ? "neutral"
              : kpis.atrasoMedioKm < 100 ? "ok"
              : kpis.atrasoMedioKm < 200 ? "warning" : "danger"
          }
          description="Média de km rodados além do limite, considerando apenas as trocas que atrasaram. Indica o tamanho típico do atraso quando ele acontece."
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Trocas Vencidas Agora"
          value={String(kpis.vencidasAgora)}
          hint={`Acima do limite ou sem registro há +${globalConfig.overdueDays ?? 10} dias`}
          tone={kpis.vencidasAgora === 0 ? "ok" : kpis.vencidasAgora <= 2 ? "warning" : "danger"}
          description={`Motos que ultrapassaram o km limite OU estão em locação ativa sem nenhum registro de troca há mais de ${globalConfig.overdueDays ?? 10} dias. Clique para filtrar apenas essas motos.`}
          onClick={() => setSituacaoFilter("vencida")}
        />
        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          title="Reincidência de Atraso"
          value={kpis.reincidenciaPct == null ? "—" : `${kpis.reincidenciaPct.toFixed(0)}%`}
          hint={`${kpis.reincidenciaReincidentes}/${kpis.reincidenciaTotalLocatarios} locatários`}
          tone={
            kpis.reincidenciaPct == null ? "neutral"
              : kpis.reincidenciaPct < 10 ? "ok"
              : kpis.reincidenciaPct < 25 ? "warning" : "danger"
          }
          description="% de locatários que atrasaram a troca mais de uma vez. Reincidentes recebem automaticamente a cobrança com vídeo de vistoria + palavra-chave do dia."
        />
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="space-y-2">
            <Label className="text-sm">Placa</Label>
            <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por placa ou locatário"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Situação</Label>
            <select
              value={situacaoFilter}
              onChange={(e) => setSituacaoFilter(e.target.value as typeof situacaoFilter)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="todas">Todas</option>
              <option value="vencida">Vencidas</option>
              <option value="atencao">Próximas (atenção)</option>
              <option value="ok">Em dia</option>
              <option value="sem_dados">Sem registro</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Km atual</Label>
            <div className="h-10 flex items-center px-1">
              <Slider
                min={kmBounds.min}
                max={kmBounds.max}
                step={100}
                value={kmRange}
                onValueChange={(v) => setKmRange([v[0], v[1]] as [number, number])}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              de <span className="font-semibold text-foreground">{kmRange[0].toLocaleString("pt-BR")} km</span>{" "}
              até <span className="font-semibold text-foreground">{kmRange[1].toLocaleString("pt-BR")} km</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ações de controle */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <HowItWorksDialog content={TROCA_OLEO_HELP} />
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-4 w-4" />
          Configurar
        </Button>
        <Button
          size="sm"
          className="gap-1 bg-foreground text-background hover:bg-foreground/90"
          onClick={() => {
            setRegisterMoto(null);
            setNewDialogOpen(true);
          }}
        >
          <Droplets className="h-4 w-4 text-warning" />
          Novo
        </Button>
        <Button size="sm" variant="outline" onClick={exportCSV}>
          ⬇ Exportar
        </Button>
      </div>

      {/* Lista: Trocas Vencidas (topo, destaque) */}
      <Card className="border-destructive/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-destructive/5 border-b border-destructive/20 rounded-t-lg">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Trocas Vencidas
            <Badge variant="outline" className="ml-1 bg-destructive/15 text-destructive border-destructive/30">
              {vencidasList.length}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Motos que precisam de cobrança imediata.</p>
        </CardHeader>
        <CardContent className="p-0">
          <OilTable
            motos={vencidasList}
            motoStatusMap={motoStatusMap}
            motoClientMap={motoClientMap}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onEdit={setEditMoto}
            onCobrar={handleCobrarAtraso}
            onRegistrar={(m) => { setRegisterMoto(m); setNewDialogOpen(true); }}
            onSnooze={(m) => setSnoozeDialog({ open: true, moto: m, days: 3 })}
            emptyMessage="🎉 Nenhuma moto com troca vencida."
          />
        </CardContent>
      </Card>

      {/* Lista: Trocas em dia / Atenção / Sem registro */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Droplets className="h-4 w-4 text-primary" />
            Trocas em Dia
            <Badge variant="outline" className="ml-1">
              {emDiaList.length}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Motos com locatário ativo — em dia, em atenção ou sem registro.</p>
        </CardHeader>
        <CardContent className="p-0">
          <OilTable
            motos={emDiaList}
            motoStatusMap={motoStatusMap}
            motoClientMap={motoClientMap}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onEdit={setEditMoto}
            onCobrar={handleCobrarAtraso}
            onRegistrar={(m) => { setRegisterMoto(m); setNewDialogOpen(true); }}
            emptyMessage="Nenhuma moto encontrada."
          />
        </CardContent>
      </Card>

      {/* Lista: Em Estoque (sem locatário ativo) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Droplets className="h-4 w-4 text-muted-foreground" />
            Em Estoque
            <Badge variant="outline" className="ml-1">
              {estoqueList.length}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Motos disponíveis, sem locatário ativo.</p>
        </CardHeader>
        <CardContent className="p-0">
          <OilTable
            motos={estoqueList}
            motoStatusMap={motoStatusMap}
            motoClientMap={motoClientMap}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onEdit={setEditMoto}
            onCobrar={handleCobrarAtraso}
            onRegistrar={(m) => { setRegisterMoto(m); setNewDialogOpen(true); }}
            emptyMessage="Nenhuma moto em estoque."
          />
        </CardContent>
      </Card>

      <RegisterOilDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        motos={motos}
        preselected={registerMoto}
        brandConfig={brandConfig}
        onSave={handleRegisterOilChange}
      />

      <EditMotoDialog
        moto={editMoto}
        onOpenChange={(o) => !o && setEditMoto(null)}
        onSave={handleSaveEdit}
      />

      <ConfigDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brandConfig={brandConfig}
        globalConfig={globalConfig}
        onSave={(brand, global) => {
          setBrandConfig(brand);
          saveBrandConfig(brand);
          setGlobalConfig(global);
          saveGlobalConfig(global);
          toast.success("Configuração salva");
          setSettingsOpen(false);
        }}
      />

      <MessagePopup
        open={messagePopup.open}
        onOpenChange={(o) => {
          if (!o) markContacted(messagePopup.motoId);
          setMessagePopup((prev) => ({ ...prev, open: o }));
        }}
        title={messagePopup.title}
        mensagem={messagePopup.mensagem}
        placa={messagePopup.placa}
        cliente={messagePopup.cliente}
        telefone={messagePopup.telefone}
        highlights={messagePopup.highlights}
        keyword={messagePopup.keyword}
        templateKey={messagePopup.templateKey}
        tokens={messagePopup.tokens}
      />

      <Dialog
        open={snoozeDialog.open}
        onOpenChange={(o) => !o && setSnoozeDialog((p) => ({ ...p, open: false }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adiar notificação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              A moto <strong>{snoozeDialog.moto?.placa}</strong> será movida para{" "}
              <strong>Trocas em Dia</strong> e voltará para <strong>Vencidas</strong> com{" "}
              <strong>1 dia vencido</strong> após o período selecionado.
            </p>
            <div className="space-y-2">
              <Label htmlFor="snooze-days">Adiar por (dias)</Label>
              <Input
                id="snooze-days"
                type="number"
                min={1}
                max={90}
                value={snoozeDialog.days}
                onChange={(e) =>
                  setSnoozeDialog((p) => ({
                    ...p,
                    days: Math.max(1, Math.min(90, parseInt(e.target.value) || 1)),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnoozeDialog((p) => ({ ...p, open: false }))}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                snoozeDialog.moto && handleSnooze(snoozeDialog.moto, snoozeDialog.days)
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== Snooze Button (Adiar lembrete) ==============
function SnoozeButton({ motoId, placa }: { motoId: string; placa: string }) {
  const [until, setUntil] = useState<string | null>(() => getSnoozeUntil(motoId));
  useEffect(() => onSnoozeChange(() => setUntil(getSnoozeUntil(motoId))), [motoId]);
  const snoozed = until !== null;
  const apply = (days: number) => {
    snoozeMoto(motoId, days);
    const d = new Date();
    d.setDate(d.getDate() + days);
    toast.success(
      `Lembrete da ${placa} adiado para ${d.toLocaleDateString("pt-BR")} (vencimento real não muda)`,
    );
  };
  const clear = () => {
    clearSnooze(motoId);
    toast.success(`Lembrete da ${placa} reativado`);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "p-1.5 rounded-md transition-colors",
            snoozed
              ? "text-warning hover:bg-warning/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          title={
            snoozed
              ? `Lembrete adiado até ${new Date(until! + "T00:00:00").toLocaleDateString("pt-BR")}`
              : "Adiar lembrete (não altera vencimento)"
          }
        >
          {snoozed ? <BellOff className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Adiar lembrete · não muda vencimento
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => apply(1)}>+1 dia</DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply(3)}>+3 dias</DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply(7)}>+7 dias</DropdownMenuItem>
        {snoozed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={clear} className="text-destructive">
              Reativar lembrete agora
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============== Oil Table (lista reutilizável) ==============
function OilTable({
  motos, motoStatusMap, motoClientMap,
  expanded, onToggleExpand, onEdit, onCobrar, onRegistrar, onSnooze, emptyMessage,
}: {
  motos: Motorcycle[];
  motoStatusMap: Map<string, ReturnType<typeof getOilStatus>>;
  motoClientMap: Map<string, { id: string; nome: string; telefone: string }>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit: (m: Motorcycle) => void;
  onCobrar: (m: Motorcycle) => void;
  onRegistrar: (m: Motorcycle) => void;
  onSnooze?: (m: Motorcycle) => void;
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="w-10"></th>
            <th className="w-10"></th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Placa</th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Situação</th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Km atual</th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Última troca</th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Próxima troca - Km</th>
            <th className="w-24"></th>
          </tr>
        </thead>
        <tbody>
          {motos.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-8 text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
          {motos.map((m) => {
            const last = lastOilChange(m);
            const status = motoStatusMap.get(m.id)!;
            const isOpen = expanded.has(m.id);
            const cliente = motoClientMap.get(m.id);
            return (
              <Fragment key={m.id}>
                <tr className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-2 py-3 text-center">
                    <button onClick={() => onToggleExpand(m.id)} className="text-muted-foreground hover:text-foreground">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => onEdit(m)}
                      className="text-muted-foreground hover:text-primary"
                      title="Atualizar km atual"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-foreground">{m.placa}</div>
                    {cliente && (
                      <div className="text-xs text-primary uppercase tracking-wide">{cliente.nome}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SituationBadge situation={status.situation} label={status.label} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {(m.kmAtual ?? 0).toLocaleString("pt-BR")} Km
                  </td>
                  <td className="px-4 py-3">
                    {last ? (
                      <>
                        <div className="font-semibold text-foreground">
                          {last.km.toLocaleString("pt-BR")} Km
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDate(last.data)}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${status.situation === "vencida" ? "text-destructive" : "text-foreground"}`}>
                    <div>{status.proxOleoKm.toLocaleString("pt-BR")} Km</div>
                    {status.proxFiltroKm != null && (
                      <div className="text-xs font-normal text-muted-foreground">
                        Filtro: {status.proxFiltroKm.toLocaleString("pt-BR")} Km
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {cliente && (
                        <button
                          onClick={() => onCobrar(m)}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            status.situation === "vencida"
                              ? "text-destructive hover:bg-destructive/10"
                              : status.situation === "atencao"
                                ? "text-warning hover:bg-warning/10"
                                : "text-primary hover:bg-primary/10",
                          )}
                          title={
                            status.situation === "vencida"
                              ? "Cobrar locatário (WhatsApp)"
                              : status.situation === "atencao"
                                ? "Avisar proximidade da troca (WhatsApp)"
                                : "Enviar mensagem ao locatário (WhatsApp)"
                          }
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {status.situation === "vencida" && (
                        <SnoozeButton motoId={m.id} placa={m.placa} />
                      )}
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => onRegistrar(m)}
                        title="Registrar nova troca"
                      />
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-muted/20 border-b">
                    <td colSpan={8} className="px-12 py-3">
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-foreground mb-1">Histórico de trocas</p>
                        {(m.historicoOleo || []).length === 0 ? (
                          <p className="text-muted-foreground">Nenhum registro.</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {[...m.historicoOleo]
                              .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                              .map((r) => (
                                <li key={r.id} className="text-muted-foreground">
                                  <span className="text-foreground font-medium">{formatDate(r.data)}</span>{" "}
                                  — {r.km.toLocaleString("pt-BR")} Km
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============== KPI Card ==============
function KpiCard({
  icon, title, value, hint, tone, description, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint: string;
  tone: "ok" | "warning" | "danger" | "neutral";
  description: string;
  onClick?: () => void;
}) {
  const toneClasses: Record<typeof tone, string> = {
    ok: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    neutral: "text-muted-foreground",
  };
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40" : undefined}
    >
      <CardContent className="p-4 space-y-1.5 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center">
            {title}
            <InfoTooltip text={description} />
          </p>
          <span className={toneClasses[tone]}>{icon}</span>
        </div>
        <p className={cn("text-2xl font-bold", toneClasses[tone])}>{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

// ============== Situation Badge ==============
function SituationBadge({ situation, label }: { situation: OilSituation; label: string }) {
  const map: Record<OilSituation, { className: string }> = {
    ok:        { className: "bg-success/15 text-success border-success/30" },
    atencao:   { className: "bg-warning/15 text-warning border-warning/30" },
    vencida:   { className: "bg-destructive/15 text-destructive border-destructive/30" },
    sem_dados: { className: "bg-muted text-muted-foreground border-border" },
  };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", map[situation].className)}>
      {label}
    </Badge>
  );
}

// ============== Register Dialog ==============
function RegisterOilDialog({
  open, onOpenChange, motos, preselected, brandConfig, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  motos: Motorcycle[];
  preselected: Motorcycle | null;
  brandConfig: Record<string, BrandConfig>;
  onSave: (moto: Motorcycle, data: string, km: number, trocouFiltro: boolean) => void;
}) {
  const [motoId, setMotoId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState<string>("");
  const [trocouFiltro, setTrocouFiltro] = useState(false);

  useEffect(() => {
    if (open) {
      setMotoId(preselected?.id ?? "");
      setKm(preselected?.kmAtual != null ? String(preselected.kmAtual) : "");
      setData(new Date().toISOString().slice(0, 10));
      setTrocouFiltro(false);
    }
  }, [open, preselected]);

  const selected = motos.find((m) => m.id === motoId) || null;
  const cfg = selected ? brandConfigFor(selected.modelo, brandConfig) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar troca de óleo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Moto</Label>
            <select
              value={motoId}
              onChange={(e) => setMotoId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {motos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.placa} {m.modelo ? `— ${m.modelo}` : ""}
                </option>
              ))}
            </select>
            {cfg && (
              <p className="text-xs text-muted-foreground">
                Intervalo configurado: óleo a cada{" "}
                <span className="font-semibold text-foreground">{cfg.oilKm.toLocaleString("pt-BR")} km</span>
                {cfg.filterKm && (
                  <>
                    {" "}· filtro a cada{" "}
                    <span className="font-semibold text-foreground">{cfg.filterKm.toLocaleString("pt-BR")} km</span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Km na troca</Label>
              <Input
                type="number"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="Ex: 12500"
              />
            </div>
          </div>
          {cfg?.filterKm && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={trocouFiltro}
                onCheckedChange={(v) => setTrocouFiltro(v === true)}
              />
              <span>Também troquei o filtro de óleo nesta manutenção</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!selected) { toast.error("Selecione uma moto"); return; }
              const kmNum = Number(km);
              if (!Number.isFinite(kmNum) || kmNum <= 0) { toast.error("Informe a quilometragem"); return; }
              if (!data) { toast.error("Informe a data"); return; }
              const hoje = new Date(); hoje.setHours(23,59,59,999);
              if (new Date(data).getTime() > hoje.getTime()) { toast.error("Data não pode ser futura"); return; }
              onSave(selected, data, kmNum, trocouFiltro);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== Edit Moto Dialog ==============
function EditMotoDialog({
  moto, onOpenChange, onSave,
}: {
  moto: Motorcycle | null;
  onOpenChange: (o: boolean) => void;
  onSave: (m: Motorcycle) => void;
}) {
  const [kmAtual, setKmAtual] = useState<string>("");

  useEffect(() => {
    if (moto) setKmAtual(moto.kmAtual != null ? String(moto.kmAtual) : "");
  }, [moto]);

  return (
    <Dialog open={!!moto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Atualizar Km atual — {moto?.placa}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Esta ação <strong className="text-foreground">apenas corrige/atualiza o hodômetro</strong> da moto.
            Não registra uma nova troca de óleo. Para registrar troca, use o botão <strong className="text-foreground">"Registrar troca"</strong>.
          </div>
          <div className="space-y-2">
            <Label>Km atual</Label>
            <Input
              type="number"
              value={kmAtual}
              onChange={(e) => setKmAtual(e.target.value)}
              autoFocus
            />
            {moto?.kmAtual != null && (
              <p className="text-xs text-muted-foreground">
                Valor atual: {moto.kmAtual.toLocaleString("pt-BR")} km
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!moto) return;
              const n = Number(kmAtual);
              if (!Number.isFinite(n) || n < 0) { toast.error("Km inválido"); return; }
              onSave({ ...moto, kmAtual: n });
            }}
          >
            Salvar Km
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== Config Dialog (marca + global) ==============
function ConfigDialog({
  open, onOpenChange, brandConfig, globalConfig, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandConfig: Record<string, BrandConfig>;
  globalConfig: OilGlobalConfig;
  onSave: (brand: Record<string, BrandConfig>, global: OilGlobalConfig) => void;
}) {
  const [hondaOil, setHondaOil] = useState("");
  const [yamahaOil, setYamahaOil] = useState("");
  const [yamahaFilter, setYamahaFilter] = useState("");
  const [outrasOil, setOutrasOil] = useState("");
  const [windowKm, setWindowKm] = useState("");
  const [defaultKmWeek, setDefaultKmWeek] = useState("");
  const [useBrandDefault, setUseBrandDefault] = useState(false);
  const [hondaKmWeek, setHondaKmWeek] = useState("");
  const [yamahaKmWeek, setYamahaKmWeek] = useState("");
  const [outrasKmWeek, setOutrasKmWeek] = useState("");
  const [overdueDays, setOverdueDays] = useState("");
  const [keywordPeriodDays, setKeywordPeriodDays] = useState("");
  const [adaptiveMinTrocas, setAdaptiveMinTrocas] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  // Templates de mensagem por etapa (atencao + 3 cobranças de vencida).
  const TPL_KEYS = [
    { key: "oleo:em-dia",    label: "Em dia (lembrete)",           tone: "warning" as const },
    { key: "oleo:atencao",   label: "Atenção (próxima do limite)", tone: "warning" as const },
    { key: "oleo:vencida-1", label: "Vencida · 1ª cobrança",       tone: "danger"  as const },
    { key: "oleo:vencida-2", label: "Vencida · 2ª cobrança",       tone: "danger"  as const },
    { key: "oleo:vencida-3", label: "Vencida · 3ª cobrança",       tone: "danger"  as const },
  ];
  const [tplValues, setTplValues] = useState<Record<string, string>>({});
  const [tplActive, setTplActive] = useState<string>("oleo:vencida-1");

  useEffect(() => {
    if (open) {
      setHondaOil(String(brandConfig.honda?.oilKm ?? 1000));
      setYamahaOil(String(brandConfig.yamaha?.oilKm ?? 2000));
      setYamahaFilter(String(brandConfig.yamaha?.filterKm ?? 4000));
      setOutrasOil(String(brandConfig.outras?.oilKm ?? 1000));
      setWindowKm(String(globalConfig.windowKm));
      setDefaultKmWeek(String(Math.round(globalConfig.defaultKmPerDay * 7)));
      setUseBrandDefault(!!globalConfig.useBrandDefault);
      const fallbackWeek = Math.round(globalConfig.defaultKmPerDay * 7);
      setHondaKmWeek(String(Math.round((brandConfig.honda?.defaultKmPerDay ?? globalConfig.defaultKmPerDay) * 7) || fallbackWeek));
      setYamahaKmWeek(String(Math.round((brandConfig.yamaha?.defaultKmPerDay ?? globalConfig.defaultKmPerDay) * 7) || fallbackWeek));
      setOutrasKmWeek(String(Math.round((brandConfig.outras?.defaultKmPerDay ?? globalConfig.defaultKmPerDay) * 7) || fallbackWeek));
      setOverdueDays(String(globalConfig.overdueDays ?? 10));
      setKeywordPeriodDays(String(globalConfig.keywordPeriodDays ?? 1));
      setAdaptiveMinTrocas(String(globalConfig.adaptiveMinTrocas ?? 3));
      setKeywordsText(globalConfig.keywords.join(", "));
      const next: Record<string, string> = {};
      for (const t of TPL_KEYS) {
        try {
          next[t.key] = localStorage.getItem("wayvo:msg-template:" + t.key) ?? "";
        } catch { next[t.key] = ""; }
      }
      setTplValues(next);
    }
  }, [open, brandConfig, globalConfig]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5 text-primary" />
            Configurações de Troca de Óleo
          </DialogTitle>
          <div className="flex items-center justify-between gap-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Defina regras de vencimento, padrões da frota e parâmetros por marca.
            </p>
            <HowItWorksInlineButton content={TROCA_OLEO_HELP} />
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* === Regras de Vencimento === */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Regras de Vencimento</h3>
                <p className="text-[11px] text-muted-foreground">
                  Como o sistema decide se uma moto está <strong>VENCIDA</strong>.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tolerância ±km do limite</Label>
                <Input type="number" value={windowKm} onChange={(e) => setWindowKm(e.target.value)} />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Trocas dentro dessa faixa contam como conformes.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Dias para considerar VENCIDA</Label>
                <Input type="number" value={overdueDays} onChange={(e) => setOverdueDays(e.target.value)} />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Fallback quando o locatário não tem histórico confiável.
                </p>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">Trocas consecutivas conformes (modo adaptativo)</Label>
                <Input type="number" value={adaptiveMinTrocas} onChange={(e) => setAdaptiveMinTrocas(e.target.value)} />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Mínimo de trocas seguidas dentro da tolerância para usar o ritmo do locatário em vez dos dias.
                </p>
              </div>
            </div>
          </section>

          {/* === Padrão da frota === */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Padrão da frota</h3>
                <p className="text-[11px] text-muted-foreground">
                  Ritmo de uso considerado quando não há histórico do locatário.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Padrão geral (km/semana)</Label>
                <Input
                  type="number"
                  value={defaultKmWeek}
                  onChange={(e) => setDefaultKmWeek(e.target.value)}
                  disabled={useBrandDefault}
                  className={cn(useBrandDefault && "opacity-60 cursor-not-allowed")}
                />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Label htmlFor="use-brand-default" className="text-[11px] text-muted-foreground cursor-pointer leading-snug">
                    Definir padrão por marca <span className="text-muted-foreground/70">(sobrepõe o valor acima)</span>
                  </Label>
                  <Switch
                    id="use-brand-default"
                    checked={useBrandDefault}
                    onCheckedChange={setUseBrandDefault}
                  />
                </div>
              </div>

              {useBrandDefault && (
                <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      Honda
                    </Label>
                    <Input type="number" value={hondaKmWeek} onChange={(e) => setHondaKmWeek(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground">km/semana</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Yamaha
                    </Label>
                    <Input type="number" value={yamahaKmWeek} onChange={(e) => setYamahaKmWeek(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground">km/semana</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      Outras
                    </Label>
                    <Input type="number" value={outrasKmWeek} onChange={(e) => setOutrasKmWeek(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground">km/semana</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* === Vistoria em vídeo === */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-warning" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Vistoria em vídeo (reincidência)</h3>
                <p className="text-[11px] text-muted-foreground">
                  Palavra-chave usada na mensagem enviada a locatários reincidentes.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Período de validade da palavra-chave (dias)</Label>
                <Input type="number" value={keywordPeriodDays} onChange={(e) => setKeywordPeriodDays(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Lista de palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="girassol, pantera, oceano..."
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  O sistema sorteia uma palavra a cada período configurado.
                </p>
              </div>
            </div>
          </section>

          {/* === Mensagens por etapa === */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Mensagens por etapa</h3>
                <p className="text-[11px] text-muted-foreground">
                  Modelos enviados em cada situação. Use <strong>{"{TOKENS}"}</strong> (ex.: {"{NOME}"}, {"{PLACA}"}, {"{KM_ATUAL}"}). Em branco = usa o modelo padrão do sistema.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {TPL_KEYS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTplActive(t.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      tplActive === t.key
                        ? t.tone === "danger"
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-warning/10 text-warning border-warning/30"
                        : "bg-background text-muted-foreground border-border hover:bg-muted/50",
                    )}
                  >
                    {t.label}
                    {tplValues[t.key]?.trim() && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
              <textarea
                value={tplValues[tplActive] ?? ""}
                onChange={(e) => setTplValues((prev) => ({ ...prev, [tplActive]: e.target.value }))}
                rows={10}
                spellCheck={false}
                placeholder="Deixe em branco para usar o modelo padrão automático do sistema."
                className="w-full rounded-md border border-input bg-muted/30 px-3 py-2.5 text-xs font-mono text-foreground/90 leading-relaxed resize-y min-h-[180px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  A 1ª cobrança é enviada na primeira vez que a moto vencer; 2ª e 3ª vão sendo usadas conforme o locatário reincide.
                </p>
                {tplValues[tplActive]?.trim() && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setTplValues((prev) => ({ ...prev, [tplActive]: "" }))}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Limpar (usar padrão)
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* === Régua de cobrança (compartilhada) === */}
          <OleoRuleSection />
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              const ho = Number(hondaOil);
              const yo = Number(yamahaOil);
              const yf = Number(yamahaFilter);
              const oo = Number(outrasOil);
              const wk = Number(windowKm);
              const dkw = Number(defaultKmWeek);
              const od = Number(overdueDays);
              const kpd = Number(keywordPeriodDays);
              const amt = Number(adaptiveMinTrocas);
              const hkw = Number(hondaKmWeek);
              const ykw = Number(yamahaKmWeek);
              const okw = Number(outrasKmWeek);
              const baseOk = [ho, yo, yf, oo, wk, dkw, od, kpd, amt].every((n) => Number.isFinite(n) && n > 0);
              const brandOk = !useBrandDefault || [hkw, ykw, okw].every((n) => Number.isFinite(n) && n > 0);
              if (!baseOk || !brandOk) {
                toast.error("Informe valores válidos (> 0)");
                return;
              }
              const keywords = keywordsText
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean);
              if (keywords.length === 0) {
                toast.error("Informe pelo menos uma palavra-chave");
                return;
              }
              onSave(
                {
                  honda: { oilKm: ho, defaultKmPerDay: hkw / 7 },
                  yamaha: { oilKm: yo, filterKm: yf, defaultKmPerDay: ykw / 7 },
                  outras: { oilKm: oo, defaultKmPerDay: okw / 7 },
                },
                {
                  windowKm: wk,
                  defaultKmPerDay: dkw / 7,
                  useBrandDefault,
                  keywords,
                  overdueDays: Math.floor(od),
                  keywordPeriodDays: Math.floor(kpd),
                  adaptiveMinTrocas: Math.floor(amt),
                },
              );
              // Persiste os templates de mensagem por etapa.
              try {
                for (const t of TPL_KEYS) {
                  const v = (tplValues[t.key] ?? "").trim();
                  if (v) localStorage.setItem("wayvo:msg-template:" + t.key, v);
                  else localStorage.removeItem("wayvo:msg-template:" + t.key);
                }
              } catch { /* ignora */ }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

