import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIPE_BASE = "https://fipe.parallelum.com.br/api/v2";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = na.split(/[\s/\-]+/).filter(Boolean);
  const wordsB = nb.split(/[\s/\-]+/).filter(Boolean);
  const matches = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return matches.length / Math.max(wordsA.length, wordsB.length);
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

function bestBrandMatch(brands: { code: string; name: string }[], search: string) {
  let best = brands[0];
  let bestScore = 0;
  for (const b of brands) {
    const score = similarity(b.name, search);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return { brand: best, score: bestScore };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { modelo, anoModelo } = await req.json();
    if (!modelo || !anoModelo) {
      return new Response(
        JSON.stringify({ error: "modelo e anoModelo são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Looking up FIPE for: ${modelo} ${anoModelo}`);

    // 1. Get brands first (needed for prefix-based brand detection)
    const brands: { code: string; name: string }[] = await fetchJson(`${FIPE_BASE}/motorcycles/brands`);

    let brandSearch: string;
    let modelSearch: string;

    const parts = modelo.split("/");
    if (parts.length > 1) {
      // Explicit "Brand/Model" format (from CRLV extraction)
      brandSearch = normalize(parts[0]);
      modelSearch = normalize(parts.slice(1).join(" "));
    } else {
      // No "/" separator — try to detect brand from word prefixes
      // Handles "Honda CG 160 Fan", "YAMAHA FAZER 250", etc.
      const words = normalize(modelo).split(/\s+/).filter(Boolean);
      let detectedBrand = "";
      let detectedModel = "";
      let bestPrefixScore = 0;

      for (let prefixLen = 1; prefixLen <= Math.min(2, words.length - 1); prefixLen++) {
        const prefix = words.slice(0, prefixLen).join(" ");
        const rest = words.slice(prefixLen).join(" ");
        if (!rest) continue;
        const { score } = bestBrandMatch(brands, prefix);
        if (score > bestPrefixScore) {
          bestPrefixScore = score;
          detectedBrand = prefix;
          detectedModel = rest;
        }
      }

      if (bestPrefixScore >= 0.5) {
        brandSearch = detectedBrand;
        modelSearch = detectedModel;
        console.log(`Auto-detected brand prefix: "${brandSearch}" (score ${bestPrefixScore}), model: "${modelSearch}"`);
      } else {
        // No brand prefix found — use full string and let brand matching decide
        brandSearch = normalize(modelo);
        modelSearch = normalize(modelo);
      }
    }

    // 2. Match brand
    const { brand: bestBrand, score: bestBrandScore } = bestBrandMatch(brands, brandSearch);
    console.log(`Matched brand: ${bestBrand.name} (score ${bestBrandScore})`);

    if (bestBrandScore < 0.3) {
      return new Response(
        JSON.stringify({ error: `Marca não encontrada: "${parts[0]}". Tente o formato "Marca/Modelo" (ex: Honda/CG 160).` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get models for the matched brand
    const models: { code: string; name: string }[] = await fetchJson(
      `${FIPE_BASE}/motorcycles/brands/${bestBrand.code}/models`
    );

    const scored = models
      .map(m => ({ ...m, score: similarity(m.name, modelSearch) }))
      .filter(m => m.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log(`Top model candidates: ${scored.map(s => `${s.name}(${s.score})`).join(", ")}`);

    if (scored.length === 0) {
      return new Response(
        JSON.stringify({ error: `Modelo não encontrado para "${modelSearch}" na marca ${bestBrand.name}.` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. For each candidate, check if the target year is available
    const targetYear = String(anoModelo);
    for (const candidate of scored) {
      try {
        const years: { code: string; name: string }[] = await fetchJson(
          `${FIPE_BASE}/motorcycles/brands/${bestBrand.code}/models/${candidate.code}/years`
        );

        const yearMatch = years.find(y => y.code.startsWith(targetYear + "-"));
        if (!yearMatch) continue;

        const priceData = await fetchJson(
          `${FIPE_BASE}/motorcycles/brands/${bestBrand.code}/models/${candidate.code}/years/${yearMatch.code}`
        );

        console.log("FIPE result:", JSON.stringify(priceData));

        // Handle both English (v2) and Portuguese (v1) field names
        const priceStr = priceData.price || priceData.valor || priceData.Valor || "";
        const valor = Number(priceStr.replace(/[R$\s.]/g, "").replace(",", "."));

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              valor: isNaN(valor) || valor <= 0 ? null : valor,
              referencia: priceData.referenceMonth || priceData.mesReferencia || null,
              codigoFipe: priceData.codeFipe || priceData.codigoFipe || null,
              marca: bestBrand.name,
              modelo: candidate.name,
              anoModelo: priceData.modelYear || priceData.anoModelo || anoModelo,
              combustivel: priceData.fuel || priceData.combustivel || null,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        console.log(`Candidate ${candidate.name} failed: ${e}`);
        continue;
      }
    }

    // Fallback: use first candidate with first available year
    const fallback = scored[0];
    const fallbackYears: { code: string; name: string }[] = await fetchJson(
      `${FIPE_BASE}/motorcycles/brands/${bestBrand.code}/models/${fallback.code}/years`
    );
    if (fallbackYears.length > 0) {
      const priceData = await fetchJson(
        `${FIPE_BASE}/motorcycles/brands/${bestBrand.code}/models/${fallback.code}/years/${fallbackYears[0].code}`
      );
      const priceStr = priceData.price || priceData.valor || priceData.Valor || "";
      const valor = Number(priceStr.replace(/[R$\s.]/g, "").replace(",", "."));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            valor: isNaN(valor) || valor <= 0 ? null : valor,
            referencia: priceData.referenceMonth || priceData.mesReferencia || null,
            codigoFipe: priceData.codeFipe || priceData.codigoFipe || null,
            marca: bestBrand.name,
            modelo: fallback.name,
            anoModelo: priceData.modelYear || priceData.anoModelo || anoModelo,
            combustivel: priceData.fuel || priceData.combustivel || null,
            aviso: `Ano ${anoModelo} não encontrado. Usando ano mais recente disponível.`,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Não foi possível encontrar valor FIPE para ${modelo} ${anoModelo}` }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("lookup-fipe error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
