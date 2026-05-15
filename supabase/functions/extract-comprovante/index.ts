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
    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64 || typeof fileBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "fileBase64 is required" }),
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

    console.log("Sending comprovante to AI for address extraction...");

    const detectedMime = mimeType || "application/pdf";

    const systemPrompt = `Você é um especialista em extrair dados de endereço de comprovantes brasileiros (contas de luz, água, telefone, internet, correspondências bancárias, cartórios, etc).

REGRAS IMPORTANTES:
1. A imagem pode estar ROTACIONADA (de cabeça para baixo, deitada 90° ou 270°). Mentalmente gire a imagem até o texto ficar legível antes de extrair.
2. A imagem pode estar amassada, com pouca qualidade, manchada ou com partes cortadas — faça o melhor esforço possível.
3. Procure por marcadores comuns: "Destinatário:", "Endereço:", "End.:", "Logradouro:", nome do cliente seguido do endereço.
4. Em endereços brasileiros é comum ter QUADRA (QD), LOTE (LT), BLOCO (BL), APTO — coloque tudo isso no campo "complemento".
5. Quando a rua não tem número (ex: "SN", "S/N", "S N"), preencha numero como "SN".
6. Se o bairro aparecer abreviado (ex: "JD" para Jardim, "PQ" para Parque, "VL" para Vila), MANTENHA a forma como aparece no documento.
7. Cidades em CAIXA ALTA são comuns — preserve como aparecem ou normalize (ex: "GOIANIA" → "Goiânia").
8. Se reconhecer a cidade, infira o estado (UF). Ex: Goiânia → GO, São Paulo → SP.
9. Retorne SEMPRE um JSON válido, mesmo que parcial. Use "" para campos não encontrados — NUNCA invente dados.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este comprovante de endereço (a imagem PODE ESTAR ROTACIONADA — gire mentalmente se necessário) e extraia o endereço.

Retorne um JSON com EXATAMENTE estes campos:
{
  "cep": "string (CEP no formato 00000-000, ou vazio se não encontrar)",
  "rua": "string (logradouro: rua, avenida, alameda, travessa, etc. Inclua o tipo. Ex: 'Rua JC 35')",
  "numero": "string (número; use 'SN' se for sem número)",
  "complemento": "string (quadra QD, lote LT, bloco, apartamento, etc — junte tudo. Ex: 'QD 70 LT 22')",
  "bairro": "string (bairro/setor/jardim. Ex: 'Jd Curitiba I')",
  "cidade": "string (município. Ex: 'Goiânia')",
  "estado": "string (sigla UF com 2 letras. Ex: 'GO')"
}

Retorne SOMENTE o JSON puro, sem markdown, sem \`\`\`, sem explicação.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${detectedMime};base64,${fileBase64}`,
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
          JSON.stringify({ error: "Créditos insuficientes." }),
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

    console.log("Extracted address data:", JSON.stringify(extracted));

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-comprovante error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
