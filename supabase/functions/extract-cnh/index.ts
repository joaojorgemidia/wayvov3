import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractWithFallback, corsHeaders } from "../_shared/extract-ai.ts";

const systemPrompt = `Você é um especialista em extrair dados de documentos CNH (Carteira Nacional de Habilitação) digitais brasileiras.
Analise o documento fornecido e extraia TODOS os campos disponíveis.
Retorne APENAS um JSON válido com os campos encontrados. Se um campo não for encontrado, use null.`;

const userPrompt = `Extraia os dados desta CNH digital e retorne um JSON com exatamente estes campos:
{
  "nome": "string ou null (nome completo do condutor)",
  "cpf": "string ou null (CPF do condutor)",
  "numeroCnh": "string ou null (número de registro da CNH)",
  "categoria": "string ou null (categoria da CNH: A, B, AB, etc)",
  "validade": "string ou null (data de validade no formato YYYY-MM-DD)"
}
Retorne SOMENTE o JSON, sem markdown, sem explicação.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "pdfBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await extractWithFallback({
      systemPrompt,
      userPrompt,
      fileBase64: pdfBase64,
      mimeType: mimeType || "application/pdf",
      model: "gemini-2.5-flash",
    });

    console.log("Extracted CNH data:", JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("extract-cnh error:", msg);
    return new Response(
      JSON.stringify({ error: "Não foi possível ler a CNH. Tente novamente ou preencha manualmente.", detail: msg }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
