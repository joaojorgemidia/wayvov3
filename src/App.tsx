import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { DataProvider } from "@/contexts/DataContext";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import MotosPage from "./pages/MotosPage";
import ClientesPage from "./pages/ClientesPage";
import LocacoesPage from "./pages/LocacoesPage";
import ManutencoesPage from "./pages/ManutencoesPage";
import ManutencoesConfigPage from "./pages/ManutencoesConfigPage";
import MultasPage from "./pages/MultasPage";
import FinanceiroPage from "./pages/FinanceiroPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import TrocaOleoPage from "./pages/TrocaOleoPage";
import VistoriaPage from "./pages/VistoriaPage";
import EstoquePage from "./pages/EstoquePage";
import RastreamentoPage from "./pages/RastreamentoPage";
import AntecedentesPage from "./pages/AntecedentesPage";
import ContasPage from "./pages/ContasPage";
import UsuariosPage from "./pages/UsuariosPage";
import HistoricoPage from "./pages/HistoricoPage";
import CobrancasPage from "./pages/CobrancasPage";
import CobrancasSemanaPage from "./pages/CobrancasSemanaPage";
import NotFound from "./pages/NotFound";
import SyncMigrationPage from "./pages/SyncMigrationPage";
import RebuildAluguelPage from "./pages/RebuildAluguelPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";


const ProtectedApp = () => (
  <CompanyProvider>
    <DataProvider>
      <Layout />
    </DataProvider>
  </CompanyProvider>
);


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<ProtectedApp />}>
                <Route path="/" element={<Index />} />
                <Route path="/dashboard" element={<Index />} />
                <Route path="/motos" element={<MotosPage />} />
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/locacoes" element={<LocacoesPage />} />
                <Route path="/manutencoes" element={<ManutencoesPage />} />
                <Route path="/manutencoes/config" element={<ManutencoesConfigPage />} />
                <Route path="/multas" element={<MultasPage />} />
                <Route path="/financeiro" element={<FinanceiroPage />} />
                <Route path="/relatorios" element={<RelatoriosPage />} />
                <Route path="/troca-oleo" element={<TrocaOleoPage />} />
                <Route path="/vistoria" element={<VistoriaPage />} />
                <Route path="/estoque" element={<EstoquePage />} />
                <Route path="/rastreamento" element={<RastreamentoPage />} />
                <Route path="/antecedentes" element={<AntecedentesPage />} />
                <Route path="/contas" element={<ContasPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/historico" element={<HistoricoPage />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/cobrancas" element={<CobrancasPage />} />
                <Route path="/cobrancas/semana" element={<CobrancasSemanaPage />} />
              </Route>
            </Route>
            <Route path="/sync-migration" element={<SyncMigrationPage />} />
            <Route path="/rebuild-aluguel" element={<RebuildAluguelPage />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
