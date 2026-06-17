import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Loader2, Shield, ShieldCheck, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

interface UserRow {
  user_id: string;
  display_name: string;
  email: string;
  roles: string[];
  companies: string[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operador: "Operador",
  visualizador: "Visualizador",
};
const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck className="h-3 w-3" />,
  operador: <Shield className="h-3 w-3" />,
  visualizador: <Eye className="h-3 w-3" />,
};

export default function UsuariosPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const { canManageUsers, isSuperAdmin } = usePermissions();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("operador");
  const [newCompanies, setNewCompanies] = useState<string[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("operador");
  const [editCompanies, setEditCompanies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [companyMap, setCompanyMap] = useState<Record<string, string>>({});
  const [companies, setCompanies] = useState<{ id: string; nome: string }[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email");
    if (!profiles) { setLoading(false); return; }

    const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
    const { data: allCompanies } = await supabase.from("user_companies").select("user_id, company_id");
    const { data: companyRows } = await supabase.from("companies").select("id, nome");

    // Filtra empresas pelo que o usuário logado tem permissão
    const myCompanyIds = new Set(
      (allCompanies || [])
        .filter((c: any) => c.user_id === currentUser?.id)
        .map((c: any) => c.company_id)
    );
    const visibleCompanies = (companyRows || []).filter((c: any) => myCompanyIds.has(c.id));

    setCompanies(visibleCompanies);
    setCompanyMap(Object.fromEntries((companyRows || []).map((c: any) => [c.id, c.nome])));

    const rows: UserRow[] = profiles
      .map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        email: p.email,
        roles: (allRoles || []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
        // Mostra apenas as locadoras que o usuário logado tem acesso
        companies: (allCompanies || [])
          .filter((c: any) => c.user_id === p.user_id && (isSuperAdmin || myCompanyIds.has(c.company_id)))
          .map((c: any) => c.company_id),
      }))
      .filter(u => {
        // Oculta usuários superadmin da lista de não-superadmins
        if (!isSuperAdmin && u.roles.includes("superadmin")) return false;
        return u.user_id === currentUser?.id || u.companies.some(cid => myCompanyIds.has(cid));
      });
    setUsers(rows);
    setLoading(false);
  }, [currentUser?.id, isSuperAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  if (!canManageUsers) return <Navigate to="/dashboard" replace />;

  const extractInvokeError = async (res: { error: any; data: any }): Promise<string | null> => {
    if (!res.error && !res.data?.error) return null;
    if (res.data?.error) return res.data.error;
    try {
      const body = await res.error.context.json();
      return body?.error || res.error.message;
    } catch {
      return res.error?.message || "Erro desconhecido";
    }
  };

  const handleCreate = async () => {
    if (!newEmail || !newPassword || !newCompanies.length) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const emailLower = newEmail.trim().toLowerCase();
    if (users.some(u => u.email?.toLowerCase() === emailLower)) {
      toast.error("Já existe um usuário com este e-mail");
      return;
    }
    setCreating(true);
    try {
      const res = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newEmail,
          password: newPassword,
          display_name: newName || newEmail,
          role: newRole,
          company_ids: newCompanies,
        },
      });
      const err = await extractInvokeError(res);
      if (err) {
        toast.error(err);
      } else {
        toast.success("Usuário criado com sucesso!");
        setDialogOpen(false);
        setNewEmail(""); setNewPassword(""); setNewName(""); setNewRole("operador"); setNewCompanies([]);
        fetchUsers();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setCreating(false);
  };

  const toggleCompany = (id: string) => {
    setNewCompanies(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const toggleEditCompany = (id: string) => {
    setEditCompanies(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditName(u.display_name || "");
    setEditEmail(u.email || "");
    setEditPassword("");
    setEditRole(u.roles[0] || "operador");
    setEditCompanies(u.companies);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const emailLower = editEmail.trim().toLowerCase();
    if (editEmail !== editing.email && users.some(u => u.user_id !== editing.user_id && u.email?.toLowerCase() === emailLower)) {
      toast.error("Já existe um usuário com este e-mail");
      return;
    }
    setSaving(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "update",
          user_id: editing.user_id,
          display_name: editName,
          email: editEmail,
          password: editPassword || undefined,
          role: editRole,
          company_ids: editCompanies,
        },
      });
      const err = await extractInvokeError(res);
      if (err) {
        toast.error(err);
      } else {
        toast.success("Usuário atualizado!");
        setEditOpen(false);
        fetchUsers();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "delete", user_id: deleteTarget.user_id },
      });
      const err = await extractInvokeError(res);
      if (err) {
        toast.error(err);
      } else {
        toast.success("Usuário excluído");
        setDeleteTarget(null);
        fetchUsers();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setDeleting(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do usuário" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Senha *</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Perfil de acesso</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="visualizador">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Locadoras com acesso *</Label>
                <div className="space-y-2">
                  {companies.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={newCompanies.includes(c.id)} onCheckedChange={() => toggleCompany(c.id)} />
                      <span className="text-sm">{c.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Usuário
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Locadoras</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.display_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {u.roles.filter(r => isSuperAdmin || r !== "superadmin").map(r => (
                          <Badge key={r} variant="secondary" className="gap-1">
                            {ROLE_ICONS[r]} {ROLE_LABELS[r] || r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {u.companies.map(cid => (
                          <Badge key={cid} variant="outline">{companyMap[cid] || cid}</Badge>
                        ))}
                        {u.companies.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(u)}
                          disabled={u.user_id === currentUser?.id}
                          title={u.user_id === currentUser?.id ? "Você não pode excluir a si mesmo" : "Excluir"}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nova senha (opcional)</Label>
              <Input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Deixe em branco para manter" />
            </div>
            <div className="space-y-2">
              <Label>Perfil de acesso</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="visualizador">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Locadoras com acesso</Label>
              <div className="space-y-2">
                {companies.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={editCompanies.includes(c.id)} onCheckedChange={() => toggleEditCompany(c.id)} />
                    <span className="text-sm">{c.nome}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleSaveEdit} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O usuário <strong>{deleteTarget?.display_name || deleteTarget?.email}</strong> perderá o acesso ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
