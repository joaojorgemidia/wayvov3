import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, KeyRound, Eye, EyeOff } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { setPrivacyEnabled } from "@/lib/data-cache";
import { toast } from "sonner";

const SUPER_ADMIN_EMAIL = "contatojoaojorge@gmail.com";
const PRIVACY_LS_KEY = "demo-privacy-enabled";

export function Layout() {
  const { signOut, user } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const isSuperAdmin = (user?.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
  const [privacyOn, setPrivacyOn] = useState(false);

  // Restaura preferência do super admin
  useEffect(() => {
    if (!isSuperAdmin) {
      setPrivacyEnabled(false);
      setPrivacyOn(false);
      return;
    }
    const saved = localStorage.getItem(PRIVACY_LS_KEY) === "1";
    setPrivacyEnabled(saved);
    setPrivacyOn(saved);
  }, [isSuperAdmin]);

  const togglePrivacy = () => {
    const next = !privacyOn;
    setPrivacyOn(next);
    setPrivacyEnabled(next);
    localStorage.setItem(PRIVACY_LS_KEY, next ? "1" : "0");
    toast.success(next ? "Modo demo ativado — dados mascarados" : "Modo demo desativado");
  };

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-[#D0EDDC] bg-white px-4 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <CompanySwitcher />
              {isSuperAdmin && privacyOn && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-medium">
                  MODO DEMO
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <Button
                  variant={privacyOn ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                  onClick={togglePrivacy}
                  title="Mascarar dados sensíveis para gravação de demos"
                >
                  {privacyOn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="text-sm hidden sm:inline">{privacyOn ? "Demo ON" : "Demo"}</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span className="text-sm hidden sm:inline">{user?.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover">
                  <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPwdOpen(true)}>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Alterar senha
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
          <main className="flex-1 overflow-auto min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
