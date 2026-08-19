import { useAuth } from "@/contexts/AuthContext";

export function usePermissions() {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("superadmin");
  const isAdmin = isSuperAdmin || roles.includes("admin");
  const isOperador = roles.includes("operador");
  const isVisualizador = roles.includes("visualizador");
  // Advogado externo — acesso restrito só ao módulo Jurídico (ver
  // supabase/migrations/20260818120100_add_legal_module.sql). Alguém com esse papel e
  // nenhum outro não deve conseguir entrar no shell principal do app.
  const isJuridico = roles.includes("juridico");
  const isJuridicoOnly = isJuridico && !isAdmin && !isSuperAdmin && !isOperador && !isVisualizador;
  return {
    canView: true,
    canCreate: isAdmin || isOperador,
    canEdit: isAdmin || isOperador,
    canDelete: isAdmin,
    canManageUsers: isAdmin,
    canManageEmpresas: isSuperAdmin,
    isAdmin,
    isSuperAdmin,
    isOperador,
    isVisualizador,
    isJuridico,
    isJuridicoOnly,
  };
}
