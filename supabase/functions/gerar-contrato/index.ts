import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync, zipSync, strToU8, strFromU8 } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReplacementMap(
  rental: Record<string, unknown>,
  client: Record<string, unknown>,
  moto: Record<string, unknown>,
): Record<string, string> {
  const fmt = (d: unknown) =>
    d ? new Date(String(d) + "T00:00:00").toLocaleDateString("pt-BR") : "";
  const fmtBRL = (v: unknown) =>
    Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const enderecoParts = [
    client.rua,
    client.numero ? `, ${client.numero}` : "",
    client.complemento ? `, ${client.complemento}` : "",
    client.bairro ? ` - ${client.bairro}` : "",
    client.cidade ? `, ${client.cidade}` : "",
    client.estado ? ` - ${client.estado}` : "",
    client.cep ? `, CEP: ${client.cep}` : "",
  ].join("").trim();

  const numContrato = rental.numero
    ? String(rental.numero).padStart(5, "0")
    : String(rental.id).slice(0, 6).toUpperCase();

  const caucaoVal = Number(rental.valor_caucao || 0);

  return {
    "{LOCAT_NOME}": String(client.nome || ""),
    "{LOCAT_ENDERECO}": enderecoParts,
    "{LOCAT_TELEFONE}": String(client.telefone || ""),
    "{LOCATARIO_CPF}": String(client.cpf || ""),
    "{COND_N-CNH}": String(client.cnh || ""),
    "{LOCC_N}": numContrato,
    "{LOCC_D-INICIO}": fmt(rental.data_inicio),
    "{LOCC_D-FIM}": fmt(rental.data_fim_contrato),
    "{LOCC_V-ALUGUEL}": rental.valor_diario ? `R$ ${fmtBRL(rental.valor_diario)}` : "",
    "{LOCC_V-CAUCAO}": caucaoVal > 0 ? `R$ ${fmtBRL(caucaoVal)}` : "Sem caução",
    "{PLACA}": String(moto.placa || ""),
    "{MODELO}": String(moto.modelo || ""),
    "{ANO}": moto.ano_modelo ? String(moto.ano_modelo) : "",
    "{COR}": String(moto.cor || ""),
    "{CHASSI}": String(moto.chassi || ""),
    "{RENAVAM}": String(moto.renavam || ""),
    "{Nº_MOTOR}": String(moto.num_motor || ""),
    "{KM_ATUAL}": rental.km_inicio ? String(rental.km_inicio) : "",
    "{NIVEL_COMBUSTIVEL}": String(rental.nivel_combustivel || ""),
  };
}

// Aplica substituições no XML do documento.
// Tenta resolver placeholders divididos entre <w:t> adjacentes dentro do mesmo parágrafo.
function applyReplacements(xml: string, map: Record<string, string>): string {
  // 1. Mescla texto de runs adjacentes dentro de cada parágrafo para capturar placeholders divididos
  let result = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
    // Concatena todos os textos do parágrafo
    const texts: string[] = [];
    const tRegex = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = tRegex.exec(para)) !== null) texts.push(m[1]);
    const full = texts.join("");

    // Se algum placeholder está presente no texto completo, faz substituição simples
    let hasPh = false;
    for (const ph of Object.keys(map)) {
      if (full.includes(ph)) { hasPh = true; break; }
    }
    if (!hasPh) return para;

    // Coloca todo o texto do parágrafo no primeiro <w:t> e zera os demais
    let first = true;
    return para.replace(/<w:t(?:[^>]*)>[\s\S]*?<\/w:t>/g, (tag, _offset) => {
      if (first) {
        first = false;
        // Substituição no texto completo
        let replaced = full;
        for (const [ph, val] of Object.entries(map)) {
          replaced = replaced.split(ph).join(xmlEscape(val));
        }
        return tag.replace(/>([\s\S]*?)<\/w:t>/, `>${replaced}</w:t>`);
      }
      return tag.replace(/>([\s\S]*?)<\/w:t>/, "></w:t>");
    });
  });

  // 2. Substituição direta para qualquer placeholder que tenha ficado fora de <w:p>
  for (const [ph, val] of Object.entries(map)) {
    result = result.split(ph).join(xmlEscape(val));
  }

  return result;
}

