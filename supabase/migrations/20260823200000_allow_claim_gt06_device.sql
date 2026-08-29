-- Permite que staff "reivindique" uma TAG GT06 recém-conectada (company_id ainda
-- nulo, criada pelo servidor TCP na primeira conexão do aparelho — ver
-- gt06-server/src/supabase.js) atribuindo-a à própria empresa, digitando o IMEI
-- impresso no aparelho. Antes disso só o service role conseguia gravar
-- company_id, então vincular uma TAG nova exigia SQL manual.
--
-- USING agora aceita linha já da própria empresa OU ainda sem dono (NULL) —
-- mas o WITH CHECK (que valida o valor final, pós-update) continua exigindo
-- que o company_id final seja uma das empresas do usuário. Isso bloqueia tanto
-- "roubar" uma TAG já vinculada a outra empresa (USING não libera linha de
-- empresa alheia) quanto reatribuir pra empresa errada (WITH CHECK barra).
DROP POLICY IF EXISTS "Staff can update own company gt06_devices" ON public.gt06_devices;

CREATE POLICY "Staff can update own company gt06_devices"
  ON public.gt06_devices FOR UPDATE
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (
      (company_id = ANY (get_user_companies(auth.uid())) OR company_id IS NULL)
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (
      company_id = ANY (get_user_companies(auth.uid()))
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role))
    )
  );
