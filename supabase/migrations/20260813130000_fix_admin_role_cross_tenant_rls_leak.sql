-- O cargo "admin" no app é por empresa (gestor/dono de UMA locadora — ver
-- src/hooks/usePermissions.ts: canManageUsers/canDelete usam isAdmin, mas
-- canManageEmpresas usa isSuperAdmin). Essas políticas usavam has_role(...,'admin')
-- para liberar acesso irrestrito a TODAS as empresas, permitindo que o gestor de
-- uma locadora enxergasse/gerenciasse dados (inclusive chaves de API) de qualquer
-- outra locadora na plataforma. Corrige para exigir 'superadmin', o cargo que já
-- era o pretendido para operação multi-tenant (canManageEmpresas).

alter policy "Admins can delete action_history" on public.action_history
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Author or admin can update action_history" on public.action_history
  using (
    (company_id = any (get_user_companies(auth.uid())))
    and ((user_id = auth.uid()) or has_role(auth.uid(), 'superadmin'::app_role))
  );

alter policy "Admins can read audit logs" on public.audit_log
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can manage companies" on public.companies
  using (has_role(auth.uid(), 'superadmin'::app_role))
  with check (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can insert profiles" on public.profiles
  with check (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can update profiles" on public.profiles
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can view all profiles" on public.profiles
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can manage companies" on public.user_companies
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can view all companies" on public.user_companies
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can manage roles" on public.user_roles
  using (has_role(auth.uid(), 'superadmin'::app_role));

alter policy "Admins can view all roles" on public.user_roles
  using (has_role(auth.uid(), 'superadmin'::app_role));
