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

const UF_OPTIONS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

export default function DetranConfigDialog({ open, onClose, onSave, current, companyName }: Props) {
  const [login, setLogin] = useState(current?.login ?? "");
  const [loginField, setLoginField] = useState<"cpf" | "cnpj">(current?.loginField ?? "cpf");
  const [uf, setUf] = useState(current?.uf ?? "GO");
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
        loginField,
        uf: uf.toUpperCase(),
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

        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white/20 p-2">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-white text-base font-semibold">
                Integração com DETRAN
              </DialogTitle>
              {companyName && (
                <p className="text-blue-100 text-xs mt-0.5">{companyName}</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Explicação */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              Para que serve?
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A Wayvo usa a API{" "}
              <a
                href="https://www.infosimples.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5"
              >
                Infosimples <ExternalLink className="h-3 w-3" />
              </a>{" "}
              para consultar multas e restrições dos veículos da frota diretamente no DETRAN.
              Informe o login e senha do portal do DETRAN do seu estado.
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

            {/* UF */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                UF da frota
                <span className="ml-1 text-xs font-normal text-muted-foreground">(estado onde os veículos estão registrados)</span>
              </Label>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {UF_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Tipo de login */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tipo de login no portal DETRAN</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLoginField("cpf")}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                    loginField === "cpf"
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-input text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  CPF
                </button>
                <button
                  type="button"
                  onClick={() => setLoginField("cnpj")}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                    loginField === "cnpj"
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-input text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  CNPJ / e-mail
                </button>
              </div>
            </div>

            {/* Login */}
            <div className="space-y-1.5">
              <Label htmlFor="detran-login" className="text-sm font-medium">
                {loginField === "cnpj" ? "CNPJ ou e-mail" : "CPF"} do portal DETRAN
              </Label>
              <Input
                id="detran-login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder={loginField === "cnpj" ? "Ex: empresa@email.com ou 00.000.000/0001-00" : "Ex: 000.000.000-00"}
                autoComplete="username"
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="detran-senha" className="text-sm font-medium">
                Senha do portal DETRAN
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
                  placeholder={isEditing ? "••••••••" : "Senha do portal DETRAN"}
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

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-500" />
            Use o mesmo login e senha que você usa no portal do DETRAN do seu estado.
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
              {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Conectar ao DETRAN"}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
