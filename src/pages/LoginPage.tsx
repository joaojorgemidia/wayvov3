import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { WayvoLogo } from "@/components/WayvoLogo";

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failCount, setFailCount] = useState(0);

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
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        setFailCount((n) => n + 1);
        setError("Email ou senha incorretos.");
        setSubmitting(false);
        return;
      }
      // Don't force reload — Navigate above will redirect reactively when `user` updates
    } catch {
      setError("Erro ao fazer login. Tente novamente.");
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
          <CardTitle className="text-xl">Entrar no Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                {failCount >= 1 && (
                  <Link
                    to="/forgot-password"
                    className="flex items-center justify-center gap-1.5 w-full rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    Redefinir minha senha por email
                  </Link>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Entrar
            </Button>
            <div className="text-center space-y-2">
              {failCount === 0 && (
                <Link to="/forgot-password" className="block text-sm text-muted-foreground hover:text-foreground">
                  Esqueci minha senha
                </Link>
              )}
              <p className="text-sm text-muted-foreground">
                Não tem conta?{" "}
                <Link to="/signup" className="text-foreground hover:underline">
                  Criar conta
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
