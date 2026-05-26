import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractWithFallback, corsHeaders } from "../_shared/extract-ai.ts";

const systemPrompt = `Você é um especialista em extrair dados de documentos CRLV (Certificado de Registro e Licenciamento de Veículo) brasileiros.
Analise o documento PDF fornecido e extraia TODOS os campos disponíveis.
Retorne APENAS um JSON válido com os campos encontrados. Se um campo não for encontrado, use null.`;

const userPrompt = `Extraia os dados deste CRLV e retorne um JSON com exatamente estes campos:
{
  "placa": "string ou null",
  "modelo": "string ou null (marca/modelo completo)",
  "anoModelo": "number ou null (ano/modelo)",
  "cor": "string ou null",
  "chassi": "string ou null (17 caracteres)",
  "renavam": "string ou null (11 dígitos)",
  "numMotor": "string ou null",
  "combustivel": "string ou null",
  "proprietario": "string ou null (nome do proprietário)"
}
Retorne SOMENTE o JSON, sem markdown, sem explicação.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64) {
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
      claudeOnly: true,
    });

    console.log("Extracted CRLV data:", JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("extract-crlv error:", msg);
    return new Response(
      JSON.stringify({ error: "Não foi possível ler o CRLV. Tente novamente ou preencha manualmente.", detail: msg }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
