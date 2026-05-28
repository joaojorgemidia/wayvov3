import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTENTIQUE_URL = "https://api.autentique.com.br/2/graphql";

const LIST_DOCUMENTS_QUERY = `
  query ListDocuments($page: Int!) {
    documents(page: $page, limit: 50) {
      total
      data {
        id
        name
        link
        created_at
        signatures {
          public_id
          name
          email
          link
          signed {
            created_at
          }
          rejected {
            created_at
          }
        }
      }
    }
  }
`;

async function fetchAllDocuments(token: string): Promise<Array<{
  id: string;
  name: string;
  link: string;
  created_at: string;
  signatures: Array<{
    public_id: string;
    name: string;
    email: string;
    link: string;
    signed: { created_at: string } | null;
    rejected: { created_at: string } | null;
  }>;
}>> {
  const all = [];
  let page = 1;
  let total = Infinity;

  while (all.length < total) {
    const res = await fetch(AUTENTIQUE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: LIST_DOCUMENTS_QUERY, variables: { page } }),
    });

    if (!res.ok) throw new Error(`Autentique API error: ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const result = json.data?.documents;
    if (!result) break;

    total = result.total;
    all.push(...result.data);
    if (result.data.length < 50) break;
    page++;
  }

  return all;
}

// Determina status do contrato a partir das assinaturas
function resolveStatus(doc: { signatures: Array<{ signed: unknown; rejected: unknown }> }): string {
  const sigs = doc.signatures;
  if (!sigs.length) return "enviado";
  if (sigs.some(s => s.rejected)) return "cancelado";
  if (sigs.every(s => s.signed)) return "assinado";
  return "enviado";
}

// Tenta extrair número do contrato e placa do nome do documento
// Espera padrões como: "Contrato_00001_ABC1234_..." ou "Contrato #00001 ABC-1234"
function parseDocName(name: string): { numero: string | null; placa: string | null } {
  const n = name.toUpperCase();

  // Número do contrato: sequência de 4-6 dígitos possivelmente precedida de # ou _
  const numMatch = n.match(/(?:#|_|CONTRATO\s*)(\d{4,6})(?:\b|_)/);
  const numero = numMatch ? numMatch[1].replace(/^0+/, "") : null;

  // Placa: padrão Mercosul (ABC1D23) ou antigo (ABC-1234 / ABC1234)
  const placaMatch = n.match(/[A-Z]{3}[\-]?[0-9][A-Z0-9][0-9]{2}/);
  const placa = placaMatch ? placaMatch[0].replace("-", "") : null;

  return { numero, placa };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { company_id?: string } = {};
  try { body = await req.json(); } catch { /* sem body */ }

  // Busca empresas com token Autentique
  const companyFilter = body.company_id
    ? supabase.from("companies").select("id, autentique_config").eq("id", body.company_id).not("autentique_config", "is", null)
    : supabase.from("companies").select("id, autentique_config").not("autentique_config", "is", null);

  const { data: companies } = await companyFilter;
  if (!companies?.length) {
    return new Response(JSON.stringify({ ok: true, message: "Nenhuma empresa com Autentique configurado" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { updated: 0, linked: 0, skipped: 0, errors: [] as string[] };

  for (const company of companies) {
    const token = company.autentique_config?.token;
    if (!token) continue;

    let autDocuments;
    try {
      autDocuments = await fetchAllDocuments(token);
    } catch (e) {
      summary.errors.push(`[${company.id}] ${e instanceof Error ? e.message : "erro Autentique"}`);
      continue;
    }

    if (!autDocuments.length) continue;

    // Busca contratos já existentes para esta empresa
    const { data: existingContracts } = await supabase
      .from("contracts")
      .select("id, autentique_id, status, rental_id")
      .eq("company_id", company.id) as { data: Array<{ id: string; autentique_id: string | null; status: string; rental_id: string | null }> | null };

    const autentiqueIdMap = new Map(
      (existingContracts || [])
        .filter(c => c.autentique_id)
        .map(c => [c.autentique_id!, c])
    );

    // Busca locações e motos desta empresa para matching
    const { data: rentals } = await supabase
      .from("rentals")
      .select("id, numero, moto_id, company_id")
      .eq("company_id", company.id) as { data: Array<{ id: string; numero: number | null; moto_id: string; company_id: string }> | null };

    const { data: motos } = await supabase
      .from("motorcycles")
      .select("id, placa")
      .in("id", (rentals || []).map(r => r.moto_id)) as { data: Array<{ id: string; placa: string }> | null };

    const motoById = new Map((motos || []).map(m => [m.id, m]));

    // Mapa: número do contrato → rental_id
    const rentalByNum = new Map<string, string>();
    // Mapa: placa normalizada → rental_id (último ativo)
    const rentalByPlaca = new Map<string, string>();

    for (const r of rentals || []) {
      if (r.numero) rentalByNum.set(String(r.numero), r.id);
      const moto = motoById.get(r.moto_id);
      if (moto?.placa) {
        const placaNorm = moto.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        rentalByPlaca.set(placaNorm, r.id);
      }
    }

    for (const doc of autDocuments) {
      const newStatus = resolveStatus(doc);
      const signedAt = doc.signatures.find(s => s.signed)?.signed?.created_at ?? null;

      // Caso 1: já está vinculado — atualiza status
      const existing = autentiqueIdMap.get(doc.id);
      if (existing) {
        if (existing.status !== newStatus) {
          await supabase
            .from("contracts")
            .update({ status: newStatus, autentique_url: doc.link, ...(signedAt ? { signed_at: signedAt } : {}) })
            .eq("id", existing.id);
          summary.updated++;
        } else {
          summary.skipped++;
        }
        continue;
      }

      // Caso 2: não vinculado — tenta casar com locação
      const { numero, placa } = parseDocName(doc.name);
      let rentalId: string | null = null;

      if (numero) rentalId = rentalByNum.get(numero) ?? null;
      if (!rentalId && placa) {
        const placaNorm = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        rentalId = rentalByPlaca.get(placaNorm) ?? null;
      }

      // Verifica se já existe contrato para essa combinação de rental + autentique_id
      const alreadyLinked = (existingContracts || []).some(
        c => c.rental_id === rentalId && c.autentique_id === doc.id
      );
      if (alreadyLinked) { summary.skipped++; continue; }

      // Insere contrato vinculado (ou solto se não encontrou locação)
      const { error: insErr } = await supabase.from("contracts").insert({
        company_id: company.id,
        rental_id: rentalId,
        nome: doc.name,
        status: newStatus,
        autentique_id: doc.id,
        autentique_url: doc.link,
        created_at: doc.created_at,
        ...(signedAt ? { signed_at: signedAt } : {}),
      });

      if (insErr) {
        summary.errors.push(`doc ${doc.id}: ${insErr.message}`);
      } else {
        summary.linked++;
      }
    }
  }

  console.log("[autentique-sync]", summary);
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