async function enviarAutentique(
  token: string,
  fileName: string,
  docBytes: Uint8Array,
  signerName: string,
  signerEmail: string,
): Promise<{ id: string; link: string; signerLink: string }> {
  const query = `
    mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id name link
        signatures { public_id name email link }
      }
    }
  `;

  const operations = JSON.stringify({
    query,
    variables: {
      document: { name: fileName },
      signers: [{ name: signerName, email: signerEmail, action: "SIGN" }],
      file: null,
    },
  });

  const formData = new FormData();
  formData.append("operations", operations);
  formData.append("map", JSON.stringify({ "0": ["variables.file"] }));
  formData.append("0", new Blob([docBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), fileName);

  const res = await fetch("https://api.autentique.com.br/2/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);

  const doc = json.data?.createDocument;
  return {
    id: doc.id,
    link: doc.link,
    signerLink: doc.signatures?.[0]?.link ?? doc.link,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { rental_id?: string; template_id?: string; enviar_autentique?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Payload inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { rental_id, template_id, enviar_autentique } = body;
  if (!rental_id || !template_id) {
    return new Response(JSON.stringify({ error: "rental_id e template_id são obrigatórios" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca dados da locação
  const { data: rental } = await supabase
    .from("rentals")
    .select("*")
    .eq("id", rental_id)
    .single();

  if (!rental) {
    return new Response(JSON.stringify({ error: "Locação não encontrada" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca cliente, moto e template em paralelo
  const [clientRes, motoRes, tmplRes, companyRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", rental.cliente_id).single(),
    supabase.from("motorcycles").select("*").eq("id", rental.moto_id).single(),
    supabase.from("contract_templates").select("*").eq("id", template_id).single(),
    supabase.from("companies").select("autentique_config").eq("id", rental.company_id).single(),
  ]);

  const client = clientRes.data;
  const moto = motoRes.data;
  const template = tmplRes.data;

  if (!client || !moto || !template) {
    return new Response(JSON.stringify({ error: "Dados incompletos para geração do contrato" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Download do template DOCX
  const { data: tmplBlob, error: dlErr } = await supabase.storage
    .from("contratos")
    .download(template.storage_path);

  if (dlErr || !tmplBlob) {
    return new Response(JSON.stringify({ error: "Erro ao baixar template: " + dlErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tmplBytes = new Uint8Array(await tmplBlob.arrayBuffer());

  // Descomprime o DOCX (ZIP)
  let zipFiles: Record<string, Uint8Array>;
  try {
    zipFiles = unzipSync(tmplBytes);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Template inválido (não é um DOCX válido)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const replacements = buildReplacementMap(rental, client, moto);

  // Aplica substituições nos XMLs relevantes do DOCX
  const xmlPaths = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];
  for (const path of xmlPaths) {
    if (zipFiles[path]) {
      const original = strFromU8(zipFiles[path]);
      const replaced = applyReplacements(original, replacements);
      zipFiles[path] = strToU8(replaced);
    }
  }

  // Recomprime o DOCX
  const generatedBytes = zipSync(zipFiles, { level: 6 });

  // Nome do arquivo
  const numContrato = rental.numero
    ? String(rental.numero).padStart(5, "0")
    : String(rental.id).slice(0, 6).toUpperCase();
  const placa = (moto.placa as string || "").replace(/[^A-Za-z0-9]/g, "");
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const fileName = `Contrato_${numContrato}_${placa}_${timestamp}.docx`;
  const storagePath = `generated/${rental.company_id}/${rental_id}/${fileName}`;

  // Upload para o Supabase Storage
  const { error: upErr } = await supabase.storage
    .from("contratos")
    .upload(storagePath, generatedBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (upErr) {
    return new Response(JSON.stringify({ error: "Erro ao salvar contrato: " + upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // URL assinada para download (7 dias)
  const { data: urlData } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  let autentiqueId: string | null = null;
  let autentiqueUrl: string | null = null;

  // Envio para Autentique (se solicitado e token configurado)
  if (enviar_autentique) {
    const autentiqueToken = companyRes.data?.autentique_config?.token;
    if (autentiqueToken && client.email) {
      try {
        const at = await enviarAutentique(
          autentiqueToken,
          fileName,
          generatedBytes,
          client.nome as string,
          client.email as string,
        );
        autentiqueId = at.id;
        autentiqueUrl = at.signerLink;
      } catch (e) {
        console.error("[gerar-contrato] Autentique error:", e);
      }
    }
  }

  // Persiste o registro do contrato
  const { data: contract } = await supabase
    .from("contracts")
    .insert({
      company_id: rental.company_id,
      rental_id,
      template_id,
      nome: fileName,
      status: autentiqueId ? "enviado" : "gerado",
      storage_path: storagePath,
      autentique_id: autentiqueId,
      autentique_url: autentiqueUrl,
    })
    .select()
    .single();

  console.log("[gerar-contrato]", { contract_id: contract?.id, rental_id, autentiqueId });

  return new Response(
    JSON.stringify({
      ok: true,
      contract_id: contract?.id,
      nome: fileName,
      download_url: urlData?.signedUrl,
      autentique_url: autentiqueUrl,
      status: contract?.status,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
