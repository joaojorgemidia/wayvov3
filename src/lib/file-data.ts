export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];

  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }

  return btoa(chunks.join(""));
}

export function downloadStoredFile(
  fileData: string,
  filename: string,
  fallbackMimeType = "application/octet-stream"
) {
  const normalized = fileData.trim();
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(normalized);
  const mimeType = dataUrlMatch?.[1] || fallbackMimeType;
  const base64 = dataUrlMatch?.[2] || normalized;

  if (!base64) {
    throw new Error("Arquivo não disponível para download.");
  }

  const binary = atob(base64);
  const chunkSize = 1024;
  const parts: ArrayBuffer[] = [];

  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(slice.length);

    for (let i = 0; i < slice.length; i++) {
      bytes[i] = slice.charCodeAt(i);
    }

    parts.push(bytes.buffer);
  }

  const blob = new Blob(parts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  try {
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
  } finally {
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
