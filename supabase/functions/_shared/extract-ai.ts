// Shared helper para extração de dados via Gemini com fallback para Claude.
// Resolve as causas comuns de inconsistência:
//  - Thinking tokens do gemini-2.5-* consumindo o budget e devolvendo texto vazio (finishReason MAX_TOKENS)
//  - responseMimeType "text/plain" + JSON pedido no prompt → parsing frágil
//  - Sem retry em falhas transientes (5xx, candidato vazio)
//  - Sem fallback quando o Gemini falha → operação inteira quebra

export function parseJsonFromText(text: string): Record<string, unknown> {
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // remove caracteres de controle que quebram JSON.parse
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1)
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    return JSON.parse(slice);
  }
  throw new Error("No JSON object found in response");
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface ExtractOptions {
  systemPrompt: string;
  userPrompt: string;
  fileBase64: string;
  mimeType: string;
  model?: string;           // default: gemini-2.5-flash
  maxOutputTokens?: number; // default: 2048
  attempts?: number;        // default: 3
  claudeOnly?: boolean;     // skip Gemini entirely, use only Claude
}

async function callGeminiOnce(opts: ExtractOptions, apiKey: string): Promise<string> {
  const model = opts.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: GeminiPart[] = [
    { text: opts.userPrompt },
    { inlineData: { mimeType: opts.mimeType, data: opts.fileBase64 } },
  ];

  const body = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      // CRÍTICO: força JSON válido em vez de text/plain
      responseMimeType: "application/json",
      // CRÍTICO: desativa thinking tokens (Gemini 2.5 consome budget pensando e devolve vazio)
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: opts.maxOutputTokens || 2048,
      temperature: 0.1,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini ${response.status}: ${errText.slice(0, 500)}`);
  }

  const aiResult = await response.json();
  const candidate = aiResult.candidates?.[0];

  if (!candidate) {
    const reason = aiResult.promptFeedback?.blockReason ?? "no candidates";
    throw new Error(`Gemini blocked: ${reason}`);
  }

  const finishReason = candidate.finishReason;
  const text = candidate.content?.parts?.map((p: GeminiPart) => p.text || "").join("") ?? "";

  if (!text.trim()) {
    throw new Error(`Gemini empty response (finishReason: ${finishReason || "unknown"})`);
  }

  if (finishReason === "MAX_TOKENS") {
    throw new Error("Gemini truncated (MAX_TOKENS)");
  }

  return text;
}

function detectMime(base64: string): string {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("JVBER")) return "application/pdf";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

async function callClaudeOnce(opts: ExtractOptions, apiKey: string): Promise<string> {
  const realMime = detectMime(opts.fileBase64);
  const isPdf = realMime === "application/pdf";
  const contentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.fileBase64 } }
    : { type: "image", source: { type: "base64", media_type: realMime, data: opts.fileBase64 } };

  const content: any[] = [
    contentBlock,
    { type: "text", text: opts.userPrompt + "\n\nResponda APENAS com JSON válido, sem markdown." },
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  // pdfs-1 beta header não é mais necessário nos modelos Claude 4.x

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxOutputTokens || 2048,
      system: opts.systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude ${response.status}: ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text ?? "";
  if (!text.trim()) throw new Error("Claude empty response");
  return text;
}

export async function extractWithFallback(opts: ExtractOptions): Promise<Record<string, unknown>> {
  const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!claudeKey && !geminiKey) {
    throw new Error("Nem ANTHROPIC_API_KEY nem GOOGLE_AI_API_KEY configurados");
  }

  const attempts = opts.attempts ?? 3;
  const errors: string[] = [];

  // 1) Claude (principal quando claudeOnly=true, ou quando Gemini não está configurado)
  if (opts.claudeOnly || !geminiKey) {
    if (!claudeKey) throw new Error("ANTHROPIC_API_KEY não configurado");
    for (let i = 0; i < attempts; i++) {
      try {
        const text = await callClaudeOnce(opts, claudeKey);
        console.log(`[Claude ok tentativa ${i + 1}] ${text.slice(0, 200)}`);
        return parseJsonFromText(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Claude tentativa ${i + 1}/${attempts} falhou] ${msg}`);
        errors.push(`claude#${i + 1}: ${msg}`);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw new Error(`Todas as tentativas Claude falharam. ${errors.join(" | ")}`);
  }

  // 2) Modo auto: Gemini com retries, fallback Claude
  if (geminiKey) {
    for (let i = 0; i < attempts; i++) {
      try {
        const text = await callGeminiOnce(opts, geminiKey);
        console.log(`[Gemini ok tentativa ${i + 1}] ${text.slice(0, 200)}`);
        return parseJsonFromText(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Gemini tentativa ${i + 1}/${attempts} falhou] ${msg}`);
        errors.push(`gemini#${i + 1}: ${msg}`);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }

  if (claudeKey) {
    try {
      console.log("[Fallback Claude]");
      const text = await callClaudeOnce(opts, claudeKey);
      return parseJsonFromText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Claude falhou] ${msg}`);
      errors.push(`claude: ${msg}`);
    }
  }

  throw new Error(`Todas as tentativas de extração falharam. ${errors.join(" | ")}`);
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
