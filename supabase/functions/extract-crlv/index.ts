import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function parseJsonFromText(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("No JSON object found in response");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const { pdfBase64 } = await req.json();
    if (!pdfBase64) return fail("pdfBase64 is required", 400);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return fail("ANTHROPIC_API_KEY not configured", 500);

    console.log("Sending PDF to Claude for CRLV extraction...");

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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "Você é um especialista em extrair dados de documentos CRLV (Certificado de Registro e Licenciamento de Veículo) brasileiros. Analise o documento fornecido e extraia TODOS os campos disponíveis. Retorne APENAS um JSON válido com os campos encontrados. Se um campo não for encontrado, use null.",
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: userPrompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return fail("Erro ao processar documento com IA. Tente novamente.");
    }

    const aiResult = await response.json();
    const content = aiResult.content?.[0]?.text ?? "";
    console.log("Claude raw response:", content);

    let extracted: Record<string, unknown>;
    try {
      extracted = parseJsonFromText(content);
    } catch (parseError) {
      console.error("Failed to parse Claude response as JSON:", parseError, "raw:", content);
      return fail("Não foi possível interpretar os dados do documento. Tente novamente.");
    }

    console.log("Extracted CRLV data:", JSON.stringify(extracted));
    return ok(extracted);
  } catch (error) {
    console.error("extract-crlv error:", error);
    return fail(error instanceof Error ? error.message : "Erro desconhecido", 500);
  }
});
