import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractWithFallback, corsHeaders } from "../_shared/extract-ai.ts";

const systemPrompt = `Você é um especialista em extrair dados de CNH (Carteira Nacional de Habilitação) brasileira.

REGRAS CRÍTICAS — leia com atenção:

CPF:
- Procure o campo rotulado exatamente "CPF" no documento.
- O CPF tem SEMPRE 11 dígitos no formato XXX.XXX.XXX-XX (ex: 123.456.789-00).
- NÃO confunda com o número de registro da CNH (que é um número diferente, geralmente 9-11 dígitos sem pontos/traços no formato de CPF).
- NÃO confunda com RG, RENACH ou qualquer outro campo numérico.
- Se o documento mostrar um número que NÃO está no formato de CPF, retorne null para cpf.

NÚMERO DE REGISTRO (numeroCnh):
- Procure o campo rotulado "REGISTRO", "Nº REGISTRO", "N° REGISTRO" ou "NÚMERO DE REGISTRO".
- É diferente do CPF — geralmente aparece em posição separada no documento.

CATEGORIA (CAT. HAB.):
- Procure o rótulo "CAT. HAB.", "CATEGORIA" ou similar.
- Copie TODAS as letras (ex: "AB" → retorne "AB", não "A").
- Letras separadas por espaço/barra (ex: "A B", "A/B") → junte sem separador (ex: "AB").
- Categorias válidas: A, B, C, D, E, AB, AC, AD, AE (e combinações).`;

const userPrompt = `Extraia os dados desta CNH e retorne um JSON com exatamente estes campos:
{
  "nome": "string ou null (nome completo do condutor, campo NOME)",
  "cpf": "string ou null (campo CPF — formato XXX.XXX.XXX-XX, ex: '123.456.789-00'. Retorne null se não encontrar o campo CPF claramente.)",
  "numeroCnh": "string ou null (campo REGISTRO ou Nº REGISTRO — número de registro da CNH, diferente do CPF)",
  "categoria": "string ou null (campo CAT. HAB. — copie TODAS as letras, ex: 'AB' se mostrar 'AB')",
  "validade": "string ou null (data de validade no formato YYYY-MM-DD)"
}
Retorne SOMENTE o JSON, sem markdown, sem explicação.`;

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fail(error: string, status = 200) {
  return new Response(JSON.stringify({ success: false, error }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64 || typeof pdfBase64 !== "string") return fail("pdfBase64 is required", 400);

    const detectedMime = mimeType || "application/pdf";
    console.log("Sending CNH to Claude for extraction, mime:", detectedMime);

    const data = await extractWithFallback({
      systemPrompt,
      userPrompt,
      fileBase64: pdfBase64,
      mimeType: detectedMime,
      claudeOnly: true,
    });

    console.log("Extracted CNH data:", JSON.stringify(data));
    return ok(data);
  } catch (error) {
    console.error("extract-cnh error:", error);
    return fail(error instanceof Error ? error.message : "Erro desconhecido", 500);
  }
});
