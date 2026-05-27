import React, { Suspense } from "react";
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

const Index = React.lazy(() => import("./pages/Index"));
const LandingPage = React.lazy(() => import("./pages/LandingPage"));
const MotosPage = React.lazy(() => import("./pages/MotosPage"));
const ClientesPage = React.lazy(() => import("./pages/ClientesPage"));
const LocacoesPage = React.lazy(() => import("./pages/LocacoesPage"));
const ManutencoesPage = React.lazy(() => import("./pages/ManutencoesPage"));
const ManutencoesConfigPage = React.lazy(() => import("./pages/ManutencoesConfigPage"));
const MultasPage = React.lazy(() => import("./pages/MultasPage"));
const FinanceiroPage = React.lazy(() => import("./pages/FinanceiroPage"));
const RelatoriosPage = React.lazy(() => import("./pages/RelatoriosPage"));
const TrocaOleoPage = React.lazy(() => import("./pages/TrocaOleoPage"));
const VistoriaPage = React.lazy(() => import("./pages/VistoriaPage"));
const EstoquePage = React.lazy(() => import("./pages/EstoquePage"));
const RastreamentoPage = React.lazy(() => import("./pages/RastreamentoPage"));
const AntecedentesPage = React.lazy(() => import("./pages/AntecedentesPage"));
const ContasPage = React.lazy(() => import("./pages/ContasPage"));
const UsuariosPage = React.lazy(() => import("./pages/UsuariosPage"));
const EmpresasPage = React.lazy(() => import("./pages/EmpresasPage"));
const HistoricoPage = React.lazy(() => import("./pages/HistoricoPage"));
const CobrancasPage = React.lazy(() => import("./pages/CobrancasPage"));
const CobrancasSemanaPage = React.lazy(() => import("./pages/CobrancasSemanaPage"));
const SyncMigrationPage = React.lazy(() => import("./pages/SyncMigrationPage"));
const RebuildAluguelPage = React.lazy(() => import("./pages/RebuildAluguelPage"));
const ConfiguracoesPage = React.lazy(() => import("./pages/ConfiguracoesPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const SignupPage = React.lazy(() => import("./pages/SignupPage"));
const ForgotPasswordPage = React.lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = React.lazy(() => import("./pages/ResetPasswordPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

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
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<ProtectedApp />}>
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
                  <Route path="/empresas" element={<EmpresasPage />} />
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
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
