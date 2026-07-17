// Encapsula tudo que depende das credenciais reais do Sicoob (client_id + certificado
// mTLS). Fica isolado aqui de propósito: enquanto o usuário não tiver credenciais, todo
// o resto do pipeline (staging, matching, regras, UI de revisão) já funciona via
// importação manual de CSV — só esta peça fica pendente.
//
// TODO(credenciais): implementar quando client_id + certificado ICP-Brasil existirem.
// Endpoints/schema exatos do módulo "Conta Corrente" da API Sicoob exigem login no
// portal developers.sicoob.com.br — não fabricar payload aqui antes de confirmar.
//
// Risco técnico a validar PRIMEIRO, antes de qualquer outra coisa: mTLS exige
// apresentar um certificado de cliente na conexão TLS de saída. Não está confirmado
// que o runtime de Edge Functions do Supabase (Deno Deploy) suporte isso via
// `Deno.createHttpClient({ certChain, privateKey })` — testar isoladamente antes de
// integrar ao restante do fluxo. Se não suportar, considerar um pequeno relay externo
// (Cloudflare Worker/VPS) que apresente o certificado e repasse a chamada via HTTPS
// normal para esta função.

export class SicoobNotConfiguredError extends Error {
  constructor(message = "Integração Sicoob ainda não configurada (client_id/certificado pendentes)") {
    super(message);
    this.name = "SicoobNotConfiguredError";
  }
}

export interface SicoobExtratoTransaction {
  id: string;
  data: string; // YYYY-MM-DD
  tipo: "credito" | "debito";
  valor: number;
  descricao: string;
  raw: Record<string, unknown>;
}

export interface SicoobClientConfig {
  clientId: string;
  ambiente: "sandbox" | "producao";
  contaCorrente?: { numero?: string; agencia?: string; cooperativa?: string };
}

/**
 * Busca o extrato da conta corrente desde `sinceCursor` (ISO date). Lança
 * SicoobNotConfiguredError enquanto as credenciais reais não estiverem plugadas.
 */
export async function fetchExtrato(
  _config: SicoobClientConfig,
  _sinceCursor: string | null,
): Promise<SicoobExtratoTransaction[]> {
  throw new SicoobNotConfiguredError();
}
