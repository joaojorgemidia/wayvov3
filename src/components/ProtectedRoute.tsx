import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Permission = "canCreate" | "canEdit" | "canDelete" | "canManageUsers";

interface ProtectedRouteProps {
  requiredPermission?: Permission;
}

export function ProtectedRoute({ requiredPermission }: ProtectedRouteProps = {}) {
  const { user, loading } = useAuth();
  const permissions = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredPermission && !permissions[requiredPermission]) {
    toast.error("Acesso não autorizado");
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
