import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface BulkAction {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
}

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}

/** Barra flutuante de ações em massa — aparece quando há itens selecionados numa lista. */
export function BulkActionBar({ count, onClear, actions }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-2 rounded-full border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
      <span className="text-sm font-medium whitespace-nowrap">
        {count} selecionado{count !== 1 ? "s" : ""}
      </span>
      <div className="h-4 w-px bg-border shrink-0" />
      {actions.map(a => (
        <Button
          key={a.label}
          size="sm"
          variant={a.variant || "outline"}
          onClick={a.onClick}
          className="gap-1.5"
        >
          {a.icon && <a.icon className="h-3.5 w-3.5" />}
          {a.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={onClear} className="gap-1.5 text-muted-foreground">
        <X className="h-3.5 w-3.5" /> Limpar
      </Button>
    </div>
  );
}

/** Checkbox de cabeçalho pra selecionar/desselecionar todos os itens visíveis de uma lista. */
export function SelectAllCheckbox({
  ids, selected, onChange,
}: {
  ids: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
  const someSelected = ids.some(id => selected.has(id));
  return (
    <input
      type="checkbox"
      aria-label={allSelected ? "Desmarcar todos" : "Selecionar todos"}
      checked={allSelected}
      ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
      onChange={() => {
        if (allSelected) {
          const next = new Set(selected);
          ids.forEach(id => next.delete(id));
          onChange(next);
        } else {
          onChange(new Set([...selected, ...ids]));
        }
      }}
      onClick={e => e.stopPropagation()}
      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
    />
  );
}

export function toggleSelected(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
