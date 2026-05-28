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

function resolveStatus(doc: AutDoc): string {
  const sigs = doc.signatures;
  if (!sigs.length) return "enviado";
  if (sigs.some(s => s.rejected)) return "cancelado";
  if (sigs.every(s => s.signed)) return "assinado";
  return "enviado";
}

// Extrai número do contrato do nome do documento
function parseNumero(name: string): string | null {
  const n = name.toUpperCase();
  const m = n.match(/(?:#|_|CONTRATO\s*)(\d{4,6})(?:\b|_)/);
  return m ? m[1].replace(/^0+/, "") : null;
}

// Extrai placa do nome do documento (Mercosul ou antigo)
function parsePlaca(name: string): string | null {
  const n = name.toUpperCase();
  const m = n.match(/[A-Z]{3}[\-]?[0-9][A-Z0-9][0-9]{2}/);
  return m ? m[0].replace("-", "") : null;
}

// Normaliza string para comparação (sem acento, minúsculo, sem espaços duplos)
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Verifica se a data do documento está dentro (ou próxima ±7 dias) do período da locação
function withinRentalPeriod(docDate: string, dataInicio: string | null, dataFim: string | null): boolean {
  if (!dataInicio) return true; // sem data de início, aceita
  const doc = new Date(docDate).getTime();
  const inicio = new Date(dataInicio).getTime() - 7 * 86400000; // 7 dias de tolerância antes
  const fim = dataFim ? new Date(dataFim).getTime() + 7 * 86400000 : Date.now();
  return doc >= inicio && doc <= fim;
}

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
    return new Response(JSON.stringify({ ok: true, message: "Nenhuma empresa com Autentique configurado" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { updated: 0, linked: 0, skipped: 0, errors: [] as string[] };

  for (const company of companies) {
    const token = company.autentique_config?.token;
    if (!token) continue;

    // ── Busca documentos no Autentique ──
    let autDocs: AutDoc[];
    try {
      autDocs = await fetchAllDocuments(token);
    } catch (e) {
      summary.errors.push(`[${company.id}] ${e instanceof Error ? e.message : "erro Autentique"}`);
      continue;
    }
    if (!autDocs.length) continue;

    // ── Dados do banco desta empresa ──
    const { data: existingContracts } = await supabase
      .from("contracts")
      .select("id, autentique_id, status, rental_id")
      .eq("company_id", company.id) as {
        data: Array<{ id: string; autentique_id: string | null; status: string; rental_id: string | null }> | null
      };

    const autIdMap = new Map(
      (existingContracts || []).filter(c => c.autentique_id).map(c => [c.autentique_id!, c])
    );

    // Locações com datas e moto
    const { data: rentals } = await supabase
      .from("rentals")
      .select("id, numero, moto_id, cliente_id, data_inicio, data_fim_contrato, company_id")
      .eq("company_id", company.id) as {
        data: Array<{
          id: string; numero: number | null; moto_id: string; cliente_id: string;
          data_inicio: string | null; data_fim_contrato: string | null; company_id: string;
        }> | null
      };

    // Motos
    const { data: motos } = await supabase
      .from("motorcycles")
      .select("id, placa")
      .in("id", [...new Set((rentals || []).map(r => r.moto_id))]) as {
        data: Array<{ id: string; placa: string }> | null
      };

    // Clientes
    const { data: clients } = await supabase
      .from("clients")
      .select("id, nome, email, cpf")
      .in("id", [...new Set((rentals || []).map(r => r.cliente_id))]) as {
        data: Array<{ id: string; nome: string; email: string | null; cpf: string | null }> | null
      };

    // Mapas auxiliares
    const motoById = new Map((motos || []).map(m => [m.id, m]));
    const clientById = new Map((clients || []).map(c => [c.id, c]));

    // número → rentals (pode ter mais de uma locação com mesmo número em edge cases)
    const rentalsByNum = new Map<string, typeof rentals extends null ? never[] : NonNullable<typeof rentals>>();
    // placa normalizada → rentals
    const rentalsByPlaca = new Map<string, NonNullable<typeof rentals>>();
    // nome normalizado do cliente → rentals
    const rentalsByNome = new Map<string, NonNullable<typeof rentals>>();
    // email → rentals
    const rentalsByEmail = new Map<string, NonNullable<typeof rentals>>();

    for (const r of rentals || []) {
      if (r.numero) {
        const key = String(r.numero);
        if (!rentalsByNum.has(key)) rentalsByNum.set(key, []);
        rentalsByNum.get(key)!.push(r);
      }
      const moto = motoById.get(r.moto_id);
      if (moto?.placa) {
        const key = moto.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (!rentalsByPlaca.has(key)) rentalsByPlaca.set(key, []);
        rentalsByPlaca.get(key)!.push(r);
      }
      const client = clientById.get(r.cliente_id);
      if (client?.nome) {
        const key = norm(client.nome);
        if (!rentalsByNome.has(key)) rentalsByNome.set(key, []);
        rentalsByNome.get(key)!.push(r);
      }
      if (client?.email) {
        const key = client.email.toLowerCase();
        if (!rentalsByEmail.has(key)) rentalsByEmail.set(key, []);
        rentalsByEmail.get(key)!.push(r);
      }
    }

    // Encontra a locação com maior pontuação de match para um documento
    function findBestRental(doc: AutDoc): string | null {
      // Nome do primeiro assinante (locatário)
      const signerName = doc.signatures[0]?.name ?? "";
      const signerEmail = doc.signatures[0]?.email ?? "";

      const numero = parseNumero(doc.name);
      const placa = parsePlaca(doc.name);
      const signerNorm = norm(signerName);
      const signerEmailLow = signerEmail.toLowerCase();

      // Scoring: cada rental recebe pontos por critério
      const scores = new Map<string, number>();

      const addScore = (list: typeof rentals, pts: number) => {
        for (const r of list || []) {
          scores.set(r.id, (scores.get(r.id) ?? 0) + pts);
        }
      };

      if (numero) addScore(rentalsByNum.get(numero) ?? [], 40);
      if (placa) addScore(rentalsByPlaca.get(placa) ?? [], 30);
      if (signerNorm) addScore(rentalsByNome.get(signerNorm) ?? [], 25);
      if (signerEmailLow) addScore(rentalsByEmail.get(signerEmailLow) ?? [], 25);

      if (!scores.size) return null;

      // Candidatos com pontuação >= 25 (pelo menos um critério além do número)
      const candidates = [...scores.entries()]
        .filter(([, s]) => s >= 25)
        .sort((a, b) => b[1] - a[1]);

      if (!candidates.length) return null;

      // Aplica filtro de período: prefere rentals dentro do intervalo da data do documento
      const rentalMap = new Map((rentals || []).map(r => [r.id, r]));
      const withPeriod = candidates.filter(([id]) => {
        const r = rentalMap.get(id);
        if (!r) return false;
        return withinRentalPeriod(doc.created_at, r.data_inicio, r.data_fim_contrato);
      });

      const winner = withPeriod.length ? withPeriod[0] : candidates[0];
      return winner[0];
    }

    // ── Processa cada documento ──
    for (const doc of autDocs) {
      const newStatus = resolveStatus(doc);
      const signedAt = doc.signatures.find(s => s.signed)?.signed?.created_at ?? null;

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
        c => c.rental_id === rentalId && c.autentique_id === doc.id
      );
      if (alreadyLinked) { summary.skipped++; continue; }

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
