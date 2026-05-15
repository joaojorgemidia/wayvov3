import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FollowupBadgeProps {
  sentStage: number;       // última etapa registrada (0 = nenhuma)
  totalStages: number;     // tamanho da régua
  escalated?: boolean;     // passou da última etapa sem regularização
  className?: string;
}

/**
 * Badge inline para exibir o estado da régua de cobrança em listagens.
 * Usa tokens semânticos (warning/destructive/muted).
 */
export function FollowupBadge({ sentStage, totalStages, escalated, className }: FollowupBadgeProps) {
  if (escalated) {
    return (
      <Badge
        variant="outline"
        className={cn("border-destructive/40 bg-destructive/10 text-destructive", className)}
      >
        Alerta Máximo
      </Badge>
    );
  }
  if (sentStage <= 0) {
    return (
      <Badge variant="outline" className={cn("border-muted-foreground/30 text-muted-foreground", className)}>
        Sem follow-up
      </Badge>
    );
  }
  const isLast = sentStage >= totalStages;
  return (
    <Badge
      variant="outline"
      className={cn(
        isLast
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-primary/40 bg-primary/10 text-primary",
        className,
      )}
    >
      {sentStage}º follow-up enviado
      <span className="ml-1 text-[10px] opacity-70">({sentStage}/{totalStages})</span>
    </Badge>
  );
}