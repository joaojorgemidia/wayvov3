import { supabase } from "@/integrations/supabase/client";

export type DocBucket = "crlv-documents" | "client-documents";

/** Sobe um arquivo para o Storage e devolve o path salvo. */
export async function uploadDocument(
  bucket: DocBucket,
  path: string,
  file: File | Blob,
  contentType?: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: true,
      contentType: contentType || (file as File).type || "application/octet-stream",
    });
  if (error) throw error;
  return path;
}

/** Baixa um documento privado do Storage e dispara o download no browser. */
export async function downloadDocument(
  bucket: DocBucket,
  path: string,
  filename: string,
): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error || new Error("Arquivo não encontrado");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sanitiza nome de arquivo para uso seguro em path do Storage. */
export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

export function buildCrlvPath(companyId: string, motoId: string, filename: string): string {
  return `${companyId}/${motoId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

export function buildClientDocPath(
  companyId: string,
  clientId: string,
  kind: "cnh" | "comprovante",
  filename: string,
): string {
  return `${companyId}/${clientId}/${kind}-${Date.now()}-${sanitizeFilename(filename)}`;
}