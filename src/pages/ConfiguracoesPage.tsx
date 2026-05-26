import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, CreditCard, CheckCircle2, XCircle, ShieldCheck, Car, Receipt } from "lucide-react";
import AsaasConfigDialog from "@/components/AsaasConfigDialog";
import DetranConfigDialog from "@/components/DetranConfigDialog";
import { AsaasConfig, DetranConfig, CobrancaConfig, DEFAULT_COBRANCA_CONFIG } from "@/lib/companies";
import { toast } from "sonner";

export default function ConfiguracoesPage() {
  const { activeCompany, updateAsaasConfig, updateDetranConfig, updateCobrancaConfig } = useCompany();
  const [asaasOpen, setAsaasOpen] = useState(false);
  const [detranOpen, setDetranOpen] = useState(false);

  const asaasCfg = activeCompany?.asaasConfig;
  const detranCfg = activeCompany?.detranConfig;
  const cobrancaCfg = activeCompany?.cobrancaConfig ?? DEFAULT_COBRANCA_CONFIG;
  const [multaValue, setMultaValue] = useState(String(cobrancaCfg.multaAtraso));
  const [jurosValue, setJurosValue] = useState(String(cobrancaCfg.jurosDiario));

  const handleSaveAsaas = async (config: AsaasConfig) => {
    await updateAsaasConfig(activeCompany.id, config);
  };

  const handleSaveDetran = async (config: DetranConfig | null) => {
    await updateDetranConfig(activeCompany.id, config);
    if (config) toast.success("DETRAN-GO conectado com sucesso.");
    else toast.success("Integração DETRAN removida.");
  };

  const handleSaveCobranca = async () => {
    const multa = parseFloat(multaValue.replace(',', '.'));
    const juros = parseFloat(jurosValue.replace(',', '.'));
    if (Number.isNaN(multa) || Number.isNaN(juros) || multa < 0 || juros < 0) {
      toast.error("Valores inválidos. Insira números positivos.");
      return;
    }
    await updateCobrancaConfig(activeCompany.id, { multaAtraso: multa, jurosDiario: juros });
  };

  // Mascara o login para exibição: joao@email.com → j***@email.com
  const maskLogin = (login: string) => {
    const [user, domain] = login.split("@");
    if (domain) return `${user[0]}***@${domain}`;
    if (login.length >= 4) return `${login.slice(0, 3)}${"•".repeat(login.length - 3)}`;
    return login;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Configurações</h1>
      </div>

      {/* ── Asaas / Cobranças ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Cobranças Automáticas (Asaas)</CardTitle>
            </div>
            {asaasCfg?.enabled
              ? <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Inativo</Badge>
            }
          </div>
          <CardDescription>
            Configure multa, juros, desconto e frequência de notificações enviadas via Asaas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {asaasCfg?.enabled && (
            <div className="text-sm space-y-1 text-muted-foreground">
              {asaasCfg.multaAtraso > 0 && (
                <p>Multa de atraso: <span className="text-foreground font-medium">R$ {asaasCfg.multaAtraso.toFixed(2)}</span></p>
              )}
              {asaasCfg.jurosAtrasoMes > 0 && (
                <p>Juros: <span className="text-foreground font-medium">{asaasCfg.jurosAtrasoMes}% ao mês</span></p>
              )}
              {asaasCfg.descontoEnabled && asaasCfg.descontoValor > 0 && (
                <p>Desconto antecipado: <span className="text-foreground font-medium">{asaasCfg.descontoValor}% até {asaasCfg.descontoDias}d antes</span></p>
              )}
              {asaasCfg.notifyDaysBefore > 0 && (
                <p>Notificação: <span className="text-foreground font-medium">{asaasCfg.notifyDaysBefore} dia(s) antes do vencimento</span></p>
              )}
              {asaasCfg.notifyOnDueDate && (
                <p>Notificação: <span className="text-foreground font-medium">no dia do vencimento</span></p>
              )}
              {asaasCfg.notifyDaysAfterDelay > 0 && (
                <p>Notificação: <span className="text-foreground font-medium">a cada {asaasCfg.notifyDaysAfterDelay} dia(s) de atraso</span></p>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setAsaasOpen(true)}>
            {asaasCfg ? "Editar configuração" : "Configurar"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Regras de Juros e Multa ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Regras de Juros e Multa</CardTitle>
            </div>
          </div>
          <CardDescription>
            Configure os valores de multa fixa e juros diário aplicados nas cobranças de atraso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="multa-atraso" className="text-xs">Multa por atraso (R$)</Label>
              <Input
                id="multa-atraso"
                type="text"
                inputMode="decimal"
                value={multaValue}
                onChange={(e) => setMultaValue(e.target.value)}
                placeholder="15,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="juros-diario" className="text-xs">Juros por dia de atraso (R$)</Label>
              <Input
                id="juros-diario"
                type="text"
                inputMode="decimal"
                value={jurosValue}
                onChange={(e) => setJurosValue(e.target.value)}
                placeholder="7,00"
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSaveCobranca}>
            Salvar regras
          </Button>
        </CardContent>
      </Card>

      {/* ── DETRAN-GO ──────────────────────────────────────────────────── */}
      <Card className={detranCfg ? "border-blue-200 dark:border-blue-900/40" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Consulta de Débitos — DETRAN-GO</CardTitle>
            </div>
            {detranCfg
              ? <Badge className="gap-1 text-xs bg-blue-600 hover:bg-blue-600"><ShieldCheck className="h-3 w-3" />Conectado</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Não configurado</Badge>
            }
          </div>
          <CardDescription>
            Consulte multas e IPVA dos seus veículos diretamente no portal do DETRAN-GO, com atribuição automática ao locatário do período.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {detranCfg ? (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Conta conectada
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-mono">
                    {maskLogin(detranCfg.login)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Suas credenciais estão criptografadas e são usadas apenas para consultas dos veículos desta locadora.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configure o acesso ao portal DETRAN-GO para habilitar a consulta automática de multas e IPVA na página de Multas.
            </p>
          )}
          <Button
            variant={detranCfg ? "outline" : "default"}
            size="sm"
            onClick={() => setDetranOpen(true)}
          >
            {detranCfg ? "Editar credenciais" : "Conectar ao DETRAN-GO"}
          </Button>
        </CardContent>
      </Card>

      <AsaasConfigDialog
        open={asaasOpen}
        onClose={() => setAsaasOpen(false)}
        onSave={handleSaveAsaas}
        initial={asaasCfg}
        companyName={activeCompany?.nome}
      />

      <DetranConfigDialog
        open={detranOpen}
        onClose={() => setDetranOpen(false)}
        onSave={handleSaveDetran}
        current={detranCfg}
        companyName={activeCompany?.nome}
      />
    </div>
  );
}
