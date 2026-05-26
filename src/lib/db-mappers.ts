import type { Motorcycle, Client, Rental, Fine, Maintenance, FinancialEntry } from "@/lib/types";

export interface BankAccountData {
  id: string;
  nome: string;
  banco: string;
  saldoInicial: number;
}

// ─── Database → App Mappers ────────────────────────────────────

export function dbToMoto(r: any): Motorcycle {
  return {
    id: r.id, placa: r.placa || "", modelo: r.modelo || "", anoModelo: r.ano_modelo ?? null,
    cor: r.cor || "", chassi: r.chassi || "", renavam: r.renavam || "", numMotor: r.num_motor || "",
    aplicativo: r.aplicativo || "", tipo: r.tipo === "terceiro" ? "terceiro" : "propria",
    proprietario: r.proprietario || undefined, status: r.status || "disponivel",
    kmAtual: r.km_atual ?? null, kmCompra: r.km_compra ?? null, kmTrocaOleo: r.km_troca_oleo ?? null,
    kmVenda: r.km_venda ?? null, ultimaVistoria: r.ultima_vistoria || null,
    ultimaTrocaOleo: r.ultima_troca_oleo || null, historicoOleo: r.historico_oleo || [],
    valorCompra: r.valor_compra != null ? Number(r.valor_compra) : null,
    dataCompra: r.data_compra || null, valorFipe: r.valor_fipe != null ? Number(r.valor_fipe) : null,
    dataFipe: r.data_fipe || null, valorVenda: r.valor_venda != null ? Number(r.valor_venda) : null,
    dataVenda: r.data_venda || null, lucroOperacional: r.lucro_operacional != null ? Number(r.lucro_operacional) : null,
    decisao: r.decisao || null, crlvPdfName: r.crlv_pdf_name || null, crlvPdfData: null,
    crlvStoragePath: r.crlv_storage_path || null,
    formaCompra: (r.forma_compra as any) || "vista",
    valorEntrada: r.valor_entrada != null ? Number(r.valor_entrada) : null,
    numParcelas: r.num_parcelas ?? null,
    valorParcela: r.valor_parcela != null ? Number(r.valor_parcela) : null,
    parcelasPagas: r.parcelas_pagas ?? null,
    diaVencimento: r.dia_vencimento ?? null,
  };
}

export function motoToDb(m: Motorcycle): any {
  return {
    placa: m.placa, modelo: m.modelo, ano_modelo: m.anoModelo, cor: m.cor, chassi: m.chassi,
    renavam: m.renavam, num_motor: m.numMotor, aplicativo: m.aplicativo, tipo: m.tipo,
    proprietario: m.proprietario || null, status: m.status, km_atual: m.kmAtual,
    km_compra: m.kmCompra, km_troca_oleo: m.kmTrocaOleo, km_venda: m.kmVenda,
    ultima_vistoria: m.ultimaVistoria || null, ultima_troca_oleo: m.ultimaTrocaOleo || null,
    historico_oleo: m.historicoOleo || [], valor_compra: m.valorCompra,
    data_compra: m.dataCompra || null, valor_fipe: m.valorFipe, data_fipe: m.dataFipe || null,
    valor_venda: m.valorVenda, data_venda: m.dataVenda || null,
    lucro_operacional: m.lucroOperacional, decisao: m.decisao, crlv_pdf_name: m.crlvPdfName,
    crlv_storage_path: m.crlvStoragePath ?? null,
    forma_compra: m.formaCompra || "vista",
    valor_entrada: m.valorEntrada ?? null,
    num_parcelas: m.numParcelas ?? null,
    valor_parcela: m.valorParcela ?? null,
    parcelas_pagas: m.parcelasPagas ?? null,
    dia_vencimento: m.diaVencimento ?? null,
  };
}

