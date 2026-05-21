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
    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64 || typeof pdfBase64 !== "string") return fail("pdfBase64 is required", 400);

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) return fail("GOOGLE_AI_API_KEY not configured", 500);

    const detectedMime = mimeType || "application/pdf";
    console.log("Sending document to Gemini for CNH extraction, mime:", detectedMime);

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
              { inlineData: { mimeType: detectedMime, data: pdfBase64 } },
            ],
          }],
          generationConfig: { responseMimeType: "text/plain", thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      if (response.status === 429) return fail("Limite de requisições excedido. Tente novamente em alguns segundos.");
      return fail("Erro ao processar documento com IA. Tente novamente.");
    }

    const aiResult = await response.json();

    if (!aiResult.candidates || aiResult.candidates.length === 0) {
      const blockReason = aiResult.promptFeedback?.blockReason ?? "sem candidatos";
      console.error("Gemini blocked:", blockReason);
      return fail("Documento não pôde ser processado. Tente outro arquivo.");
    }

    const parts: { thought?: boolean; text?: string }[] = aiResult.candidates[0]?.content?.parts ?? [];
    const content = parts.find(p => !p.thought && typeof p.text === "string")?.text ?? "";
    console.log("Gemini raw response:", content);

    let extracted: Record<string, unknown>;
    try {
      extracted = parseJsonFromText(content);
    } catch (parseError) {
      console.error("Failed to parse Gemini response as JSON:", parseError, "raw:", content);
      return fail("Não foi possível interpretar os dados do documento. Tente novamente.");
    }

    console.log("Extracted CNH data:", JSON.stringify(extracted));
    return ok(extracted);
  } catch (error) {
    console.error("extract-cnh error:", error);
    return fail(error instanceof Error ? error.message : "Erro desconhecido", 500);
  }
});
