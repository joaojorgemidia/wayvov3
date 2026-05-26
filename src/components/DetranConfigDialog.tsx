import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetranConfig } from "@/lib/companies";
import {
  ShieldCheck, Eye, EyeOff, AlertTriangle, Lock, Info,
  CheckCircle2, ExternalLink, Trash2
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (config: DetranConfig | null) => Promise<void>;
  current?: DetranConfig | null;
  companyName?: string;
}

export default function DetranConfigDialog({ open, onClose, onSave, current, companyName }: Props) {
  const [login, setLogin] = useState(current?.login ?? "");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isEditing = !!current;
  const canSave = login.trim().length > 0 && (senha.length > 0 || isEditing);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        login: login.trim(),
        senhaHash: senha || current?.senhaHash || "",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) { setConfirmRemove(true); return; }
    setSaving(true);
    try {
      await onSave(null);
      onClose();
    } finally {
      setSaving(false);
      setConfirmRemove(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setConfirmRemove(false); } }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">

        {/* Header com gradiente */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white/20 p-2">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-white text-base font-semibold">
                Integração com DETRAN-GO
              </DialogTitle>
              {companyName && (
                <p className="text-blue-100 text-xs mt-0.5">{companyName}</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Explicação clara */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              Para que serve?
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A Wayvo usa seu login do portal{" "}
              <a
                href="https://www.detran.go.gov.br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5"
              >
                detran.go.gov.br <ExternalLink className="h-3 w-3" />
              </a>{" "}
              para consultar automaticamente multas e débitos dos veículos da sua frota.
              Sem esse acesso, o governo não libera essas informações.
            </p>
          </div>

          {/* Segurança */}
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-400">
              <Lock className="h-4 w-4 shrink-0" />
              Como protegemos seus dados
            </div>
            <ul className="space-y-1.5">
              {[
                "Credenciais salvas com criptografia no banco de dados",
                "Nunca exibidas após salvas — nem para nós",
                "Usadas apenas para consultar os veículos desta locadora",
                "Você pode remover a qualquer momento",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Formulário */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="detran-login" className="text-sm font-medium">
                Login do DETRAN-GO
                <span className="ml-1 text-xs font-normal text-muted-foreground">(CPF ou e-mail cadastrado no portal)</span>
              </Label>
              <Input
                id="detran-login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Ex: 12345678900 ou joao@email.com"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detran-senha" className="text-sm font-medium">
                Senha do DETRAN-GO
                {isEditing && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (deixe em branco para manter a atual)
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="detran-senha"
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={isEditing ? "••••••••" : "Senha do portal DETRAN-GO"}
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(!showSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Aviso se não tiver conta */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-500" />
            Não tem conta no DETRAN-GO?{" "}
            <a
              href="https://www.detran.go.gov.br"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline underline-offset-2"
            >
              Cadastre-se gratuitamente no portal
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={saving}
              className={confirmRemove ? "text-destructive border border-destructive/30 hover:bg-destructive/10" : "text-muted-foreground"}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {confirmRemove ? "Confirmar remoção" : "Remover integração"}
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => { onClose(); setConfirmRemove(false); }} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Conectar ao DETRAN-GO"}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
