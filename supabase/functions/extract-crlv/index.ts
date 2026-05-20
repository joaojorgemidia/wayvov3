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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64 } = await req.json();
    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "pdfBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_AI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending PDF to Gemini for CRLV extraction...");

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: "user",
            parts: [
              { text: userPrompt },
              { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
            ],
          }],
          generationConfig: { responseMimeType: "text/plain" },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao processar documento com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();

    if (!aiResult.candidates || aiResult.candidates.length === 0) {
      const blockReason = aiResult.promptFeedback?.blockReason ?? "sem candidatos";
      console.error("Gemini blocked:", blockReason);
      return new Response(
        JSON.stringify({ error: "Documento não pôde ser processado. Tente outro arquivo." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = aiResult.candidates[0]?.content?.parts?.[0]?.text ?? "";
    console.log("Gemini raw response:", content);

    let extracted: Record<string, unknown>;
    try {
      extracted = parseJsonFromText(content);
    } catch (parseError) {
      console.error("Failed to parse Gemini response as JSON:", parseError, "raw:", content);
      return new Response(
        JSON.stringify({ error: "Não foi possível interpretar os dados do documento. Tente novamente." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Extracted CRLV data:", JSON.stringify(extracted));

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-crlv error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
