import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  CollectionRule,
  CollectionStage,
  DEFAULT_STAGES,
  MODULE_LABELS,
  CollectionModule,
} from "@/lib/collections";
import { TokenPalette } from "@/components/TokenPalette";
import { TokenContext } from "@/lib/message-tokens";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  rule: CollectionRule;
  onChange: (r: CollectionRule) => void;
  onSave: (r: CollectionRule) => void | Promise<void>;
  hideTitle?: boolean;
}

const MODULE_TO_CONTEXT: Record<CollectionModule, TokenContext> = {
  pagamento: "cobranca",
  multa: "multa",
  outras_receitas: "cobranca",
  oleo: "troca-oleo",
  vistoria: "vistoria",
  manutencao: "manutencao",
};

/**
 * Editor reutilizável da régua de cobrança de um módulo.
 * Usado tanto na página de Lista de tarefas (Configurações) quanto nos
 * diálogos de configuração de Troca de Óleo e Vistoria — alterações em
 * qualquer um refletem em todos, pois persistem em `collection_rules`.
 */
export function CollectionRuleEditor({ rule, onChange, onSave, hideTitle }: Props) {
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [saving, setSaving] = useState(false);
  const tokenContext = MODULE_TO_CONTEXT[rule.module] ?? "geral";

  const updateStage = (idx: number, patch: Partial<CollectionStage>) => {
    const stages = rule.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ ...rule, stages });
  };
  const insertTokenAt = (idx: number, token: string) => {
    const ta = textareaRefs.current[idx];
    const current = rule.stages[idx]?.template ?? "";
    if (!ta) {
      updateStage(idx, { template: current + token });
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    updateStage(idx, { template: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };
  const addStage = () => {
    const next = rule.stages.length + 1;
    const last = rule.stages[rule.stages.length - 1];
    onChange({
      ...rule,
      stages: [...rule.stages, { stage: next, offset_days: (last?.offset_days ?? 0) + 7, template: "" }],
    });
  };
  const removeStage = (idx: number) => {
    const stages = rule.stages
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, stage: i + 1 }));
    onChange({ ...rule, stages });
  };
  const reset = () => onChange({ ...rule, stages: DEFAULT_STAGES[rule.module] });
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(rule);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tente novamente em instantes.";
      toast.error("Não foi possível salvar a régua", { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {!hideTitle && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{MODULE_LABELS[rule.module]}</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enabled-${rule.module}`} className="text-xs">Ativa</Label>
            <Switch
              id={`enabled-${rule.module}`}
              checked={rule.enabled}
              onCheckedChange={(v) => onChange({ ...rule, enabled: v })}
            />
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-3 pt-4">
        {rule.stages.map((s, idx) => (
          <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Etapa {s.stage}</Badge>
              <Label className="text-xs">Disparar após</Label>
              <Input
                type="number"
                min={0}
                className="h-8 w-20"
                value={s.offset_days}
                onChange={(e) => updateStage(idx, { offset_days: Number(e.target.value) || 0 })}
              />
              <span className="text-xs text-muted-foreground">dias do vencimento</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={() => removeStage(idx)}
                disabled={rule.stages.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              rows={3}
              ref={(el) => { textareaRefs.current[idx] = el; }}
              value={s.template}
              placeholder="Mensagem padrão (use {NOME}, {PLACA}, etc.)"
              onChange={(e) => updateStage(idx, { template: e.target.value })}
            />
            <TokenPalette
              context={tokenContext}
              onInsert={(token) => insertTokenAt(idx, token)}
            />
          </div>
        ))}

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={addStage}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar etapa
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>Restaurar padrão</Button>
          <Button size="sm" className="ml-auto" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar régua"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}