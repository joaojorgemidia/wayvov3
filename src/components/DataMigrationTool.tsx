import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/companies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const db = supabase as any;

interface MigrationResult {
  table: string;
  count: number;
  status: "success" | "error";
  error?: string;
}

// Maps localStorage camelCase to DB snake_case for each entity type
function motoToRow(m: any) {
  return {
    id: m.id,
    placa: m.placa || "",
    modelo: m.modelo || "",
    ano_fabricacao: m.anoFabricacao ?? null,
    ano_modelo: m.anoModelo ?? null,
    cor: m.cor || "",
    chassi: m.chassi || "",
    renavam: m.renavam || "",
    num_motor: m.numMotor || "",
    aplicativo: m.aplicativo || "",
    tipo: m.tipo || "propria",
    proprietario: m.proprietario || null,
    status: m.status || "disponivel",
    km_atual: m.kmAtual ?? null,
    km_compra: m.kmCompra ?? null,
    km_troca_oleo: m.kmTrocaOleo ?? null,
    km_venda: m.kmVenda ?? null,
    ultima_vistoria: m.ultimaVistoria || null,
    ultima_troca_oleo: m.ultimaTrocaOleo || null,
    historico_oleo: m.historicoOleo || [],
    valor_compra: m.valorCompra ?? null,
    data_compra: m.dataCompra || null,
    valor_fipe: m.valorFipe ?? null,
    data_fipe: m.dataFipe || null,
    valor_venda: m.valorVenda ?? null,
    data_venda: m.dataVenda || null,
    lucro_operacional: m.lucroOperacional ?? null,
    decisao: m.decisao || null,
    crlv_pdf_name: m.crlvPdfName || null,
  };
}

function clientToRow(c: any) {
  return {
    id: c.id,
    nome: c.nome || "",
    cpf: c.cpf || "",
    cnh: c.cnh || "",
    cnh_categoria: c.cnhCategoria || "",
    cnh_validade: c.cnhValidade || null,
    cnh_pdf_name: c.cnhPdfName || null,
    telefone: c.telefone || "",
    email: c.email || "",
    cep: c.cep || "",
    rua: c.rua || "",
    numero: c.numero || "",
    complemento: c.complemento || "",
    bairro: c.bairro || "",
    cidade: c.cidade || "",
    estado: c.estado || "",
    comprovante_endereco_name: c.comprovanteEnderecoName || null,
    emergencia_nome1: c.emergenciaNome1 || "",
    emergencia_tel1: c.emergenciaTel1 || "",
    emergencia_nome2: c.emergenciaNome2 || "",
    emergencia_tel2: c.emergenciaTel2 || "",
    observacoes: c.observacoes || "",
  };
}

function rentalToRow(r: any) {
  return {
    id: r.id,
    moto_id: r.motoId || "",
    cliente_id: r.clienteId || "",
    vendedor: r.vendedor || "",
    data_inicio: r.dataInicio || null,
    hora_inicio: r.horaInicio || "",
    data_fim: r.dataFim || null,
    data_fim_contrato: r.dataFimContrato || null,
    proximo_pagamento: r.proximoPagamento || null,
    tempo_minimo_contrato: r.tempoMinimoContrato ?? null,
    frequencia_pagamento: r.frequenciaPagamento || "",
    valor_diario: r.valorDiario || 0,
    valor_caucao: r.valorCaucao || 0,
    caucao_pendente: r.caucaoPendente || false,
    caucao_parcelado: r.caucaoParcelado || false,
    parcelas_caucao: r.parcelasCaucao || [],
    multa_atraso: r.multaAtraso || 0,
    juros_atraso_mes: r.jurosAtrasoMes || 0,
    local_retirada: r.localRetirada || "",
    local_devolucao: r.localDevolucao || "",
    km_inicio: r.kmInicio || 0,
    km_fim: r.kmFim ?? null,
    nivel_combustivel: r.nivelCombustivel || "",
    plano: r.plano || "",
    raio_circulacao: r.raioCirculacao || "",
    seguro_terceiros: r.seguroTerceiros || false,
    gerar_cobranca_caucao: r.gerarCobrancaCaucao || false,
    gerar_cobranca_pagamento: r.gerarCobrancaPagamento || false,
    status: r.status || "ativa",
    checklist_retirada: r.checklistRetirada || [],
    checklist_devolucao: r.checklistDevolucao || [],
    observacoes: r.observacoes || "",
  };
}