export function dbToClient(r: any): Client {
  return {
    id: r.id, nome: r.nome || "", cpf: r.cpf || "", cnh: r.cnh || "",
    cnhCategoria: r.cnh_categoria || "", cnhValidade: r.cnh_validade || null,
    cnhPdfName: r.cnh_pdf_name || null, cnhPdfData: null,
    cnhStoragePath: r.cnh_storage_path || null,
    telefone: r.telefone || "", email: r.email || "",
    cep: r.cep || "", rua: r.rua || "", numero: r.numero || "",
    complemento: r.complemento || "", bairro: r.bairro || "",
    cidade: r.cidade || "", estado: r.estado || "",
    comprovanteEnderecoName: r.comprovante_endereco_name || null, comprovanteEnderecoData: null,
    comprovanteEnderecoStoragePath: r.comprovante_endereco_storage_path || null,
    emergenciaNome1: r.emergencia_nome1 || "", emergenciaTel1: r.emergencia_tel1 || "",
    emergenciaNome2: r.emergencia_nome2 || "", emergenciaTel2: r.emergencia_tel2 || "",
    observacoes: r.observacoes || "", createdAt: r.created_at || "",
    asaasCustomerId: r.asaas_customer_id || null,
  };
}

export function clientToDb(c: Client): any {
  return {
    nome: c.nome, cpf: c.cpf, cnh: c.cnh, cnh_categoria: c.cnhCategoria,
    cnh_validade: c.cnhValidade || null, cnh_pdf_name: c.cnhPdfName,
    cnh_storage_path: c.cnhStoragePath ?? null,
    telefone: c.telefone, email: c.email, cep: c.cep, rua: c.rua,
    numero: c.numero, complemento: c.complemento, bairro: c.bairro,
    cidade: c.cidade, estado: c.estado,
    comprovante_endereco_name: c.comprovanteEnderecoName,
    comprovante_endereco_storage_path: c.comprovanteEnderecoStoragePath ?? null,
    emergencia_nome1: c.emergenciaNome1, emergencia_tel1: c.emergenciaTel1,
    emergencia_nome2: c.emergenciaNome2, emergencia_tel2: c.emergenciaTel2,
    observacoes: c.observacoes,
  };
}

export function dbToRental(r: any): Rental {
  return {
    id: r.id, numero: r.numero ?? undefined, motoId: r.moto_id || "", clienteId: r.cliente_id || "",
    vendedor: r.vendedor || "", dataInicio: r.data_inicio || "", horaInicio: r.hora_inicio || "",
    dataFim: r.data_fim || null, dataFimContrato: r.data_fim_contrato || null,
    proximoPagamento: r.proximo_pagamento || null, tempoMinimoContrato: r.tempo_minimo_contrato ?? null,
    frequenciaPagamento: r.frequencia_pagamento || "",
    cobrancaPrePaga: r.cobranca_pre_paga ?? false,
    valorDiario: Number(r.valor_diario) || 0, valorCaucao: Number(r.valor_caucao) || 0,
    caucaoPendente: r.caucao_pendente || false, caucaoParcelado: r.caucao_parcelado || false,
    parcelasCaucao: r.parcelas_caucao || [],
    multaAtraso: Number(r.multa_atraso) || 0, jurosAtrasoMes: Number(r.juros_atraso_mes) || 0,
    localRetirada: r.local_retirada || "", localDevolucao: r.local_devolucao || "",
    kmInicio: r.km_inicio || 0, kmFim: r.km_fim ?? null,
    nivelCombustivel: r.nivel_combustivel || "", plano: r.plano || "",
    raioCirculacao: r.raio_circulacao || "", seguroTerceiros: r.seguro_terceiros || false,
    gerarCobrancaCaucao: r.gerar_cobranca_caucao || false,
    gerarCobrancaPagamento: r.gerar_cobranca_pagamento || false,
    status: r.status || "ativa",
    checklistRetirada: r.checklist_retirada || [], checklistDevolucao: r.checklist_devolucao || [],
    observacoes: r.observacoes || "", createdAt: r.created_at || "",
  };
}

