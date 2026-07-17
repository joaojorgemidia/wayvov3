import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Upload, Check, X, Loader2, HelpCircle } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { useBankAccounts, useSicoobTransactions } from "@/hooks/useSupabaseData";
import { DEFAULT_CATEGORIAS, DEFAULT_SUBCATEGORIAS } from "@/lib/financeiro-constants";
import { parseSicoobCsv } from "@/lib/sicoob-csv-import";
import { runMatchingForPendingRows, suggestPatternFromDescription } from "@/lib/sicoob-matching";
import { supabase } from "@/integrations/supabase/client";
import type { FinancialEntry, SicoobTransaction } from "@/lib/types";

function ReviewRow({
  staging,
  bankAccountNome,
  onResolved,
}: {
  staging: SicoobTransaction;
  bankAccountNome: string | null;
  onResolved: () => void;
}) {
  const { activeCompany } = useCompany();
  const { confirm, ignore } = useSicoobTransactions();
  const tipoEsperado = staging.tipo === "credito" ? "receita" : "despesa";
  const categoriaOptions = DEFAULT_CATEGORIAS[tipoEsperado];

  const [categoria, setCategoria] = useState(staging.suggestedCategoria || "");
  const [subcategoria, setSubcategoria] = useState(staging.suggestedSubcategoria || "");
  const [padrao, setPadrao] = useState(suggestPatternFromDescription(staging.descricao));
  const [salvarRegra, setSalvarRegra] = useState(true);
  const [candidatoEscolhido, setCandidatoEscolhido] = useState<string>(staging.candidateFinancialEntryIds?.[0] || "");
  const [saving, setSaving] = useState(false);

  const subOptions = DEFAULT_SUBCATEGORIAS[categoria] || [];
  const temCandidatosAmbiguos = (staging.candidateFinancialEntryIds?.length || 0) > 0;

  const handleConciliarCandidato = async () => {
    if (!candidatoEscolhido) return;
    setSaving(true);
    try {
      const db = supabase as any;
      const { error: entryError } = await db
        .from("financial_entries")
        .update({ pago: true, data: staging.data, conta: bankAccountNome || undefined, sicoob_transaction_id: staging.sicoobTransactionId })
        .eq("id", candidatoEscolhido)
        .eq("company_id", activeCompany.id);
      if (entryError) throw entryError;
      const { error: stagingError } = await db
        .from("sicoob_transactions")
        .update({ status: "conciliado", matched_financial_entry_id: candidatoEscolhido, reviewed_at: new Date().toISOString() })
        .eq("id", staging.id)
        .eq("company_id", activeCompany.id);
      if (stagingError) throw stagingError;
      toast.success("Transação conciliada");
      onResolved();
    } catch (err: any) {
      toast.error("Falha ao conciliar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmar = async () => {
    if (!categoria) {
      toast.error("Escolha uma categoria");
      return;
    }
    setSaving(true);
    try {
      const entry: FinancialEntry & { id: string } = {
        id: crypto.randomUUID(),
        tipo: tipoEsperado,
        categoria,
        subcategoria: subcategoria || undefined,
        descricao: staging.descricao,
        valor: staging.valor,
        data: staging.data,
        dataPrevista: staging.data,
        motoId: null,
        rentalId: null,
        clienteId: null,
        pago: true,
        conta: bankAccountNome || undefined,
      };
      await confirm({
        staging,
        entry,
        rule: salvarRegra && padrao.trim()
          ? { padrao: padrao.trim(), tipo: tipoEsperado, categoria, subcategoria: subcategoria || null, tags: [] }
          : undefined,
      });
      toast.success("Lançamento criado");
      onResolved();
    } catch (err: any) {
      toast.error("Falha ao confirmar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleIgnorar = async () => {
    setSaving(true);
    try {
      await ignore(staging.id);
      onResolved();
    } catch (err: any) {
      toast.error("Falha ao ignorar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium">{staging.descricao}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(staging.data + "T12:00:00").toLocaleDateString("pt-BR")}
            </div>
          </div>
          <div className={`text-sm font-semibold ${staging.tipo === "credito" ? "text-emerald-600" : "text-red-600"}`}>
            {staging.tipo === "credito" ? "+" : "-"} R$ {staging.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        {temCandidatosAmbiguos ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Vários lançamentos com valor/data parecidos</Badge>
            <Select value={candidatoEscolhido} onValueChange={setCandidatoEscolhido}>
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Escolher lançamento" /></SelectTrigger>
              <SelectContent>
                {(staging.candidateFinancialEntryIds || []).map((id) => (
                  <SelectItem key={id} value={id}>{id.slice(0, 8)}…</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleConciliarCandidato} disabled={!candidatoEscolhido || saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Conciliar
            </Button>
            <Button size="sm" variant="ghost" onClick={handleIgnorar} disabled={saving}>
              <X className="h-3 w-3" /> Ignorar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Select value={categoria} onValueChange={(v) => { setCategoria(v); setSubcategoria(""); }}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {categoriaOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {subOptions.length > 0 && (
              <Select value={subcategoria} onValueChange={setSubcategoria}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
                <SelectContent>
                  {subOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                value={padrao}
                onChange={(e) => setPadrao(e.target.value)}
                className="h-8 w-40 text-xs"
                placeholder="Padrão da regra"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                <Checkbox checked={salvarRegra} onCheckedChange={(v) => setSalvarRegra(!!v)} />
                Salvar regra
              </label>
            </div>
            <Button size="sm" onClick={handleConfirmar} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={handleIgnorar} disabled={saving}>
              <X className="h-3 w-3" /> Ignorar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SicoobImportacoesTab() {
  const { activeCompany } = useCompany();
  const { data: bankAccounts } = useBankAccounts();
  const { data: transactions, isLoading, refetch } = useSicoobTransactions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(
    () => bankAccounts.find((a) => a.banco === "Sicoob")?.id || bankAccounts[0]?.id || "",
  );
  const [importing, setImporting] = useState(false);

  const pendentes = useMemo(
    () => (transactions || []).filter((t) => t.status === "pendente" || t.status === "categorizado"),
    [transactions],
  );
  const conciliadosAuto = useMemo(
    () => (transactions || []).filter((t) => t.status === "conciliado" && t.matchedFinancialEntryId).slice(0, 20),
    [transactions],
  );
  const bankAccountNomeById = useMemo(
    () => new Map(bankAccounts.map((a) => [a.id, a.nome])),
    [bankAccounts],
  );

  const handleFileSelected = async (file: File) => {
    const bankAccount = bankAccounts.find((a) => a.id === selectedBankAccountId);
    if (!bankAccount) {
      toast.error("Selecione a conta bancária do extrato");
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const { rows, skipped } = parseSicoobCsv(text);
      if (rows.length === 0) {
        toast.error("Nenhuma transação reconhecida no arquivo");
        return;
      }

      const db = supabase as any;
      const { error } = await db.from("sicoob_transactions").upsert(
        rows.map((r) => ({
          company_id: activeCompany.id,
          bank_account_id: bankAccount.id,
          sicoob_transaction_id: r.sicoobTransactionId,
          data: r.data,
          tipo: r.tipo,
          valor: r.valor,
          descricao: r.descricao,
          descricao_normalizada: r.descricaoNormalizada,
          raw_payload: {},
          status: "pendente",
        })),
        { onConflict: "company_id,sicoob_transaction_id", ignoreDuplicates: true },
      );
      if (error) throw error;

      await runMatchingForPendingRows(activeCompany.id, bankAccount.nome);
      await refetch();

      toast.success(
        `${rows.length} transações importadas${skipped > 0 ? ` (${skipped} linhas ignoradas)` : ""}. Confira a lista de revisão.`,
      );
      setImportDialogOpen(false);
    } catch (err: any) {
      toast.error("Falha ao importar CSV: " + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Importações do extrato</h3>
          {pendentes.length > 0 && <Badge variant="secondary">{pendentes.length} aguardando revisão</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Importar CSV do extrato
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : pendentes.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma transação aguardando revisão. Importe um CSV do extrato para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pendentes.map((t) => (
            <ReviewRow
              key={t.id}
              staging={t}
              bankAccountNome={(t.bankAccountId && bankAccountNomeById.get(t.bankAccountId)) || null}
              onResolved={refetch}
            />
          ))}
        </div>
      )}

      {conciliadosAuto.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="h-3 w-3" /> Conciliados automaticamente com lançamentos já existentes (mais recentes)
          </div>
          {conciliadosAuto.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs text-muted-foreground px-3 py-2 rounded-md border border-border/40">
              <span>{t.descricao}</span>
              <span>{new Date(t.data + "T12:00:00").toLocaleDateString("pt-BR")} — R$ {t.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar CSV do extrato</DialogTitle>
            <DialogDescription>
              Baixe o extrato no internet banking Sicoob (formato CSV) e importe aqui. As
              transações serão conciliadas com lançamentos existentes ou categorizadas
              automaticamente por regra — o que não for reconhecido fica pendente de revisão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Conta bancária</label>
              <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <Button
              className="w-full"
              disabled={importing || !selectedBankAccountId}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Escolher arquivo CSV
            </Button>
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
}
