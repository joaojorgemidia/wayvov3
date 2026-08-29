import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Droplets, TrendingUp, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { isLoca2Rodas } from "@/lib/companies";
import {
  BrandConfig, OilGlobalConfig,
  loadBrandConfig, saveBrandConfig, loadGlobalConfig, saveGlobalConfig,
} from "@/lib/oil-kpis";

// Templates de mensagem por etapa (atenção + 3 cobranças de vencida).
const TPL_KEYS = [
  { key: "oleo:em-dia",          label: "Em dia (lembrete)",           tone: "warning" as const },
  { key: "oleo:atencao",         label: "Atenção (próxima do limite)", tone: "warning" as const },
  { key: "oleo:km-ultrapassado", label: "Km limite ultrapassado",      tone: "danger"  as const },
  { key: "oleo:vencida-1",       label: "Vencida · 1ª cobrança",       tone: "danger"  as const },
  { key: "oleo:vencida-2",       label: "Vencida · 2ª cobrança",       tone: "danger"  as const },
  { key: "oleo:vencida-3",       label: "Vencida · 3ª cobrança",       tone: "danger"  as const },
];

export function OilConfigSection() {
  const { activeCompany } = useCompany();
  const showCarroSection = isLoca2Rodas(activeCompany);

  const [brandConfig] = useState<Record<string, BrandConfig>>(() => loadBrandConfig());
  const [globalConfig] = useState<OilGlobalConfig>(() => loadGlobalConfig());

  const [hondaOil, setHondaOil] = useState(String(brandConfig.honda?.oilKm ?? 1000));
  const [yamahaOil, setYamahaOil] = useState(String(brandConfig.yamaha?.oilKm ?? 2000));
  const [yamahaFilter, setYamahaFilter] = useState(String(brandConfig.yamaha?.filterKm ?? 4000));
  const [outrasOil, setOutrasOil] = useState(String(brandConfig.outras?.oilKm ?? 1000));
  const [carroOil, setCarroOil] = useState(String(brandConfig.carro?.oilKm ?? 10000));
  const [windowKm, setWindowKm] = useState(String(globalConfig.windowKm));
  const [defaultKmWeek, setDefaultKmWeek] = useState(String(Math.round(globalConfig.defaultKmPerDay * 7)));
  const [useBrandDefault, setUseBrandDefault] = useState(!!globalConfig.useBrandDefault);
  const fallbackWeek = Math.round(globalConfig.defaultKmPerDay * 7);
  const [hondaKmWeek, setHondaKmWeek] = useState(String(Math.round((brandConfig.honda?.defaultKmPerDay ?? globalConfig.defaultKmPerDay) * 7) || fallbackWeek));
  const [yamahaKmWeek, setYamahaKmWeek] = useState(String(Math.round((brandConfig.yamaha?.defaultKmPerDay ?? globalConfig.defaultKmPerDay) * 7) || fallbackWeek));
  const [outrasKmWeek, setOutrasKmWeek] = useState(String(Math.round((brandConfig.outras?.defaultKmPerDay ?? globalConfig.defaultKmPerDay) * 7) || fallbackWeek));
  const [overdueDays, setOverdueDays] = useState(String(globalConfig.overdueDays ?? 10));
  const [keywordPeriodDays, setKeywordPeriodDays] = useState(String(globalConfig.keywordPeriodDays ?? 1));
  const [adaptiveMinTrocas, setAdaptiveMinTrocas] = useState(String(globalConfig.adaptiveMinTrocas ?? 3));
  const [keywordsText, setKeywordsText] = useState(globalConfig.keywords.join(", "));

  const [tplValues, setTplValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const t of TPL_KEYS) {
      try { next[t.key] = localStorage.getItem("wayvo:msg-template:v3:" + t.key) ?? ""; }
      catch { next[t.key] = ""; }
    }
    return next;
  });
  const [tplActive, setTplActive] = useState<string>("oleo:vencida-1");

  function handleSave() {
    const ho = Number(hondaOil);
    const yo = Number(yamahaOil);
    const yf = Number(yamahaFilter);
    const oo = Number(outrasOil);
    const co = Number(carroOil);
    const wk = Number(windowKm);
    const dkw = Number(defaultKmWeek);
    const od = Number(overdueDays);
    const kpd = Number(keywordPeriodDays);
    const amt = Number(adaptiveMinTrocas);
    const hkw = Number(hondaKmWeek);
    const ykw = Number(yamahaKmWeek);
    const okw = Number(outrasKmWeek);
    const baseOk = [ho, yo, yf, oo, co, wk, dkw, od, kpd, amt].every((n) => Number.isFinite(n) && n > 0);
    const brandOk = !useBrandDefault || [hkw, ykw, okw].every((n) => Number.isFinite(n) && n > 0);
    if (!baseOk || !brandOk) {
      toast.error("Informe valores válidos (> 0)");
      return;
    }
    const keywords = keywordsText.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (keywords.length === 0) {
      toast.error("Informe pelo menos uma palavra-chave");
      return;
    }
    saveBrandConfig({
      honda: { oilKm: ho, defaultKmPerDay: hkw / 7 },
      yamaha: { oilKm: yo, filterKm: yf, defaultKmPerDay: ykw / 7 },
      outras: { oilKm: oo, defaultKmPerDay: okw / 7 },
      carro: { oilKm: co },
    });
    saveGlobalConfig({
      windowKm: wk,
      defaultKmPerDay: dkw / 7,
      useBrandDefault,
      keywords,
      overdueDays: Math.floor(od),
      keywordPeriodDays: Math.floor(kpd),
      adaptiveMinTrocas: Math.floor(amt),
    });
    try {
      for (const t of TPL_KEYS) {
        const v = (tplValues[t.key] ?? "").trim();
        if (v) localStorage.setItem("wayvo:msg-template:v3:" + t.key, v);
        else localStorage.removeItem("wayvo:msg-template:v3:" + t.key);
      }
    } catch { /* ignora */ }
    toast.success("Configuração salva");
  }

  return (
    <div className="space-y-6">
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

      {/* === Intervalo de troca por marca/tipo === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
            <Droplets className="h-4 w-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Intervalo de troca (km)</h3>
            <p className="text-[11px] text-muted-foreground">
              A cada quantos km cada marca/tipo de veículo precisa trocar o óleo.
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              Honda
            </Label>
            <Input type="number" value={hondaOil} onChange={(e) => setHondaOil(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Yamaha
            </Label>
            <Input type="number" value={yamahaOil} onChange={(e) => setYamahaOil(e.target.value)} />
            <Input
              type="number"
              value={yamahaFilter}
              onChange={(e) => setYamahaFilter(e.target.value)}
              placeholder="Km da troca de filtro"
            />
            <p className="text-[10px] text-muted-foreground">2º campo: intervalo do filtro de óleo</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              Outras marcas (moto)
            </Label>
            <Input type="number" value={outrasOil} onChange={(e) => setOutrasOil(e.target.value)} />
          </div>
          {showCarroSection && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" />
                Carro
              </Label>
              <Input type="number" value={carroOil} onChange={(e) => setCarroOil(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Independente da marca do carro.</p>
            </div>
          )}
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

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salvar</Button>
      </div>
    </div>
  );
}
