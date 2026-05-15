import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "pdfBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const detectedMime = mimeType || "application/pdf";
    console.log("Sending document to AI for CNH extraction, mime:", detectedMime);

    const systemPrompt = `Você é um especialista em extrair dados de documentos CNH (Carteira Nacional de Habilitação) digitais brasileiras.
Analise o documento PDF fornecido e extraia TODOS os campos disponíveis.
Retorne APENAS um JSON válido com os campos encontrados. Se um campo não for encontrado, use null.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia os dados desta CNH digital e retorne um JSON com exatamente estes campos:
{
  "nome": "string ou null (nome completo do condutor)",
  "cpf": "string ou null (CPF do condutor)",
  "numeroCnh": "string ou null (número de registro da CNH)",
  "categoria": "string ou null (categoria da CNH: A, B, AB, etc)",
  "validade": "string ou null (data de validade no formato YYYY-MM-DD)"
}
Retorne SOMENTE o JSON, sem markdown, sem explicação.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${detectedMime};base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao processar documento com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    console.log("AI raw response:", content);

    let extracted: Record<string, unknown>;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response as JSON");
      return new Response(
        JSON.stringify({ error: "Não foi possível interpretar os dados do documento. Tente novamente." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Extracted CNH data:", JSON.stringify(extracted));

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-cnh error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