function fineToRow(f: any) {
  return {
    id: f.id,
    moto_id: f.motoId || "",
    cliente_id: f.clienteId || null,
    rental_id: f.rentalId || null,
    data_multa: f.dataMulta || null,
    data_notificacao: f.dataNotificacao || null,
    valor: f.valor || 0,
    descricao: f.descricao || "",
    status: f.status || "pendente",
    responsavel: f.responsavel || "locadora",
  };
}

function maintenanceToRow(m: any) {
  return {
    id: m.id,
    moto_id: m.motoId || "",
    tipo: m.tipo || "outro",
    data: m.data || null,
    km: m.km ?? null,
    custo: m.custo || 0,
    descricao: m.descricao || "",
    fornecedor: m.fornecedor || "",
    status: m.status || "agendada",
  };
}

function financialToRow(e: any) {
  return {
    id: e.id,
    tipo: e.tipo || "despesa",
    categoria: e.categoria || "",
    subcategoria: e.subcategoria || null,
    descricao: e.descricao || "",
    valor: e.valor || 0,
    data: e.data || null,
    data_prevista: e.dataPrevista || null,
    moto_id: e.motoId || null,
    rental_id: e.rentalId || null,
    cliente_id: e.clienteId || null,
    pago: e.pago ?? false,
    recorrente: e.recorrente ?? false,
    recorrencia_tipo: e.recorrenciaTipo || null,
    recorrencia_vezes: e.recorrenciaVezes ?? null,
    despesa_fixa: e.despesaFixa ?? false,
    ignorada: e.ignorada ?? false,
    observacao: e.observacao || null,
    tags: e.tags || [],
    conta: e.conta || null,
    natureza: e.natureza || null,
    placa: e.placa || null,
    cliente_nome: e.clienteNome || null,
    classificacao_manual: e.classificacaoManual ?? false,
    serie_id: e.serieId || null,
    fixed_origin_id: e.fixedOriginId || null,
  };
}

function bankAccountToRow(a: any) {
  return {
    id: a.id,
    nome: a.nome || "",
    banco: a.banco || "",
    saldo_inicial: a.saldoInicial || 0,
  };
}

async function importTable(
  table: string,
  label: string,
  items: any[],
  toRow: (item: any) => any,
  companyId: string,
): Promise<MigrationResult> {
  if (!items || items.length === 0) {
    return { table: label, count: 0, status: "success" };
  }

  try {
    // Generate UUID for items that have non-UUID ids
    const rows = items.map((item) => {
      const row = toRow(item);
      // If id is not a UUID, generate a new one but keep mapping
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id);
      return {
        ...row,
        id: isUuid ? row.id : crypto.randomUUID(),
        company_id: companyId,
      };
    });

    // Upsert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await db.from(table).upsert(batch, { onConflict: "id" });
      if (error) throw error;
    }

    return { table: label, count: items.length, status: "success" };
  } catch (err: any) {
    return { table: label, count: 0, status: "error", error: err.message };
  }
}

