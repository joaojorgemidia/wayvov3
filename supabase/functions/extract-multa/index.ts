import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractWithFallback, corsHeaders } from "../_shared/extract-ai.ts";

const systemPrompt = `Você é um especialista em extrair dados de multas de trânsito brasileiras (notificações de autuação, autos de infração, boletos de multa do DETRAN, RENAINF, etc.).

REGRAS:
- Extraia apenas o que estiver claramente visível no documento.
- Para campos não encontrados, retorne null.
- Datas devem estar no formato YYYY-MM-DD.
- Valor deve ser número (sem R$, sem pontos de milhar, use ponto como decimal — ex: 293.47).
- Placa no formato brasileiro sem traço (ex: ABC1234 ou ABC1D23).
- Número RENAINF é o código nacional da infração (geralmente 9 dígitos).
- Auto de infração é o número do auto gerado pelo órgão autuador (pode ter letras).
- Código de infração é o código do tipo da infração (ex: 74550, 55500, etc.).`;

const userPrompt = `Extraia os dados desta multa/notificação de trânsito e retorne um JSON com exatamente estes campos:
{
  "placa": "string ou null (placa do veículo, sem traço, ex: ABC1234)",
  "dataMulta": "string ou null (data da infração/autuação no formato YYYY-MM-DD)",
  "dataVencimento": "string ou null (data de vencimento/pagamento no formato YYYY-MM-DD)",
  "valor": "number ou null (valor da multa em reais, ex: 293.47)",
  "numeroRenainf": "string ou null (número RENAINF — código nacional da infração, geralmente 9 dígitos)",
  "autoInfracao": "string ou null (número do auto de infração gerado pelo órgão autuador)",
  "codigoInfracao": "string ou null (código do tipo de infração, ex: 74550)",
  "descricao": "string ou null (descrição da infração, ex: Velocidade acima do limite, Avanço de sinal)"
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
    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64 || typeof fileBase64 !== "string") return fail("fileBase64 is required", 400);

    const detectedMime = mimeType || "image/jpeg";
    console.log("Sending multa to Claude for extraction, mime:", detectedMime);

    const data = await extractWithFallback({
      systemPrompt,
      userPrompt,
      fileBase64,
      mimeType: detectedMime,
      claudeOnly: true,
    });

    console.log("Extracted multa data:", JSON.stringify(data));
    return ok(data);
  } catch (error) {
    console.error("extract-multa error:", error);
    return fail(error instanceof Error ? error.message : "Erro desconhecido", 500);
  }
});
