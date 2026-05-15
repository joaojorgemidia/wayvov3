import { supabase } from "@/integrations/supabase/client";

/**
 * Garante (criando se necessário) pastas no Google Drive para placas e/ou
 * locatários. Roda em background — falhas apenas são logadas.
 *
 * Hierarquia: Vistorias / {PLACA} / [{LOCATARIO} / [{DATA} / fotos+videos]]
 *
 * Uso típico:
 *  - Após salvar moto:    ensureVistoriaFolders({ placas: [moto.placa] })
 *  - Após salvar cliente: ensureVistoriaFolders({ locatarios: [cliente.nome], placas: [...placasAtivas] })
 *  - Após confirmar vistoria: ensureVistoriaFolders({ placas: [placa], locatarios: [nome], data: "YYYY-MM-DD", createMediaSubfolders: true })
 */
export function ensureVistoriaFolders(input: {
  placas?: string[];
  locatarios?: string[];
  placa?: string;
  locatario?: string;
  data?: string;
  createMediaSubfolders?: boolean;
}): void {
  const placas = (input.placas ?? (input.placa ? [input.placa] : [])).filter(Boolean);
  const locatarios = (input.locatarios ?? (input.locatario ? [input.locatario] : [])).filter(Boolean);
  if (placas.length === 0 && locatarios.length === 0) return;

  void supabase.functions
    .invoke("ensure-vistoria-folder", {
      body: {
        placas,
        locatarios,
        data: input.data,
        createMediaSubfolders: !!input.createMediaSubfolders,
      },
    })
    .then(({ error }) => {
      if (error) console.warn("ensure-vistoria-folder falhou:", error.message);
    });
}

export interface EnsuredFolderEntry {
  kind: "placa";
  placa: string;
  folderId: string;
  webViewLink: string | null;
  // chaves dinâmicas: data_webViewLink, data_{loc}_webViewLink, etc.
  [key: string]: unknown;
}

/**
 * Versão awaitable: garante as pastas e devolve as entradas com webViewLink.
 * Usado quando o usuário pede para "abrir" uma pasta — precisamos do link.
 */
export async function resolveVistoriaFolders(input: {
  placa: string;
  locatario?: string;
  data?: string;
}): Promise<EnsuredFolderEntry | null> {
  const placa = input.placa?.trim();
  if (!placa) return null;
  const locatarios = input.locatario ? [input.locatario] : [];
  const { data, error } = await supabase.functions.invoke("ensure-vistoria-folder", {
    body: {
      placas: [placa],
      locatarios,
      data: input.data,
      createMediaSubfolders: false,
    },
  });
  if (error) {
    console.warn("resolveVistoriaFolders falhou:", error.message);
    return null;
  }
  const entries = (data as { created?: EnsuredFolderEntry[] } | null)?.created ?? [];
  return entries[0] ?? null;
}