import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadCompanies, saveCompanies } from "@/lib/companies";
import { WayvoLogo } from "@/components/WayvoLogo";

function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function SignupPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [emailExists, setEmailExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailExists(false);

    const cnpjDigits = cnpj.replace(/\D/g, "");
    if (!name.trim()) return setError("Informe seu nome.");
    if (!companyName.trim()) return setError("Informe o nome da empresa.");
    if (cnpjDigits.length !== 14) return setError("CNPJ deve ter 14 dígitos.");
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirmPassword) return setError("As senhas não coincidem.");

    setSubmitting(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${SUPABASE_URL}/functions/v1/signup-with-company`;
      console.log("[Signup] POST", url);

      let resp: Response;
      try {
        resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            display_name: name.trim(),
            company_name: companyName.trim(),
            cnpj: cnpjDigits,
            email: email.trim().toLowerCase(),
            password,
          }),
        });
      } catch (netErr: any) {
        console.error("[Signup] network error", netErr);
        setError("Falha de rede ao contatar o servidor. Verifique sua conexão e tente novamente.");
        setSubmitting(false);
        return;
      }

      const text = await resp.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
      console.log("[Signup] response", resp.status, data);


      if (!resp.ok || data?.error) {
        const msg = data?.error || `Erro ${resp.status} ao criar conta`;
        setError(msg);
        if (/já está cadastrado|already registered|already exists|duplicate/i.test(msg)) {
          setEmailExists(true);
        }
        setSubmitting(false);
        return;
      }

      const newCompanyId = data?.company_id as string;
      if (newCompanyId) {
        const existing = loadCompanies();
        if (!existing.find((c) => c.id === newCompanyId)) {
          saveCompanies([...existing, { id: newCompanyId, nome: companyName.trim(), cnpj: cnpjDigits }]);
        }
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        toast.success("Conta criada! Faça login para continuar.");
        navigate("/login");
        return;
      }

      toast.success("Conta criada com sucesso!");
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err?.message || "Erro ao criar conta. Tente novamente.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <WayvoLogo variant="light" />
          </div>
          <CardTitle className="text-xl">Criar Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name">Seu Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Nome da Empresa</Label>
              <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar Senha</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {emailExists && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate("/login", { state: { email: email.trim().toLowerCase() } })}
              >
                Ir para o login
              </Button>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Conta
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="text-foreground hover:underline">
                Entrar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
