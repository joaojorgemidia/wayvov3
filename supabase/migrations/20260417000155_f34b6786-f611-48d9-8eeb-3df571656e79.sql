-- Update handle_new_user to also assign role: first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_any_admin boolean;
  new_role public.app_role;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT DO NOTHING;

  -- Determine role: first user => admin, others => visualizador
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_any_admin;
  IF has_any_admin THEN
    new_role := 'visualizador';
  ELSE
    new_role := 'admin';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();