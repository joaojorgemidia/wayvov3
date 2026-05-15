// SERVER-ONLY admin client. Bypasses RLS — never import in client code.
// The *.server.ts extension blocks any client-side import at build time.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qmwfotbczcruxaoemfde.supabase.co";

const serviceRoleKey = process.env.WAYVO_SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  throw new Error(
    "WAYVO_SUPABASE_SERVICE_ROLE_KEY is not set in the server environment.",
  );
}

export const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
