import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

interface InspectionSettings {
  interval_days: number;
  warning_days: number;
}

const DEFAULT_SETTINGS: InspectionSettings = { interval_days: 30, warning_days: 7 };

export function VistoriaConfigSection() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;

  const [settings, setSettings] = useState<InspectionSettings>(DEFAULT_SETTINGS);
  const [intervalDays, setIntervalDays] = useState(String(DEFAULT_SETTINGS.interval_days));
  const [warning, setWarning] = useState(String(DEFAULT_SETTINGS.warning_days));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("inspection_settings")
        .select("interval_days, warning_days")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;
      const s = data ? { interval_days: data.interval_days, warning_days: data.warning_days } : DEFAULT_SETTINGS;
      setSettings(s);
      setIntervalDays(String(s.interval_days));
      setWarning(String(s.warning_days));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  async function save() {
    if (!companyId) return;
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
    setSettings({ interval_days: i, warning_days: w });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4 max-w-md">
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
      <Button onClick={save} disabled={saving}>
        {saving ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}
