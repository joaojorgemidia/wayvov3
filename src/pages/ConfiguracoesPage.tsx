import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, CreditCard, CheckCircle2, XCircle } from "lucide-react";
import AsaasConfigDialog from "@/components/AsaasConfigDialog";
import { AsaasConfig } from "@/lib/companies";

export default function ConfiguracoesPage() {
  const { activeCompany, updateAsaasConfig } = useCompany();
  const [asaasOpen, setAsaasOpen] = useState(false);

  const asaasCfg = activeCompany?.asaasConfig;

  const handleSaveAsaas = async (config: AsaasConfig) => {
    await updateAsaasConfig(activeCompany.id, config);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Configurações</h1>
      </div>

      {/* Asaas / Cobranças */}
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

      <AsaasConfigDialog
        open={asaasOpen}
        onClose={() => setAsaasOpen(false)}
        onSave={handleSaveAsaas}
        initial={asaasCfg}
        companyName={activeCompany?.nome}
      />
    </div>
  );
}
