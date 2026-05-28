import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Instagram, Lock } from "lucide-react";
import { WayvoLogo } from "@/components/WayvoLogo";

const INSTAGRAM = "https://www.instagram.com/joaojorge.midia";

export default function SignupPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0FFF8] p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex justify-center">
          <WayvoLogo variant="light" size={40} />
        </div>

        <div className="bg-white rounded-xl border border-black/8 p-8 space-y-5 shadow-sm">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-[#F0FFF8] flex items-center justify-center">
              <Lock className="h-6 w-6 text-[#00C86A]" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-[#0A1810]">Acesso por convite</h1>
            <p className="text-sm text-[#687A6E] leading-relaxed">
              A Wayvo está em acesso antecipado. Para solicitar uma conta, entre em contato pelo Instagram.
            </p>
          </div>

          <a
            href={INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-md font-semibold text-sm transition hover:opacity-90"
            style={{ backgroundColor: "#0A1810", color: "#fff" }}
          >
            <Instagram className="h-4 w-4" />
            @joaojorge.midia
          </a>

          <p className="text-xs text-[#687A6E]">
            Já tem acesso?{" "}
            <a href="/login" className="text-[#0A1810] font-medium hover:underline">
              Entrar
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
