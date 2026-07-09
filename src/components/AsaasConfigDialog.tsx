import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Eye, EyeOff } from "lucide-react";
import { AsaasConfig, DEFAULT_ASAAS_CONFIG } from "@/lib/companies";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (config: AsaasConfig) => Promise<void>;
  initial?: AsaasConfig | null;
  companyName?: string;
}

const DAYS_OPTIONS = ["1", "2", "3", "5", "7", "10", "14", "30"];
const DELAY_OPTIONS = ["0", "1", "2", "3", "5", "7", "10", "15", "30"];

export default function AsaasConfigDialog({ open, onClose, onSave, initial, companyName }: Props) {
  const [cfg, setCfg] = useState<AsaasConfig>(() => ({ ...DEFAULT_ASAAS_CONFIG, ...initial }));
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const set = <K extends keyof AsaasConfig>(key: K, val: AsaasConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(cfg);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobranças {companyName || "Asaas"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Chave de API */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Chave de API Asaas</Label>
            <p className="text-xs text-muted-foreground">Encontrada em Minha conta → Integrações no painel Asaas. Cada empresa usa sua própria chave.</p>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={cfg.apiKey || ""}
                onChange={e => set("apiKey", e.target.value.trim() || undefined)}
                placeholder="$aact_…"
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Toggle principal */}
          <div className="flex items-center gap-3">
            <Switch checked={cfg.enabled} onCheckedChange={v => set("enabled", v)} id="asaas-enabled" />
            <Label htmlFor="asaas-enabled" className="text-sm font-medium leading-tight cursor-pointer">
              Ativar cobranças automáticas do <strong>{companyName || "Asaas"}</strong>?
            </Label>
          </div>

          {cfg.enabled && (
            <>
              {/* Info */}
              <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>As cobranças serão enviadas para o whatsapp e email do locatário.</span>
              </div>

              {/* Multa */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Definir multa de atraso</Label>
                <p className="text-xs text-muted-foreground">A multa será somada ao valor da parcela caso o pagamento seja feito após a data do vencimento.</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={cfg.multaAtraso}
                    onChange={e => set("multaAtraso", Number(e.target.value))}
                    className="w-32"
                  />
                </div>
              </div>

              {/* Multa diária */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Multa diária por atraso</Label>
                <p className="text-xs text-muted-foreground">Valor adicional cobrado por cada dia de atraso.</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={cfg.multaDiaria ?? 0}
                    onChange={e => set("multaDiaria", Number(e.target.value))}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">/ dia</span>
                </div>
              </div>

              {/* Juros */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Definir juros de atraso</Label>
                <p className="text-xs text-muted-foreground">
                  Aplique juros para quando o pagamento não ocorrer até a data de vencimento. Os juros acumulativos serão somados diariamente ao valor da parcela até o pagamento. *cálculo do juros mensal, com valor máximo de 10% ao mês.*
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.01}
                    value={cfg.jurosAtrasoMes}
                    onChange={e => set("jurosAtrasoMes", Math.min(10, Number(e.target.value)))}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">% ao mês</span>
                </div>
              </div>

              {/* Desconto */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={cfg.descontoEnabled}
                    onCheckedChange={v => set("descontoEnabled", v)}
                    id="desconto-enabled"
                  />
                  <Label htmlFor="desconto-enabled" className="text-sm cursor-pointer">
                    Aplicar desconto para pagamento adiantado?
                  </Label>
                </div>

                {cfg.descontoEnabled && (
                  <div className="ml-10 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-20">Desconto</span>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={cfg.descontoValor}
                        onChange={e => set("descontoValor", Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-20">Até</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={cfg.descontoDias}
                        onChange={e => set("descontoDias", Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">dias antes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Geração automática de boleto */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Geração automática de boleto</Label>
                <p className="text-xs text-muted-foreground">O boleto de aluguel será gerado e enviado automaticamente ao locatário com antecedência.</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Switch
                    checked={(cfg.gerarBoletoXDiasAntes ?? 0) > 0}
                    onCheckedChange={v => set("gerarBoletoXDiasAntes", v ? 3 : 0)}
                    id="gerar-boleto-auto"
                  />
                  <Label htmlFor="gerar-boleto-auto" className="text-sm cursor-pointer flex items-center gap-2 flex-wrap">
                    Gerar boleto
                    <Select
                      value={String(cfg.gerarBoletoXDiasAntes || 3)}
                      onValueChange={v => set("gerarBoletoXDiasAntes", Number(v))}
                      disabled={!cfg.gerarBoletoXDiasAntes}
                    >
                      <SelectTrigger className="w-16 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OPTIONS.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    dias antes do vencimento
                  </Label>
                </div>
              </div>

              {/* Lembretes automáticos da Asaas (diferente da geração do boleto acima) */}
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">Lembretes de vencimento (Asaas)</Label>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Diferente da geração do boleto acima: isso só manda um lembrete por e-mail/SMS pro locatário — custo de R$0,55 por envio.</span>
                </div>

                {/* Antes do vencimento */}
                <div className="flex items-center gap-3">
                  <Switch
                    checked={cfg.notifyDaysBefore > 0}
                    onCheckedChange={v => set("notifyDaysBefore", v ? 2 : 0)}
                    id="notify-before"
                  />
                  <Label htmlFor="notify-before" className="text-sm cursor-pointer flex items-center gap-2 flex-wrap">
                    Avisar por e-mail/SMS
                    <Select
                      value={String(cfg.notifyDaysBefore || 2)}
                      onValueChange={v => set("notifyDaysBefore", Number(v))}
                      disabled={cfg.notifyDaysBefore === 0}
                    >
                      <SelectTrigger className="w-16 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OPTIONS.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    dias antes do vencimento
                  </Label>
                </div>

                {/* No dia do vencimento */}
                <div className="flex items-center gap-3">
                  <Switch
                    checked={cfg.notifyOnDueDate}
                    onCheckedChange={v => set("notifyOnDueDate", v)}
                    id="notify-due"
                  />
                  <Label htmlFor="notify-due" className="text-sm cursor-pointer">
                    Avisar por e-mail/SMS no dia do vencimento
                  </Label>
                </div>

                {/* Após atraso */}
                <div className="flex items-center gap-3">
                  <Switch
                    checked={cfg.notifyDaysAfterDelay > 0}
                    onCheckedChange={v => set("notifyDaysAfterDelay", v ? 1 : 0)}
                    id="notify-after"
                  />
                  <Label htmlFor="notify-after" className="text-sm cursor-pointer flex items-center gap-2 flex-wrap">
                    Avisar por e-mail/SMS a cada
                    <Select
                      value={String(cfg.notifyDaysAfterDelay || 1)}
                      onValueChange={v => set("notifyDaysAfterDelay", Number(v))}
                      disabled={cfg.notifyDaysAfterDelay === 0}
                    >
                      <SelectTrigger className="w-16 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELAY_OPTIONS.filter(d => d !== "0").map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    dias de atraso
                  </Label>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? "Salvando…" : "Finalizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
