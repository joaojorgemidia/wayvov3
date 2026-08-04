import { Layers } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { FinancialEntry } from "@/lib/types";

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDataBR = (iso: string) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

/**
 * Badge exibida ao lado de uma cobrança que reúne várias cobranças originais
 * (geradas ao encerrar uma locação com >1 pendência em aberto — ver LocacoesPage
 * confirmEncerrar). As originais foram soft-deletadas e não existem mais no cache
 * do app, então a única fonte para a composição é o snapshot em consolidatedItems.
 * Renderiza null se a entrada não for uma cobrança consolidada.
 */
export function CobrancaConsolidadaBadge({ entry }: { entry: FinancialEntry }) {
  if (!entry.consolidatedItems?.length) return null;
  const itens = entry.consolidatedItems;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()}>
          <Badge variant="secondary" className="gap-1 cursor-pointer">
            <Layers className="h-3 w-3" />
            {itens.length} cobranças
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" onClick={e => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Composição da cobrança consolidada
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {itens.map((item, idx) => (
            <div key={item.originalEntryId || idx} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium leading-tight">{item.descricao}</p>
                <p className="text-xs text-muted-foreground">venc. {fmtDataBR(item.dataPrevista)}</p>
              </div>
              <span className="font-mono text-xs tabular-nums shrink-0">{fmtBRL(item.valor)}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
