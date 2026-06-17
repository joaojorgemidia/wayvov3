import { useAuth } from "@/contexts/AuthContext";

export function usePermissions() {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("superadmin");
  const isAdmin = isSuperAdmin || roles.includes("admin");
  const isOperador = roles.includes("operador");
  const isVisualizador = roles.includes("visualizador");
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
  };
}
