import { useState, useMemo } from "react";
import { Copy, Check, Search, BookOpen, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  TokenContext,
  TokenMap,
  tokensByContext,
} from "@/lib/message-tokens";

interface TokenPaletteProps {
  context: TokenContext;
  values?: TokenMap;
  /** Disparado ao clicar em "Inserir". Recebe o token literal (ex.: "{NOME}"). */
  onInsert?: (token: string) => void;
  /** Começa aberta? Default: false (recolhida). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Paleta de tokens consultável e clicável.
 * - Filtra por contexto (troca-oleo, manutencao, vistoria, etc.)
 * - Mostra descrição e VALOR ATUAL de cada token (quando disponível)
 * - Botão "Inserir" coloca {TOKEN} no campo de mensagem
 * - Botão de copiar para a área de transferência
 */
export function TokenPalette({
  context,
  values = {},
  onInsert,
  defaultOpen = false,
  className,
}: TokenPaletteProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const groups = useMemo(() => tokensByContext(context, values), [context, values]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.token.toLowerCase().includes(q) ||
            it.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const totalCount = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center justify-between gap-2 rounded-md border-2 border-primary/40",
            "bg-primary/10 hover:bg-primary/15 px-4 py-3 text-sm transition-colors shadow-sm",
          )}
        >
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            Dicionário de variáveis
            <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">
              {totalCount}
            </span>
            <span className="text-xs text-muted-foreground font-normal hidden sm:inline">
              clique para inserir {"{NOME}"}, {"{PLACA}"}…
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-primary transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 space-y-3">
        <div className="rounded-lg border bg-card p-3 space-y-3">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar variável… (ex.: placa, telefone)"
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Grupos */}
          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma variável encontrada para "{query}"
              </p>
            )}
            {filtered.map((g) => (
              <div key={g.group} className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-1">
                  {g.label}
                </p>
                <div className="grid gap-1">
                  {g.items.map((it) => (
                    <div
                      key={it.token}
                      className="group flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 hover:border-primary/40 transition-colors"
                    >
                      <code className="text-[11px] font-mono font-semibold text-primary shrink-0">
                        {it.token}
                      </code>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-muted-foreground truncate">
                          {it.description}
                        </p>
                        {it.value && (
                          <p className="text-[11px] text-foreground/80 truncate font-medium">
                            → {it.value}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => handleCopy(it.token)}
                          title="Copiar"
                        >
                          {copied === it.token ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        {onInsert && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => onInsert(it.token)}
                          >
                            Inserir
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground border-t pt-2">
            💡 Clique em <strong>Inserir</strong> para adicionar a variável na mensagem.
            Ela será substituída automaticamente pelo valor real ao enviar.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}