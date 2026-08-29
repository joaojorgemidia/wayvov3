import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { useCollections } from "@/hooks/useCollections";
import { CollectionModule, CollectionRule, MODULE_LABELS, MODULE_ICONS, MODULE_TONES } from "@/lib/collections";
import { CollectionRuleEditor } from "@/components/CollectionRuleEditor";

const ALL_MODULES: CollectionModule[] = ["pagamento", "multa", "outras_receitas", "oleo", "vistoria", "manutencao"];

/**
 * Régua de cobrança por etapa, para todos os módulos (Aluguel, Multas, Óleo,
 * Vistoria, Manutenção, Outras receitas). Centralizado aqui — antes existia
 * duplicado dentro de Troca de Óleo, Vistoria e na aba "Configurações" de
 * Cobranças (Lista de tarefas).
 */
export function CollectionRulesSection() {
  const { rules, saveRule } = useCollections();
  const [editing, setEditing] = useState<Record<CollectionModule, CollectionRule>>(() => rules);
  useEffect(() => { setEditing(rules); }, [rules]);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 text-sm flex items-start gap-3">
          <SettingsIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold text-foreground">Régua de cobrança por etapa</div>
            <div className="text-muted-foreground">
              Configure, para cada tipo de tarefa, quantas etapas tem a cobrança, quantos dias após o vencimento cada etapa dispara e qual o texto padrão da mensagem.
              Estas configurações valem em Cobranças (Lista de tarefas), Troca de Óleo, Vistoria, Multas de trânsito e Manutenção.
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              Tokens disponíveis: <code>{"{NOME}"}</code>, <code>{"{PLACA}"}</code>, <code>{"{MODELO}"}</code>, <code>{"{VALOR_DIARIO}"}</code> entre outros.
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pagamento" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
          {ALL_MODULES.map((m) => {
            const Icon = MODULE_ICONS[m];
            const tone = MODULE_TONES[m];
            return (
              <TabsTrigger key={m} value={m} className="gap-1.5 data-[state=active]:bg-background">
                <Icon className={`h-4 w-4 ${tone.text}`} />
                {MODULE_LABELS[m]}
                <Badge variant="outline" className="ml-1 text-[10px] py-0 h-4">
                  {editing[m]?.stages.length ?? 0}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {ALL_MODULES.map((m) => {
          const Icon = MODULE_ICONS[m];
          const tone = MODULE_TONES[m];
          return (
            <TabsContent key={m} value={m} className="mt-4 space-y-3">
              <div className={`rounded-lg border ${tone.bgSoft} p-4 flex items-center gap-3`}>
                <div className={`h-10 w-10 rounded-md grid place-items-center ${tone.stripe} text-primary-foreground`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className={`text-base font-semibold ${tone.text}`}>{MODULE_LABELS[m]}</div>
                  <div className="text-xs text-muted-foreground">
                    {editing[m]?.enabled ? "Régua ativa" : "Régua desativada"} • {editing[m]?.stages.length ?? 0} etapa(s)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`enabled-tab-${m}`} className="text-xs">Ativa</Label>
                  <Switch
                    id={`enabled-tab-${m}`}
                    checked={editing[m]?.enabled ?? true}
                    onCheckedChange={(v) =>
                      setEditing((prev) => ({ ...prev, [m]: { ...prev[m], enabled: v } }))
                    }
                  />
                </div>
              </div>
              <CollectionRuleEditor
                hideTitle
                rule={editing[m]}
                onChange={(r) => setEditing((prev) => ({ ...prev, [m]: r }))}
                onSave={async (r) => { await saveRule(r); toast.success(`Régua de ${MODULE_LABELS[m]} salva`); }}
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
