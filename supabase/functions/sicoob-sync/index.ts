import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchExtrato, SicoobNotConfiguredError } from "../_shared/sicoob-client.ts";
import { runMatchingForPendingRows, normalizeText } from "../_shared/sicoob-matching.ts";

async function deterministicUUID(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-1", data);
  const h = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-${(["8","9","a","b"])[parseInt(h[16],16)&3]}${h.slice(17,20)}-${h.slice(20,32)}`;
}

// deno-lint-ignore no-explicit-any
serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, sicoob_config")
    .not("sicoob_config", "is", null);

  if (error) {
    console.error("[sicoob-sync] erro ao buscar empresas:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: Record<string, unknown>[] = [];

  // deno-lint-ignore no-explicit-any
  for (const company of (companies || []) as any[]) {
    const cfg = company.sicoob_config;
    if (!cfg?.enabled) continue;

    try {
      const transactions = await fetchExtrato(
        { clientId: cfg.clientId, ambiente: cfg.ambiente || "sandbox", contaCorrente: cfg.contaCorrente },
        cfg.lastSyncCursor || null,
      );

      let inserted = 0;
      for (const tx of transactions) {
        const id = await deterministicUUID(`sicoob-tx:${company.id}:${tx.id}`);
        const { error: upsertError } = await supabase.from("sicoob_transactions").upsert({
          id,
          company_id: company.id,
          bank_account_id: cfg.bankAccountId || null,
          sicoob_transaction_id: tx.id,
          data: tx.data,
          tipo: tx.tipo,
          valor: tx.valor,
          descricao: tx.descricao,
          descricao_normalizada: normalizeText(tx.descricao),
          raw_payload: tx.raw,
          status: "pendente",
        }, { onConflict: "id", ignoreDuplicates: true });
        if (!upsertError) inserted++;
      }

      const matched = await runMatchingForPendingRows(supabase, company.id, cfg.bankAccountNome || null);

      await supabase.from("companies").update({
        sicoob_config: { ...cfg, lastSyncAt: new Date().toISOString() },
      }).eq("id", company.id);

      results.push({ companyId: company.id, inserted, matched });
    } catch (err) {
      if (err instanceof SicoobNotConfiguredError) {
        results.push({ companyId: company.id, skipped: "aguardando client_id/certificado" });
        continue;
      }
      console.error(`[sicoob-sync] erro empresa ${company.id}:`, err);
      results.push({ companyId: company.id, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
  });
});
