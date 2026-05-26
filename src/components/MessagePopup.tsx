import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, Check, MessageCircle, Pencil, Send, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, sanitizeWhatsAppNumber } from "@/lib/whatsapp";
import { applyTokens } from "@/lib/message-tokens";
import { maskPhone } from "@/lib/masks";
import { TokenPalette } from "@/components/TokenPalette";
import type { TokenContext } from "@/lib/message-tokens";

export interface MessagePopupProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  mensagem: string;
  placa: string;
  cliente: string;
  telefone: string;
  highlights: { label: string; value: string; tone: "primary" | "warning" | "danger" }[];
  keyword?: string;
  templateKey: string;
  tokens: Record<string, string>;
  /** Contexto exibido pela paleta de tokens. Default: "troca-oleo". */
  paletteContext?: TokenContext;
}

// v2: prefixo novo — invalida modelos antigos que foram salvos com tokenização
// gulosa (substrings curtas como "05" ou "64,00" corrompiam datas e dinheiro).
const TEMPLATE_STORAGE_PREFIX = "wayvo:msg-template:v2:";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Substitui valores conhecidos por {TOKEN} de forma segura:
 *  - exige boundary (não-alfanumérico) antes/depois do match
 *  - ignora valores muito curtos (<4 chars) e puramente numéricos
 *  - ordena do maior para o menor para evitar colisões */
