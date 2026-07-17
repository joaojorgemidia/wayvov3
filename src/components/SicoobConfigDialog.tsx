import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { SicoobConfig } from "@/lib/companies";
import type { BankAccount } from "@/hooks/useSupabaseData";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (config: SicoobConfig) => Promise<void>;
  initial?: SicoobConfig | null;
  bankAccounts: BankAccount[];
}

const DEFAULT_CONFIG: SicoobConfig = { enabled: false, ambiente: "sandbox" };

export default function SicoobConfigDialog({ open, onClose, onSave, initial, bankAccounts }: Props) {
  const [cfg, setCfg] = useState<SicoobConfig>(() => ({ ...DEFAULT_CONFIG, ...initial }));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof SicoobConfig>(key: K, val: SicoobConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(cfg);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extrato Bancário — Sicoob</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              A sincronização automática via API do Sicoob depende do <strong>client_id</strong> e do
              certificado digital cadastrados no portal Sicoob Developers — enquanto isso não estiver
              pronto, use a importação manual de CSV na aba Financeiro → Importações.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} id="sicoob-enabled" />
            <Label htmlFor="sicoob-enabled" className="text-sm font-medium leading-tight cursor-pointer">
              Ativar integração com o Sicoob?
            </Label>
          </div>

          {cfg.enabled && (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Conta bancária vinculada</Label>
                <p className="text-xs text-muted-foreground">
                  Os lançamentos importados serão associados a esta conta em Contas.
                </p>
                <Select
                  value={cfg.bankAccountId || ""}
                  onValueChange={(v) => {
                    const acc = bankAccounts.find((a) => a.id === v);
                    set("bankAccountId", v);
                    set("bankAccountNome", acc?.nome || null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Client ID (Sicoob Developers)</Label>
                <Input
                  value={cfg.clientId || ""}
                  onChange={(e) => set("clientId", e.target.value.trim() || undefined)}
                  placeholder="Cole aqui o client_id do aplicativo cadastrado"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  O certificado digital (mTLS) não é cadastrado aqui — é enviado separadamente como
                  segredo da infraestrutura, nunca pelo app.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Ambiente</Label>
                <Select value={cfg.ambiente || "sandbox"} onValueChange={(v) => set("ambiente", v as "sandbox" | "producao")}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {cfg.lastSyncAt && (
                <p className="text-xs text-muted-foreground">
                  Última sincronização: {new Date(cfg.lastSyncAt).toLocaleString("pt-BR")}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