export function rentalToDb(r: Rental): any {
  return {
    moto_id: r.motoId, cliente_id: r.clienteId, vendedor: r.vendedor,
    data_inicio: r.dataInicio, hora_inicio: r.horaInicio,
    data_fim: r.dataFim || null, data_fim_contrato: r.dataFimContrato || null,
    proximo_pagamento: r.proximoPagamento || null,
    tempo_minimo_contrato: r.tempoMinimoContrato,
    frequencia_pagamento: r.frequenciaPagamento,
    cobranca_pre_paga: r.cobrancaPrePaga ?? false,
    valor_diario: r.valorDiario, valor_caucao: r.valorCaucao,
    caucao_pendente: r.caucaoPendente, caucao_parcelado: r.caucaoParcelado,
    parcelas_caucao: r.parcelasCaucao,
    multa_atraso: r.multaAtraso, juros_atraso_mes: r.jurosAtrasoMes,
    local_retirada: r.localRetirada, local_devolucao: r.localDevolucao,
    km_inicio: r.kmInicio, km_fim: r.kmFim,
    nivel_combustivel: r.nivelCombustivel, plano: r.plano,
    raio_circulacao: r.raioCirculacao, seguro_terceiros: r.seguroTerceiros,
    gerar_cobranca_caucao: r.gerarCobrancaCaucao,
    gerar_cobranca_pagamento: r.gerarCobrancaPagamento,
    status: r.status, checklist_retirada: r.checklistRetirada,
    checklist_devolucao: r.checklistDevolucao, observacoes: r.observacoes,
  };
}

export function dbToFine(r: any): Fine {
  return {
    id: r.id, motoId: r.moto_id || "", clienteId: r.cliente_id || null,
    rentalId: r.rental_id || null, dataMulta: r.data_multa || "",
    dataNotificacao: r.data_notificacao || null, valor: Number(r.valor) || 0,
    descricao: r.descricao || "", status: r.status || "pendente",
    responsavel: r.responsavel || "locadora",
    origem: r.origem || "manual",
    autoInfracao: r.auto_infracao || null,
    codigoInfracao: r.codigo_infracao || null,
  };
}

export function fineToDb(f: Fine): any {
  return {
    moto_id: f.motoId, cliente_id: f.clienteId || null,
    rental_id: f.rentalId || null, data_multa: f.dataMulta,
    data_notificacao: f.dataNotificacao || null, valor: f.valor,
    descricao: f.descricao, status: f.status, responsavel: f.responsavel,
    origem: f.origem || "manual",
    auto_infracao: f.autoInfracao || null,
    codigo_infracao: f.codigoInfracao || null,
  };
}

export function dbToMaintenance(r: any): Maintenance {
  return {
    id: r.id, motoId: r.moto_id || "", tipo: r.tipo || "outro",
    data: r.data || "", dataFim: r.data_fim || null, km: r.km ?? null, custo: Number(r.custo) || 0,
    descricao: r.descricao || "", fornecedor: r.fornecedor || "",
    status: r.status || "agendada",
    natureza: r.natureza || "corretiva",
    oficina: r.oficina || "",
    conta: r.conta || "",
    quemPaga: r.quem_paga || "locadora",
    itens: r.itens || [],
    numeroOS: r.numero_os || null,
    dataPagamentoPrevisto: r.data_pagamento_previsto || null,
    pagamentoRealizado: r.pagamento_realizado ?? false,
  };
}

export function maintenanceToDb(m: Maintenance): any {
  return {
    moto_id: m.motoId, tipo: m.tipo, data: m.data, data_fim: m.dataFim || null, km: m.km,
    custo: m.custo, descricao: m.descricao, fornecedor: m.fornecedor, status: m.status,
    natureza: m.natureza || null, oficina: m.oficina || null, conta: m.conta || null,
    quem_paga: m.quemPaga || null, itens: m.itens || [],
    numero_os: m.numeroOS || null,
    data_pagamento_previsto: m.dataPagamentoPrevisto || null,
    pagamento_realizado: m.pagamentoRealizado || false,
  };
}

