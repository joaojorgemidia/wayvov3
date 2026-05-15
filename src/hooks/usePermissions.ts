import { useAuth } from "@/contexts/AuthContext";

export function usePermissions() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isOperador = roles.includes("operador");
  const isVisualizador = roles.includes("visualizador");
  return {
    canView: true,
    canCreate: isAdmin || isOperador,
    canEdit: isAdmin || isOperador,
    canDelete: isAdmin,
    canManageUsers: isAdmin,
    isAdmin,
    isOperador,
    isVisualizador,
  };
}