export function DataMigrationTool() {
  const [migrating, setMigrating] = useState(false);
  const [results, setResults] = useState<MigrationResult[]>([]);
  const [exportData, setExportData] = useState<string>("");

  const exportLocalStorage = () => {
    const companyId = getActiveCompanyId();
    const prefix = `${companyId}:`;
    const data: Record<string, any> = {};

    // Collect all company-scoped keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const shortKey = key.replace(prefix, "");
        try {
          data[shortKey] = JSON.parse(localStorage.getItem(key) || "null");
        } catch {
          data[shortKey] = localStorage.getItem(key);
        }
      }
    }

    // Also get bank accounts
    const bankKey = `${companyId}:bank_accounts`;
    if (localStorage.getItem(bankKey)) {
      data["bank_accounts"] = JSON.parse(localStorage.getItem(bankKey) || "[]");
    }

    const json = JSON.stringify(data, null, 2);
    setExportData(json);

    // Download as file
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${companyId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("Dados exportados com sucesso!");
  };

  const importFromLocalStorage = async () => {
    setMigrating(true);
    setResults([]);
    const companyId = getActiveCompanyId();
    const prefix = `${companyId}:`;

    const getLS = (key: string) => {
      const raw = localStorage.getItem(`${prefix}${key}`);
      if (!raw) return [];
      try { return JSON.parse(raw); } catch { return []; }
    };

    const motos = getLS("motos");
    const clients = getLS("clients");
    const rentals = getLS("rentals");
    const fines = getLS("fines");
    const maintenance = getLS("maintenance");
    const financial = getLS("financial");
    const bankAccounts = getLS("bank_accounts");

    const allResults: MigrationResult[] = [];

    allResults.push(await importTable("motorcycles", "Motos", motos, motoToRow, companyId));
    allResults.push(await importTable("clients", "Clientes", clients, clientToRow, companyId));
    allResults.push(await importTable("rentals", "Locações", rentals, rentalToRow, companyId));
    allResults.push(await importTable("fines", "Multas", fines, fineToRow, companyId));
    allResults.push(await importTable("maintenance", "Manutenções", maintenance, maintenanceToRow, companyId));
    allResults.push(await importTable("financial_entries", "Financeiro", financial, financialToRow, companyId));
    allResults.push(await importTable("bank_accounts", "Contas", bankAccounts, bankAccountToRow, companyId));

    setResults(allResults);
    setMigrating(false);

    const hasErrors = allResults.some(r => r.status === "error");
    if (hasErrors) {
      toast.error("Migração concluída com erros. Verifique os detalhes.");
    } else {
      toast.success("Migração concluída com sucesso!");
    }
  };

  const importFromFile = async (file: File) => {
    setMigrating(true);
    setResults([]);
    const companyId = getActiveCompanyId();

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const allResults: MigrationResult[] = [];
      allResults.push(await importTable("motorcycles", "Motos", data.motos || [], motoToRow, companyId));
      allResults.push(await importTable("clients", "Clientes", data.clients || [], clientToRow, companyId));
      allResults.push(await importTable("rentals", "Locações", data.rentals || [], rentalToRow, companyId));
      allResults.push(await importTable("fines", "Multas", data.fines || [], fineToRow, companyId));
      allResults.push(await importTable("maintenance", "Manutenções", data.maintenance || [], maintenanceToRow, companyId));
      allResults.push(await importTable("financial_entries", "Financeiro", data.financial || [], financialToRow, companyId));
      allResults.push(await importTable("bank_accounts", "Contas", data.bank_accounts || [], bankAccountToRow, companyId));

      setResults(allResults);
      const hasErrors = allResults.some(r => r.status === "error");
      if (hasErrors) {
        toast.error("Importação concluída com erros.");
      } else {
        toast.success("Importação concluída com sucesso!");
      }
    } catch (err: any) {
      toast.error("Erro ao ler arquivo: " + err.message);
    }

    setMigrating(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Migração de Dados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Migre os dados do armazenamento local (navegador) para o banco de dados centralizado.
          Isso garante que os dados sejam os mesmos em todos os dispositivos e domínios.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportLocalStorage}>
            <Download className="h-4 w-4 mr-1.5" />
            Exportar localStorage
          </Button>

          <Button size="sm" onClick={importFromLocalStorage} disabled={migrating}>
            {migrating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Importar do localStorage
          </Button>

          <label>
            <Button variant="secondary" size="sm" asChild disabled={migrating}>
              <span>
                <Upload className="h-4 w-4 mr-1.5" />
                Importar de arquivo
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFromFile(f);
              }}
            />
          </label>
        </div>

        {results.length > 0 && (
          <div className="space-y-1.5 pt-2">
            {results.map((r) => (
              <div key={r.table} className="flex items-center gap-2 text-sm">
                {r.status === "success" ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">{r.table}</span>
                <span className="text-muted-foreground">
                  {r.status === "success" ? `${r.count} registros` : r.error}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