export function dbToFinancial(r: any): FinancialEntry {
  return {
    id: r.id, tipo: r.tipo || "despesa", categoria: r.categoria || "",
    subcategoria: r.subcategoria || undefined, descricao: r.descricao || "",
    valor: Number(r.valor) || 0, data: r.data || "",
    dataPrevista: r.data_prevista || undefined,
    motoId: r.moto_id || null, rentalId: r.rental_id || null,
    clienteId: r.cliente_id || null, pago: r.pago ?? false,
    recorrente: r.recorrente ?? false, recorrenciaTipo: r.recorrencia_tipo || undefined,
    recorrenciaVezes: r.recorrencia_vezes ?? undefined,
    recorrenciaPorPeriodo: r.recorrencia_por_periodo ?? undefined,
    despesaFixa: r.despesa_fixa ?? false, ignorada: r.ignorada ?? false,
    observacao: r.observacao || undefined, tags: r.tags || [],
    conta: r.conta || undefined, natureza: r.natureza || undefined,
    placa: r.placa || undefined, clienteNome: r.cliente_nome || undefined,
    classificacaoManual: r.classificacao_manual ?? false,
    serieId: r.serie_id || undefined, fixedOriginId: r.fixed_origin_id || undefined,
    recurringGroupId: r.recurring_group_id || null,
    createdAt: r.created_at || undefined,
    asaasPaymentId: r.asaas_payment_id || null,
    asaasStatus: r.asaas_status || null,
    asaasBoletoUrl: r.asaas_boleto_url || null,
    asaasInvoiceUrl: r.asaas_invoice_url || null,
  };
}

export function financialToDb(e: FinancialEntry): any {
  return {
    tipo: e.tipo, categoria: e.categoria, subcategoria: e.subcategoria || null,
    descricao: e.descricao, valor: e.valor, data: e.data,
    data_prevista: e.dataPrevista || null,
    moto_id: e.motoId || null, rental_id: e.rentalId || null,
    cliente_id: e.clienteId || null, pago: e.pago,
    recorrente: e.recorrente || false, recorrencia_tipo: e.recorrenciaTipo || null,
    recorrencia_vezes: e.recorrenciaVezes ?? null,
    recorrencia_por_periodo: e.recorrenciaPorPeriodo ?? null,
    despesa_fixa: e.despesaFixa || false, ignorada: e.ignorada || false,
    observacao: e.observacao || null, tags: e.tags || [],
    conta: e.conta || null, natureza: e.natureza || null,
    placa: e.placa || null, cliente_nome: e.clienteNome || null,
    classificacao_manual: e.classificacaoManual || false,
    serie_id: e.serieId || null, fixed_origin_id: e.fixedOriginId || null,
    recurring_group_id: e.recurringGroupId || null,
    asaas_payment_id: e.asaasPaymentId || null,
    asaas_status: e.asaasStatus || null,
    asaas_boleto_url: e.asaasBoletoUrl || null,
    asaas_invoice_url: e.asaasInvoiceUrl || null,
  };
}

export function dbToBankAccount(r: any): BankAccountData {
  return { id: r.id, nome: r.nome || "", banco: r.banco || "", saldoInicial: Number(r.saldo_inicial) || 0 };
}

export function bankAccountToDb(a: any) {
  return { nome: a.nome, banco: a.banco, saldo_inicial: a.saldoInicial };
}

// ─── Table mapper registry ──────────────────────────────────────

export const TABLE_MAP: Record<string, { toDb: (item: any) => any }> = {
  motorcycles: { toDb: motoToDb },
  clients: { toDb: clientToDb },
  rentals: { toDb: rentalToDb },
  fines: { toDb: fineToDb },
  maintenance: { toDb: maintenanceToDb },
  financial_entries: { toDb: financialToDb },
  bank_accounts: { toDb: bankAccountToDb },
};

export const TABLE_TO_CACHE_KEY: Record<string, "motos" | "clients" | "rentals" | "fines" | "maintenance" | "financial" | "bankAccounts"> = {
  motorcycles: "motos",
  clients: "clients",
  rentals: "rentals",
  fines: "fines",
  maintenance: "maintenance",
  financial_entries: "financial",
  bank_accounts: "bankAccounts",
};