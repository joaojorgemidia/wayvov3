/** Lowercase + remove acentos, para comparacoes de texto tolerantes a variacao de grafia. */
export function normalizeText(value?: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}
