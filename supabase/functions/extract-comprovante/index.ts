import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractWithFallback, corsHeaders } from "../_shared/extract-ai.ts";

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

const userPrompt = `Analise este comprovante de endereço (a imagem PODE ESTAR ROTACIONADA — gire mentalmente se necessário) e extraia o endereço.

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

Retorne SOMENTE o JSON puro, sem markdown, sem \`\`\`, sem explicação.`;

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

    const data = await extractWithFallback({
      systemPrompt,
      userPrompt,
      fileBase64,
      mimeType: mimeType || "application/pdf",
      // Comprovantes podem vir rotacionados/amassados — pro lida melhor; flash como fallback automático
      model: "gemini-2.5-pro",
      maxOutputTokens: 1024,
    });

    console.log("Extracted address data:", JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("extract-comprovante error:", msg);
    return new Response(
      JSON.stringify({ error: "Não foi possível ler o comprovante. Tente outra foto ou preencha manualmente.", detail: msg }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
