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
          signed { created_at }
          rejected { created_at }
        }
      }
    }
  }
`;

interface AutDoc {
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
}

async function fetchAllDocuments(token: string): Promise<AutDoc[]> {
  const all: AutDoc[] = [];
  let page = 1;
  let total = Infinity;

  while (all.length < total) {
    const res = await fetch(AUTENTIQUE_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: LIST_DOCUMENTS_QUERY, variables: { page } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Autentique API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    console.log("[autentique-sync] API response page", page, JSON.stringify(json).slice(0, 300));
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

function resolveStatus(doc: AutDoc): string {
  const sigs = doc.signatures;
  if (!sigs.length) return "enviado";
  if (sigs.some(s => s.rejected)) return "cancelado";
  if (sigs.every(s => s.signed)) return "assinado";
  return "enviado";
}

// Normaliza string para comparação: sem acento, minúsculo, sem espaços duplos
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Placa Mercosul (ABC1D23) ou antigo (ABC-1234 / ABC1234)
function parsePlaca(text: string): string | null {
  const m = text.toUpperCase().match(/[A-Z]{3}[\-]?[0-9][A-Z0-9][0-9]{2}/);
  return m ? m[0].replace("-", "") : null;
}

// Extrai e normaliza telefone: só dígitos, ignora DDI +55
function normFone(text: string): string | null {
  // Captura padrão brasileiro: (XX) 9XXXX-XXXX, XX 9XXXX-XXXX, etc.
  const m = text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)[\s\-]?9?\d{4}[\s\-]?\d{4}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  // Remove DDI 55 se presente e resultado > 11 dígitos
  const clean = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return clean.length >= 10 ? clean.slice(-11) : null; // últimos 11 dígitos (DDD+9+número)
}

// Verifica se a data do documento está dentro do período da locação (±7 dias de tolerância)
function withinRentalPeriod(
  docDate: string,
  dataInicio: string | null,
  dataFim: string | null,
): boolean {
  if (!dataInicio) return true;
  const doc = new Date(docDate).getTime();
  const inicio = new Date(dataInicio).getTime() - 7 * 86400_000;
  const fim = dataFim ? new Date(dataFim).getTime() + 7 * 86400_000 : Date.now();
  return doc >= inicio && doc <= fim;
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { company_id?: string } = {};
  try { body = await req.json(); } catch { /* sem body */ }

  const companyQuery = body.company_id
    ? supabase.from("companies").select("id, autentique_config").eq("id", body.company_id).not("autentique_config", "is", null)
    : supabase.from("companies").select("id, autentique_config").not("autentique_config", "is", null);

  const { data: companies } = await companyQuery;
  if (!companies?.length) {
    return new Response(
      JSON.stringify({ ok: true, message: "Nenhuma empresa com Autentique configurado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const summary = { updated: 0, linked: 0, skipped: 0, errors: [] as string[] };

  for (const company of companies) {
    const token = company.autentique_config?.token;
    if (!token) continue;

    // ── Documentos do Autentique ──────────────────────────────────────────
    let autDocs: AutDoc[];
    try {
      autDocs = await fetchAllDocuments(token);
    } catch (e) {
      summary.errors.push(`[${company.id}] ${e instanceof Error ? e.message : "erro Autentique"}`);
      continue;
    }
    if (!autDocs.length) continue;

    // ── Dados do banco desta empresa ─────────────────────────────────────
    const { data: existingContracts } = await supabase
      .from("contracts")
      .select("id, autentique_id, status, rental_id")
      .eq("company_id", company.id) as {
        data: Array<{ id: string; autentique_id: string | null; status: string; rental_id: string | null }> | null;
      };

    const autIdMap = new Map(
      (existingContracts || []).filter(c => c.autentique_id).map(c => [c.autentique_id!, c]),
    );

    const { data: rentals } = await supabase
      .from("rentals")
      .select("id, numero, moto_id, cliente_id, data_inicio, data_fim_contrato")
      .eq("company_id", company.id) as {
        data: Array<{
          id: string; numero: number | null;
          moto_id: string; cliente_id: string;
          data_inicio: string | null; data_fim_contrato: string | null;
        }> | null;
      };

    const motoIds = [...new Set((rentals || []).map(r => r.moto_id))];
    const clientIds = [...new Set((rentals || []).map(r => r.cliente_id))];

    const [motosRes, clientsRes] = await Promise.all([
      supabase.from("motorcycles").select("id, placa").in("id", motoIds) as Promise<{ data: Array<{ id: string; placa: string }> | null }>,
      supabase.from("clients").select("id, nome, email, telefone").in("id", clientIds) as Promise<{ data: Array<{ id: string; nome: string; email: string | null; telefone: string | null }> | null }>,
    ]);

    const motoById = new Map((motosRes.data || []).map(m => [m.id, m]));
    const clientById = new Map((clientsRes.data || []).map(c => [c.id, c]));

    // ── Índices de matching ───────────────────────────────────────────────
    type Rental = NonNullable<typeof rentals>[number];

    // Por placa normalizada → lista de locações
    const byPlaca = new Map<string, Rental[]>();
    // Por nome normalizado do cliente → lista de locações
    const byNome = new Map<string, Rental[]>();
    // Por email → lista de locações
    const byEmail = new Map<string, Rental[]>();
    // Por telefone normalizado (11 dígitos) → lista de locações
    const byFone = new Map<string, Rental[]>();
    // Lookup direto por id
    const rentalById = new Map<string, Rental>();

    for (const r of rentals || []) {
      rentalById.set(r.id, r);

      const moto = motoById.get(r.moto_id);
      if (moto?.placa) {
        const k = moto.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        (byPlaca.get(k) ?? (byPlaca.set(k, []), byPlaca.get(k)!)).push(r);
      }

      const client = clientById.get(r.cliente_id);
      if (client?.nome) {
        const k = norm(client.nome);
        (byNome.get(k) ?? (byNome.set(k, []), byNome.get(k)!)).push(r);
      }
      if (client?.email) {
        const k = client.email.toLowerCase();
        (byEmail.get(k) ?? (byEmail.set(k, []), byEmail.get(k)!)).push(r);
      }
      if (client?.telefone) {
        const k = normFone(client.telefone);
        if (k) (byFone.get(k) ?? (byFone.set(k, []), byFone.get(k)!)).push(r);
      }
    }

    // ── Scoring ──────────────────────────────────────────────────────────
    // Critérios OBRIGATÓRIOS: nome (30 pts) + placa (30 pts) → mínimo 60
    // Critérios BÔNUS:        email (+20), período/data_inicio (+15), telefone (+15)
    // Threshold mínimo = 60 (exige que nome E placa estejam presentes)

    function findBestRental(doc: AutDoc): string | null {
      const signerName  = norm(doc.signatures[0]?.name ?? "");
      const signerEmail = (doc.signatures[0]?.email ?? "").toLowerCase();
      const docPlaca    = parsePlaca(doc.name);
      const docFone     = normFone(doc.name) ?? normFone(doc.signatures[0]?.name ?? "");

      const scores = new Map<string, number>();
      const add = (list: Rental[] | undefined, pts: number) => {
        for (const r of list || []) scores.set(r.id, (scores.get(r.id) ?? 0) + pts);
      };

      // Critérios obrigatórios
      if (signerName) add(byNome.get(signerName), 30);
      if (docPlaca)   add(byPlaca.get(docPlaca), 30);

      // Bônus
      if (signerEmail) add(byEmail.get(signerEmail), 20);
      if (docFone)     add(byFone.get(docFone), 15);

      // Nenhum candidato → sem match
      if (!scores.size) return null;

      // Filtra candidatos com >= 60 pts (nome + placa obrigatoriamente)
      const candidates = [...scores.entries()]
        .filter(([, s]) => s >= 60)
        .sort((a, b) => b[1] - a[1]);

      if (!candidates.length) return null;

      // Aplica bônus de período: prefere locações cujo intervalo engloba a data do documento
      const withPeriod = candidates.filter(([id]) => {
        const r = rentalById.get(id);
        return r ? withinRentalPeriod(doc.created_at, r.data_inicio, r.data_fim_contrato) : false;
      });

      // Bônus de período (+15 pts) já embutido na ordenação via withPeriod prioritário
      return ((withPeriod.length ? withPeriod : candidates)[0])[0];
    }

    // ── Processa cada documento ───────────────────────────────────────────
    for (const doc of autDocs) {
      const newStatus = resolveStatus(doc);
      const signedAt  = doc.signatures.find(s => s.signed)?.signed?.created_at ?? null;

      // Caso 1: já está vinculado → atualiza status se mudou
      const existing = autIdMap.get(doc.id);
      if (existing) {
        if (existing.status !== newStatus) {
          await supabase.from("contracts").update({
            status: newStatus,
            autentique_url: doc.link,
            ...(signedAt ? { signed_at: signedAt } : {}),
          }).eq("id", existing.id);
          summary.updated++;
        } else {
          summary.skipped++;
        }
        continue;
      }

      // Caso 2: não vinculado → tenta casar
      const rentalId = findBestRental(doc);

      const alreadyLinked = (existingContracts || []).some(
        c => c.rental_id === rentalId && c.autentique_id === doc.id,
      );
      if (alreadyLinked) { summary.skipped++; continue; }

      const { error: insErr } = await supabase.from("contracts").insert({
        company_id:      company.id,
        rental_id:       rentalId,
        nome:            doc.name,
        status:          newStatus,
        autentique_id:   doc.id,
        autentique_url:  doc.link,
        created_at:      doc.created_at,
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
