// Variante somente-texto do padrão de _shared/extract-ai.ts (Gemini com
// fallback Claude, retry com backoff, parse tolerante de JSON). Usado pela
// collection-ai-dispatch para decidir "enviar ou pular" uma cobrança com
// base no histórico de conversa — não lida com imagem/PDF.

import { parseJsonFromText } from "./extract-ai.ts";

interface TextAiOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxOutputTokens?: number;
  attempts?: number;
}

async function callGeminiTextOnce(opts: TextAiOptions, apiKey: string): Promise<string> {
  const model = opts.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: opts.maxOutputTokens || 1024,
      temperature: 0.2,
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
  const text = candidate.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
  if (!text.trim()) throw new Error(`Gemini empty response (finishReason: ${finishReason || "unknown"})`);
  if (finishReason === "MAX_TOKENS") throw new Error("Gemini truncated (MAX_TOKENS)");
  return text;
}

async function callClaudeTextOnce(opts: TextAiOptions, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxOutputTokens || 1024,
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userPrompt + "\n\nResponda APENAS com JSON válido, sem markdown." }],
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

export async function decideWithFallback(opts: TextAiOptions): Promise<Record<string, unknown>> {
  const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!claudeKey && !geminiKey) {
    throw new Error("Nem ANTHROPIC_API_KEY nem GOOGLE_AI_API_KEY configurados");
  }

  const attempts = opts.attempts ?? 3;
  const errors: string[] = [];

  if (geminiKey) {
    for (let i = 0; i < attempts; i++) {
      try {
        const text = await callGeminiTextOnce(opts, geminiKey);
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
      const text = await callClaudeTextOnce(opts, claudeKey);
      return parseJsonFromText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Claude falhou] ${msg}`);
      errors.push(`claude: ${msg}`);
    }
  }

  throw new Error(`Todas as tentativas de decisão falharam. ${errors.join(" | ")}`);
}
