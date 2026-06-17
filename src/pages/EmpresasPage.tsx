import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Loader2, Shield, ShieldCheck, Eye, EyeOff, Pencil, Trash2, Building2, Users, FileSignature, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Company } from "@/lib/companies";

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

export default function EmpresasPage() {
  const { user: currentUser } = useAuth();
  const { companies, updateCompany, removeCompany, updateAutentiqueConfig } = useCompany();
  const { canManageEmpresas } = usePermissions();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit company
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompanyNome, setEditCompanyNome] = useState("");
  const [editCompanyCnpj, setEditCompanyCnpj] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  // Delete company
  const [deleteCompanyTarget, setDeleteCompanyTarget] = useState<Company | null>(null);
  const [deletingCompany, setDeletingCompany] = useState(false);

  // Add user (per company)
  const [addUserCompanyId, setAddUserCompanyId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("operador");
  const [creating, setCreating] = useState(false);

  // Edit user
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("operador");
  const [savingUser, setSavingUser] = useState(false);

  // Delete user
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Autentique por empresa
  const [autCompany, setAutCompany] = useState<Company | null>(null);
  const [autToken, setAutToken] = useState("");
  const [showAutToken, setShowAutToken] = useState(false);
  const [savingAut, setSavingAut] = useState(false);

  const openAutentique = (company: Company) => {
    setAutCompany(company);
    setAutToken(company.autentiqueConfig?.token || "");
    setShowAutToken(false);
  };

  const handleSaveAutentique = async () => {
    if (!autCompany) return;
    setSavingAut(true);
    await updateAutentiqueConfig(autCompany.id, autToken.trim() ? { token: autToken.trim() } : null);
    setSavingAut(false);
    setAutCompany(null);
  };

  if (!canManageEmpresas) return <Navigate to="/dashboard" replace />;

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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email");
    if (!profiles) { setLoading(false); return; }
    const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
    const { data: allUserCompanies } = await supabase.from("user_companies").select("user_id, company_id");

    const rows: UserRow[] = profiles.map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: p.email,
      roles: (allRoles || []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
      companies: (allUserCompanies || []).filter((c: any) => c.user_id === p.user_id).map((c: any) => c.company_id),
    }));
    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const usersForCompany = (companyId: string) =>
    users.filter(u => u.companies.includes(companyId));

  // --- Company actions ---
  const openEditCompany = (company: Company) => {
    setEditingCompany(company);
    setEditCompanyNome(company.nome);
    setEditCompanyCnpj(company.cnpj || "");
    setEditCompanyOpen(true);
  };

  const handleSaveCompany = async () => {
    if (!editingCompany) return;
    if (!editCompanyNome.trim()) { toast.error("Nome da empresa é obrigatório"); return; }
    setSavingCompany(true);
    await updateCompany(editingCompany.id, { nome: editCompanyNome, cnpj: editCompanyCnpj });
    setEditCompanyOpen(false);
    setSavingCompany(false);
  };

  const handleDeleteCompany = async () => {
    if (!deleteCompanyTarget) return;
    setDeletingCompany(true);
    await removeCompany(deleteCompanyTarget.id);
    setDeleteCompanyTarget(null);
    setDeletingCompany(false);
  };

  // --- User actions ---
  const openAddUser = (companyId: string) => {
    setAddUserCompanyId(companyId);
    setNewEmail(""); setNewPassword(""); setNewName(""); setNewRole("operador");
  };

  const handleCreateUser = async () => {
    if (!addUserCompanyId || !newEmail || !newPassword) {
      toast.error("Preencha e-mail e senha");
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
          company_ids: [addUserCompanyId],
        },
      });
      const err = await extractInvokeError(res);
      if (err) {
        toast.error(err);
      } else {
        toast.success("Usuário criado com sucesso!");
        setAddUserCompanyId(null);
        fetchUsers();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setCreating(false);
  };

  const openEditUser = (u: UserRow) => {
    setEditingUser(u);
    setEditName(u.display_name || "");
    setEditEmail(u.email || "");
    setEditPassword("");
    setEditRole(u.roles[0] || "operador");
    setEditUserOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    const emailLower = editEmail.trim().toLowerCase();
    if (editEmail !== editingUser.email && users.some(u => u.user_id !== editingUser.user_id && u.email?.toLowerCase() === emailLower)) {
      toast.error("Já existe um usuário com este e-mail");
      return;
    }
    setSavingUser(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "update",
          user_id: editingUser.user_id,
          display_name: editName,
          email: editEmail,
          password: editPassword || undefined,
          role: editRole,
          company_ids: editingUser.companies,
        },
      });
      const err = await extractInvokeError(res);
      if (err) {
        toast.error(err);
      } else {
        toast.success("Usuário atualizado!");
        setEditUserOpen(false);
        fetchUsers();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingUser(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "delete", user_id: deleteUserTarget.user_id },
      });
      const err = await extractInvokeError(res);
      if (err) {
        toast.error(err);
      } else {
        toast.success("Usuário excluído");
        setDeleteUserTarget(null);
        fetchUsers();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setDeletingUser(false);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Empresas</h1>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          {companies.map(company => {
            const companyUsers = usersForCompany(company.id);
            return (
              <Card key={company.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <CardTitle className="text-lg leading-tight">{company.nome}</CardTitle>
                        {company.cnpj && (
                          <p className="text-sm text-muted-foreground mt-0.5">CPF/CNPJ: {company.cnpj}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAutentique(company)}
                        title="Configurar Autentique"
                        className={company.autentiqueConfig?.token ? "border-green-400 text-green-700 dark:text-green-400" : ""}
                      >
                        <FileSignature className="h-4 w-4 mr-1" />
                        Autentique
                        {company.autentiqueConfig?.token
                          ? <CheckCircle2 className="h-3.5 w-3.5 ml-1 text-green-500" />
                          : <XCircle className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                        }
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditCompany(company)}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
                        onClick={() => setDeleteCompanyTarget(company)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Excluir
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>Usuários ({companyUsers.length})</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openAddUser(company.id)}>
                      <Plus className="h-4 w-4 mr-1" /> Novo usuário
                    </Button>
                  </div>

                  {companyUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum usuário vinculado a esta empresa</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Perfil</TableHead>
                          <TableHead className="w-[100px] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companyUsers.map(u => (
                          <TableRow key={u.user_id}>
                            <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{u.email}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {u.roles.map(r => (
                                  <Badge key={r} variant="secondary" className="gap-1 text-xs">
                                    {ROLE_ICONS[r]} {ROLE_LABELS[r] || r}
                                  </Badge>
                                ))}
                                {u.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditUser(u)} title="Editar">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteUserTarget(u)}
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
            );
          })}
        </div>
      )}

      {/* Autentique Config Dialog */}
      <Dialog open={!!autCompany} onOpenChange={o => !o && setAutCompany(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Autentique — {autCompany?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Cole o <strong>Bearer token</strong> da API do Autentique para esta empresa.
              Encontrado em <strong>app.autentique.com.br → Perfil → API</strong>.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">Token da API</Label>
              <div className="relative">
                <Input
                  type={showAutToken ? "text" : "password"}
                  value={autToken}
                  onChange={e => setAutToken(e.target.value.trim())}
                  placeholder="Cole aqui o token do Autentique"
                  className="pr-10 font-mono text-xs"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowAutToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showAutToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {autCompany?.autentiqueConfig?.token && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 p-2.5 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Token configurado para esta empresa
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            {autCompany?.autentiqueConfig?.token && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive mr-auto"
                onClick={() => { setAutToken(""); }}
                disabled={savingAut}
              >
                Remover token
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setAutCompany(null)} disabled={savingAut}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveAutentique} disabled={savingAut}>
              {savingAut ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando…</> : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={editCompanyOpen} onOpenChange={setEditCompanyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={editCompanyNome} onChange={e => setEditCompanyNome(e.target.value)} placeholder="Nome da empresa" />
            </div>
            <div className="space-y-2">
              <Label>CPF / CNPJ</Label>
              <Input value={editCompanyCnpj} onChange={e => setEditCompanyCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
            <Button onClick={handleSaveCompany} className="w-full" disabled={savingCompany}>
              {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Company Confirmation */}
      <AlertDialog open={!!deleteCompanyTarget} onOpenChange={o => !o && setDeleteCompanyTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. A empresa <strong>{deleteCompanyTarget?.nome}</strong> e todos os vínculos de usuários serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCompany}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCompany}
              disabled={deletingCompany}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir empresa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add User Dialog */}
      <Dialog open={!!addUserCompanyId} onOpenChange={o => !o && setAddUserCompanyId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do usuário" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
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
            <Button onClick={handleCreateUser} className="w-full" disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Usuário
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
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
            <Button onClick={handleSaveUser} className="w-full" disabled={savingUser}>
              {savingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={o => !o && setDeleteUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O usuário <strong>{deleteUserTarget?.display_name || deleteUserTarget?.email}</strong> perderá o acesso ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUser}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deletingUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
