/**
 * Lê o CRLV do Supabase Storage para cada moto,
 * chama a edge function extract-crlv e atualiza ano_fabricacao no banco.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qmwfotbczcruxaoemfde.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtd2ZvdGJjemNydXhhb2VtZmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzk3MzYsImV4cCI6MjA5MTkxNTczNn0.Dg_Tb8tQDcEKwWufK0K27qXu-_6Htk5gQ_oV_uUlGpU";
const EXTRACT_URL = `${SUPABASE_URL}/functions/v1/extract-crlv`;
const STORAGE_BUCKET = "crlv-documents";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Motos com storage path (PDF disponível no bucket)
const { data: motos, error } = await supabase
  .from("motorcycles")
  .select("id, placa, ano_fabricacao, ano_modelo, crlv_storage_path")
  .is("deleted_at", null)
  .is("ano_fabricacao", null)
  .not("crlv_storage_path", "is", null);

if (error) { console.error("Erro ao buscar motos:", error); process.exit(1); }

console.log(`\n${motos.length} motos com CRLV no storage para processar.\n`);

let ok = 0, skip = 0, fail = 0;

for (const moto of motos) {
  const label = `${moto.placa} (${moto.ano_modelo})`;
  try {
    // 1. Baixa o PDF do storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(moto.crlv_storage_path);

    if (dlErr || !fileData) {
      console.warn(`  [SKIP] ${label} — download falhou: ${dlErr?.message}`);
      skip++;
      continue;
    }

    // 2. Converte para base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // 3. Chama a edge function extract-crlv
    const res = await fetch(EXTRACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ pdfBase64: base64, mimeType: "application/pdf" }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.warn(`  [FAIL] ${label} — extract-crlv ${res.status}: ${txt.slice(0, 120)}`);
      fail++;
      continue;
    }

    const result = await res.json();
    const anoFab = result?.data?.anoFabricacao;

    if (!anoFab || typeof anoFab !== "number") {
      console.warn(`  [SKIP] ${label} — anoFabricacao não encontrado no CRLV`);
      skip++;
      continue;
    }

    // 4. Atualiza no banco
    const { error: upErr } = await supabase
      .from("motorcycles")
      .update({ ano_fabricacao: anoFab })
      .eq("id", moto.id);

    if (upErr) {
      console.error(`  [FAIL] ${label} — update falhou: ${upErr.message}`);
      fail++;
      continue;
    }

    console.log(`  [OK]   ${label} → anoFabricacao = ${anoFab}`);
    ok++;

    // Pausa de 800ms entre chamadas para não sobrecarregar a edge function
    await new Promise(r => setTimeout(r, 800));

  } catch (e) {
    console.error(`  [FAIL] ${label} — exceção: ${e.message}`);
    fail++;
  }
}

console.log(`\nConcluído: ${ok} atualizados, ${skip} sem dado, ${fail} com erro.\n`);