function tokenizeMessage(text: string, tokens: Record<string, string>): string {
  let out = text;
  const entries = Object.entries(tokens)
    .filter(([, v]) => {
      if (!v || v.length < 4) return false;
      // pula valores que são só dígitos/pontuação (ex.: "05", "2026", "64,00")
      if (!/[A-Za-zÀ-ÿ]/.test(v)) return false;
      return true;
    })
    .sort((a, b) => b[1].length - a[1].length);
  for (const [token, value] of entries) {
    const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(value)}(?=$|[^A-Za-z0-9])`, "g");
    out = out.replace(re, (_m, pre) => `${pre}${token}`);
  }
  return out;
}

function renderTemplate(template: string, tokens: Record<string, string>): string {
  let out = template;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value);
  }
  return out;
}

export function MessagePopup({
  open, onOpenChange, title, mensagem, placa, cliente, telefone,
  highlights, keyword, templateKey, tokens, paletteContext = "troca-oleo",
}: MessagePopupProps) {
  const [copied, setCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [editValue, setEditValue] = useState(mensagem);
  const [savedAt, setSavedAt] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setEditValue((v) => v + token);
      return;
    }
    const start = ta.selectionStart ?? editValue.length;
    const end = ta.selectionEnd ?? editValue.length;
    const next = editValue.slice(0, start) + token + editValue.slice(end);
    setEditValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    if (!open) return;
    let initial = mensagem;
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_PREFIX + templateKey);
      if (saved) initial = renderTemplate(saved, tokens);
    } catch { /* ignora */ }
    setEditValue(initial);
    setCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mensagem, templateKey, savedAt]);

  const hasCustomTemplate = (() => {
    try { return !!localStorage.getItem(TEMPLATE_STORAGE_PREFIX + templateKey); }
    catch { return false; }
  })();

  const isDirty = editValue !== mensagem || hasCustomTemplate;
  const renderedValue = applyTokens(editValue, tokens);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderedValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar"); }
  };

  const handleCopyPhone = async () => {
    const formatted = maskPhone(telefone || "");
    if (!formatted) { toast.error("Sem telefone cadastrado"); return; }
    try {
      await navigator.clipboard.writeText(formatted);
      setPhoneCopied(true);
      toast.success(`Telefone copiado: ${formatted}`);
      setTimeout(() => setPhoneCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar o telefone"); }
  };

  const waNumber = sanitizeWhatsAppNumber(telefone);
  const waUrl = buildWhatsAppUrl(telefone, renderedValue);

  const handleCopyBeforeSend = async () => {
    try { await navigator.clipboard.writeText(renderedValue); } catch { /* segue */ }
  };

  const handleSaveTemplate = () => {
    try {
      const template = tokenizeMessage(editValue, tokens);
      localStorage.setItem(TEMPLATE_STORAGE_PREFIX + templateKey, template);
      setSavedAt(Date.now());
      toast.success("Modelo salvo como padrão");
    } catch { toast.error("Não foi possível salvar o modelo"); }
  };

  const handleResetTemplate = () => {
    try {
      localStorage.removeItem(TEMPLATE_STORAGE_PREFIX + templateKey);
      setEditValue(mensagem);
      setSavedAt(Date.now());
      toast.success("Modelo restaurado para o padrão original");
    } catch { toast.error("Não foi possível restaurar o modelo"); }
  };

  const toneClass = (t: "primary" | "warning" | "danger") =>
    t === "primary" ? "text-primary" : t === "warning" ? "text-warning" : "text-destructive";
  const toneBg = (t: "primary" | "warning" | "danger") =>
    t === "primary" ? "bg-primary/5 border-primary/20"
      : t === "warning" ? "bg-warning/5 border-warning/20"
      : "bg-destructive/5 border-destructive/20";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-gradient-to-br from-primary/5 to-transparent">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Placa</p>
              <p className="font-mono font-bold text-foreground mt-0.5">{placa}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Locatário</p>
              <p className="font-medium text-foreground mt-0.5 truncate">{cliente || "—"}</p>
            </div>
          </div>

          {highlights.length > 0 && (
            <div className="grid gap-2">
              {highlights.map((h, i) => (
                <div key={i} className={cn("flex items-center justify-between rounded-lg border px-4 py-2.5", toneBg(h.tone))}>
                  <span className="text-sm text-muted-foreground">{h.label}</span>
                  <span className={cn("text-base font-bold", toneClass(h.tone))}>{h.value}</span>
                </div>
              ))}
            </div>
          )}

          {keyword && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Palavra-chave do dia</p>
              <p className="text-2xl font-bold text-warning tracking-widest mt-1">{keyword.toUpperCase()}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Pencil className="h-3 w-3 text-muted-foreground" />
                Mensagem (editável)
              </Label>
              {hasCustomTemplate && (
                <span className="text-[10px] uppercase tracking-wide font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  Modelo personalizado
                </span>
              )}
            </div>
            <TokenPalette context={paletteContext} values={tokens} onInsert={insertToken} />
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full rounded-md border border-input bg-muted/30 px-3 py-2.5 text-sm font-mono text-foreground/90 leading-relaxed resize-y min-h-[200px] max-h-[360px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <p className="text-[11px] text-muted-foreground">
                Edite o texto livremente. Use <strong>"Salvar como padrão"</strong> para usar este modelo em todas as próximas mensagens.
              </p>
              <div className="flex gap-1.5">
                {hasCustomTemplate && (
                  <Button size="sm" variant="ghost" onClick={handleResetTemplate} className="h-7 text-xs text-muted-foreground hover:text-destructive">
                    Restaurar original
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleSaveTemplate} disabled={!isDirty} className="h-7 text-xs gap-1">
                  <Check className="h-3 w-3" />
                  Salvar como padrão
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={handleCopyPhone}
            variant="outline"
            disabled={!telefone}
            className={cn("gap-2", phoneCopied && "border-success text-success")}
            title={telefone ? `Copiar ${maskPhone(telefone)}` : "Sem telefone cadastrado"}
          >
            {phoneCopied ? <Check className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            {phoneCopied ? "Copiado!" : "Copiar telefone"}
          </Button>
          <Button onClick={handleCopy} variant="outline" className={cn("gap-2", copied && "border-success text-success")}>
            {copied ? (<><Check className="h-4 w-4" /> Copiado!</>) : (<><Copy className="h-4 w-4" /> Copiar</>)}
          </Button>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleCopyBeforeSend}
            title={waNumber ? `Abrir WhatsApp de ${telefone}` : "Abrir WhatsApp (sem número cadastrado)"}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-medium bg-[#25D366] text-white hover:bg-[#1ebe57] transition-colors"
          >
            <Send className="h-4 w-4" />
            {waNumber ? "Enviar no WhatsApp" : "Abrir WhatsApp"}
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}