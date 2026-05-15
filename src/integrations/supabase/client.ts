import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://qmwfotbczcruxaoemfde.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtd2ZvdGJjemNydXhhb2VtZmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzk3MzYsImV4cCI6MjA5MTkxNTczNn0.Dg_Tb8tQDcEKwWufK0K27qXu-_6Htk5gQ_oV_uUlGpU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
