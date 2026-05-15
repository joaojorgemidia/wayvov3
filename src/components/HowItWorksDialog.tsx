import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, BookOpen, ListChecks, Lightbulb, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HowItWorksStep {
  title: string;
  description: ReactNode;
}

export interface HowItWorksExample {
  title: string;
  body: ReactNode;
}

export interface HowItWorksContent {
  /** Título da página/área (ex: "Troca de Óleo"). */
  pageTitle: string;
  /** Frase curta resumindo o objetivo da página. */
  intro: ReactNode;
  /** Sequência numerada de como o sistema decide / processa. */
  steps: HowItWorksStep[];
  /** Exemplos práticos curtos. */
  examples?: HowItWorksExample[];
  /** Glossário opcional (campo → significado). */
  glossary?: { term: string; definition: ReactNode }[];
}

interface HowItWorksDialogProps {
  content: HowItWorksContent;
  /** Renderiza um trigger custom; senão um botão "?" padrão. */
  trigger?: ReactNode;
  /** Modo controlado (opcional). */
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Quando true, não renderiza trigger (apenas modo controlado externo). */
  triggerless?: boolean;
}

export function HowItWorksDialog({
  content,
  trigger,
  open,
  onOpenChange,
  triggerless,
}: HowItWorksDialogProps) {
  const defaultTrigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
      title={`Como funciona: ${content.pageTitle}`}
    >
      <HelpCircle className="h-4 w-4" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!triggerless && (
        <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            Como funciona — {content.pageTitle}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {content.intro}
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* Passo a passo */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <ListChecks className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Passo a passo do funcionamento
              </h3>
            </div>
            <ol className="space-y-2.5">
              {content.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-lg border bg-card p-3"
                >
                  <div
                    className={cn(
                      "h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary",
                      "flex items-center justify-center text-xs font-semibold",
                    )}
                  >
                    {i + 1}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {s.description}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Exemplos práticos */}
          {content.examples && content.examples.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
                  <Lightbulb className="h-4 w-4 text-warning" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Exemplos práticos
                </h3>
              </div>
              <div className="space-y-2">
                {content.examples.map((ex, i) => (
                  <div
                    key={i}
                    className="rounded-lg border-l-2 border-warning bg-warning/5 p-3"
                  >
                    <p className="text-sm font-medium text-foreground mb-1">
                      {ex.title}
                    </p>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {ex.body}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Glossário */}
          {content.glossary && content.glossary.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Glossário dos campos
                </h3>
              </div>
              <dl className="rounded-lg border bg-card divide-y">
                {content.glossary.map((g, i) => (
                  <div key={i} className="p-3 grid grid-cols-[160px_1fr] gap-3">
                    <dt className="text-xs font-medium text-foreground">
                      {g.term}
                    </dt>
                    <dd className="text-xs text-muted-foreground leading-relaxed">
                      {g.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Botão inline "Como funciona esta página?" para colocar dentro de outros dialogs. */
export function HowItWorksInlineButton({ content }: { content: HowItWorksContent }) {
  return (
    <HowItWorksDialog
      content={content}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-xs h-8"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Como funciona esta página?
        </Button>
      }
    />
  );
}