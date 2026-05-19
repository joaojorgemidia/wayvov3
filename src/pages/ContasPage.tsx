import { useMemo, useState } from "react";
import { FinancialEntry } from "@/lib/types";
import { maskCurrency, parseBRL, formatBRL } from "@/lib/masks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BankIcon } from "@/components/BankLogos";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Check, CreditCard, Info, MoreVertical, Pencil, Plus, Search, Trash2, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useBankAccounts, useFinancialEntries, type BankAccount } from "@/hooks/useSupabaseData";
import { calculateAccountBalances } from "@/lib/account-balances";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { usePermissions } from "@/hooks/usePermissions";

const bankOptions = [
  "C6", "Nubank", "Mercado Pago", "Asaas", "Inter", "Itaú", "Bradesco",
  "Santander", "Banco do Brasil", "Caixa", "Pan", "Sicoob", "PicPay", "PagBank", "Dinheiro",
];

const bandeiraOptions = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Diners", "Outro"];

export default function ContasPage() {
  const { data: accounts, save: saveBankAccount, remove: removeBankAccount } = useBankAccounts();
  const { save: saveFinancialEntry } = useFinancialEntries();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState({ nome: "", banco: "", saldoInicial: "", tipo: "banco" as "banco" | "cartao", diaFechamento: "", diaVencimento: "", limite: "", contaPagamento: "", bandeira: "", descricao: "" });
  const [bankSelectOpen, setBankSelectOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const { financial } = useDataCacheSnapshot();
  const { canCreate, canEdit, canDelete } = usePermissions();


  // Reajuste de saldo state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAccount, setAdjustAccount] = useState<BankAccount | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustMode, setAdjustMode] = useState<"transacao" | "saldo_inicial">("transacao");
  const [adjustDesc, setAdjustDesc] = useState("");

  const accountBalances = useMemo(() => {
    return calculateAccountBalances(accounts, financial, 90);
  }, [accounts, financial]);

  const totalAtual = useMemo(
    () => Object.values(accountBalances).reduce((s, b) => s + b.atual, 0),
    [accountBalances],
  );

  const totalPrevisto = useMemo(
    () => Object.values(accountBalances).reduce((s, b) => s + b.previsto, 0),
    [accountBalances],
  );

  const filteredAccounts = accountSearch
    ? accounts.filter(
        (a) =>
          a.nome.toLowerCase().includes(accountSearch.toLowerCase()) ||
          a.banco.toLowerCase().includes(accountSearch.toLowerCase()),
      )
    : accounts;

  const contasBancarias = filteredAccounts.filter((a) => a.tipo !== "cartao");
  const cartoes = filteredAccounts.filter((a) => a.tipo === "cartao");

  const filteredBankOptions = bankOptions.filter((bank) =>
    bank.toLowerCase().includes(bankSearch.toLowerCase()),
  );

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const openNew = () => {
    setEditAccount(null);
    setForm({ nome: "", banco: "", saldoInicial: "", tipo: "banco", diaFechamento: "", diaVencimento: "", limite: "", contaPagamento: "", bandeira: "", descricao: "" });
    setBankSearch("");
    setDialogOpen(true);
  };

  const openNewCartao = () => {
    setEditAccount(null);
    setForm({ nome: "", banco: "", saldoInicial: "", tipo: "cartao", diaFechamento: "", diaVencimento: "", limite: "", contaPagamento: "", bandeira: "Visa", descricao: "" });
    setBankSearch("");
    setDialogOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditAccount(account);
    setForm({
      nome: account.nome,
      banco: account.banco,
      saldoInicial: String(account.saldoInicial),
      tipo: account.tipo || "banco",
      diaFechamento: account.diaFechamento ? String(account.diaFechamento) : "",
      diaVencimento: account.diaVencimento ? String(account.diaVencimento) : "",
      limite: account.limite ? String(account.limite) : "",
      contaPagamento: account.contaPagamento || "",
      bandeira: account.bandeira || "",
      descricao: account.descricao || "",
    });
    setBankSearch("");
    setDialogOpen(true);
  };

  const openAdjust = (account: BankAccount) => {
    const balance = accountBalances[account.nome] || { atual: 0 };
    setAdjustAccount(account);
    setAdjustValue(formatBRL(balance.atual));
    setAdjustMode("transacao");
    setAdjustDesc("");
    setAdjustOpen(true);
  };

  const handleBankSelect = (bank: string) => {
    setForm((current) => ({
      ...current,
      banco: bank,
      nome: current.nome || bank,
    }));
    setBankSearch("");
    setBankSelectOpen(false);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.banco) return;
    if (form.tipo === "cartao") {
      const df = parseInt(form.diaFechamento, 10);
      const dv = parseInt(form.diaVencimento, 10);
      if (!df || df < 1 || df > 31) { toast.error("Dia de fechamento inválido (1-31)"); return; }
      if (!dv || dv < 1 || dv > 31) { toast.error("Dia de vencimento inválido (1-31)"); return; }
    }
    // Bloquear nome duplicado na UI antes de bater no banco
    const nomeTrim = form.nome.trim().toLowerCase();
    if (!editAccount) {
      if (accounts.some((a) => a.nome.trim().toLowerCase() === nomeTrim)) {
        toast.error("Já existe uma conta com esse nome. Use um nome diferente.");
        return;
      }
    } else {
      if (accounts.some((a) => a.id !== editAccount.id && a.nome.trim().toLowerCase() === nomeTrim)) {
        toast.error("Já existe outra conta com esse nome. Use um nome diferente.");
        return;
      }
    }
    const saldoInicial =
      parseFloat(form.saldoInicial.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
    const limite = parseFloat((form.limite || "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
    const extra = {
      tipo: form.tipo,
      diaFechamento: form.tipo === "cartao" ? parseInt(form.diaFechamento, 10) : null,
      diaVencimento: form.tipo === "cartao" ? parseInt(form.diaVencimento, 10) : null,
      limite,
      contaPagamento: form.tipo === "cartao" ? (form.contaPagamento || null) : null,
      bandeira: form.tipo === "cartao" ? (form.bandeira || null) : null,
      descricao: form.descricao.trim() || null,
    };
    try {
      if (editAccount) {
        await saveBankAccount({ ...editAccount, nome: form.nome.trim(), banco: form.banco, saldoInicial, ...extra });
        toast.success("Conta atualizada");
      } else {
        await saveBankAccount({ id: crypto.randomUUID(), nome: form.nome.trim(), banco: form.banco, saldoInicial, ...extra });
        toast.success(form.tipo === "cartao" ? "Cartão criado" : "Conta criada");
      }
      setDialogOpen(false);
    } catch (err: any) {
      console.error("[ContasPage] saveBankAccount error:", err);
      toast.error("Erro ao salvar conta. Tente novamente.");
    }
  };

  const handleDelete = async (id: string) => {
    await removeBankAccount(id);
    toast.success("Conta removida");
  };

  const handleAdjust = async () => {
    if (!adjustAccount || !adjustValue) return;
    const targetValue = parseBRL(adjustValue);

    if (adjustMode === "saldo_inicial") {
      // Calcula o saldo apenas das transações pagas desta conta
      // SEM incluir saldoInicial (para evitar efeito de duplicatas)
      const transactionBalance = (financial || [])
        .filter(e => e.pago && e.conta === adjustAccount.nome)
        .reduce((sum, e) => sum + (e.tipo === "receita" ? e.valor : -e.valor), 0);

      // Novo saldoInicial = targetValue - transactionBalance
      // Arredondado para evitar floating point
      const newSaldoInicial = Math.round((targetValue - transactionBalance) * 100) / 100;

      await saveBankAccount({ ...adjustAccount, saldoInicial: newSaldoInicial });
    }

    if (adjustMode === "transacao") {
      const balance = accountBalances[adjustAccount.nome] || { atual: 0 };
      const diff = Math.round((targetValue - balance.atual) * 100) / 100;
      if (Math.abs(diff) < 0.01) return;

      const entry = {
        id: crypto.randomUUID(),
        tipo: diff > 0 ? "receita" : "despesa",
        valor: Math.abs(diff),
        descricao: "Ajuste de saldo",
        data: new Date().toISOString().split("T")[0],
        dataPrevista: new Date().toISOString().split("T")[0],
        categoria: "ajuste_saldo",
        subcategoria: null,
        tags: [],
        pago: true,
        conta: adjustAccount.nome,
        natureza: "administrativa",
        motoId: null, rentalId: null, clienteId: null,
        placa: "", clienteNome: "",
        recorrente: false, despesaFixa: false,
        serieId: null, fixedOriginId: null, recurringGroupId: null,
        recorrenciaTipo: "mensal", recorrenciaVezes: 0, recorrenciaPorPeriodo: 1,
        observacao: null, asaasPaymentId: null,
      } as FinancialEntry;
      await saveFinancialEntry({ ...entry });
    }

    setAdjustAccount(null);
    setAdjustValue("");
    setAdjustOpen(false);
  };

  const adjustCurrentBalance = adjustAccount ? (accountBalances[adjustAccount.nome]?.atual || 0) : 0;
  const adjustTargetParsed = parseBRL(adjustValue);
  const adjustDiff = !isNaN(adjustTargetParsed) ? adjustTargetParsed - adjustCurrentBalance : 0;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Contas</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gerencie suas contas bancárias e saldos
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openNewCartao} className="gap-2">
              <CreditCard className="h-4 w-4" /> Novo cartão
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar conta..."
          value={accountSearch}
          onChange={(e) => setAccountSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo atual</p>
              <InfoTooltip text="Soma dos saldos efetivos de todas as contas (apenas transações efetuadas)" />
            </div>
            <p className={`font-mono text-2xl font-bold ${totalAtual >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {fmt(totalAtual)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-muted-foreground/30">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo previsto (90 dias)</p>
              <InfoTooltip text="Quanto você terá nesta conta daqui a 90 dias, somando o saldo atual com todos os lançamentos pendentes (a pagar e a receber, incluindo atrasados) que vencem nesse período." />
            </div>
            <p className={`font-mono text-2xl font-bold ${totalPrevisto >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {fmt(totalPrevisto)}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contas bancárias</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {contasBancarias.map((account) => {
          const balance = accountBalances[account.nome] || { atual: 0, previsto: 0 };
          return (
            <Card key={account.id} className="relative">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <BankIcon conta={account.banco} size={36} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{account.nome}</p>
                      {account.nome !== account.banco && (
                        <p className="text-xs text-muted-foreground">{account.banco}</p>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => openEdit(account)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openAdjust(account)}>
                        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reajuste de saldo
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem
                          onClick={() => handleDelete(account.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Saldo atual</span>
                    <span className={`font-mono text-sm font-bold ${balance.atual >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {fmt(balance.atual)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">Previsto em 90 dias</span>
                      <InfoTooltip text="Saldo atual + lançamentos pendentes desta conta (a pagar e a receber, incluindo atrasados) com vencimento nos próximos 90 dias." />
                    </div>
                    <span className={`font-mono text-sm ${balance.previsto >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {fmt(balance.previsto)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!accountSearch && canCreate && (
          <Card className="cursor-pointer border-dashed transition-colors hover:border-primary/50" onClick={openNew}>
            <CardContent className="flex h-full min-h-[140px] flex-col items-center justify-center p-5">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
                <Plus className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-primary">Nova conta</p>
            </CardContent>
          </Card>
        )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cartões de crédito</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((account) => {
            const balance = accountBalances[account.nome] || { atual: 0, previsto: 0 };
            const limite = account.limite || 0;
            const usado = Math.max(0, -balance.atual);
            const disponivel = Math.max(0, limite - usado);
            const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
            return (
              <Card key={account.id} className="relative overflow-hidden">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{account.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.bandeira || "Cartão"} {account.banco ? `• ${account.banco}` : ""}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => openEdit(account)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem onClick={() => handleDelete(account.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {account.descricao && (
                    <p className="mb-3 text-xs text-muted-foreground">{account.descricao}</p>
                  )}

                  <div className="space-y-2">
                    {limite > 0 && (
                      <>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Fatura atual</span>
                          <span className="font-mono">{fmt(usado)} / {fmt(limite)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground">Limite disponível</span>
                          <span className="font-mono text-sm font-semibold text-emerald-600">{fmt(disponivel)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                      <span>Vencimento</span>
                      <span>Dia {account.diaVencimento || "-"} • Fechamento dia {account.diaFechamento || "-"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {!accountSearch && canCreate && (
            <Card className="cursor-pointer border-dashed transition-colors hover:border-primary/50" onClick={openNewCartao}>
              <CardContent className="flex h-full min-h-[140px] flex-col items-center justify-center p-5">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
                  <Plus className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-primary">Novo cartão de crédito</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Dialog Nova/Editar conta */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editAccount ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => setForm((c) => ({ ...c, tipo: "banco" }))}
                  className={`rounded-lg border-2 p-3 text-left text-sm transition-colors ${form.tipo === "banco" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-muted-foreground/30"}`}>
                  Conta bancária
                </button>
                <button type="button"
                  onClick={() => setForm((c) => ({ ...c, tipo: "cartao" }))}
                  className={`rounded-lg border-2 p-3 text-left text-sm transition-colors ${form.tipo === "cartao" ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-muted-foreground/30"}`}>
                  Cartão de crédito
                </button>
              </div>
            </div>
            <div>
              <Label>Nome {form.tipo === "cartao" ? "do cartão" : "da conta"}</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((current) => ({ ...current, nome: e.target.value }))}
                placeholder={form.tipo === "cartao" ? "Ex: Nubank Black" : "Ex: Conta corrente"}
              />
            </div>
            <div>
              <Label>Banco / Instituição</Label>
              <Popover open={bankSelectOpen} onOpenChange={(open) => { setBankSelectOpen(open); if (!open) setBankSearch(""); }}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="h-10 w-full justify-start gap-2 font-normal">
                    {form.banco ? (
                      <>
                        <BankIcon conta={form.banco} size={20} />
                        <span>{form.banco}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Selecione o banco...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start" sideOffset={6}>
                  <div className="border-b px-3 py-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} placeholder="Buscar banco..." className="h-10 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                    </div>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto overscroll-contain p-2" onWheelCapture={(event) => event.stopPropagation()}>
                    {filteredBankOptions.length > 0 ? (
                      filteredBankOptions.map((bank) => (
                        <button key={bank} type="button" aria-selected={form.banco === bank} onClick={() => handleBankSelect(bank)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground ${form.banco === bank ? "bg-accent text-accent-foreground" : ""}`}>
                          <BankIcon conta={bank} size={38} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{bank}</span>
                          <Info className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                          {form.banco === bank && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum banco encontrado.</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {form.tipo === "cartao" ? (
              <>
                <div>
                  <Label>Bandeira</Label>
                  <select
                    value={form.bandeira}
                    onChange={(e) => setForm((c) => ({ ...c, bandeira: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {bandeiraOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Descrição <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <Input value={form.descricao} onChange={(e) => setForm((c) => ({ ...c, descricao: e.target.value }))} placeholder="Ex: cartão pessoal" />
                </div>
                {/* Bloco 1 — Ciclo da fatura */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">1</span>
                    <p className="text-sm font-semibold">Ciclo da fatura</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Fechamento (dia)</Label>
                      <Input type="number" min={1} max={31} value={form.diaFechamento}
                        onChange={(e) => setForm((c) => ({ ...c, diaFechamento: e.target.value }))} placeholder="25" />
                      <p className="mt-1 text-[11px] text-muted-foreground">Dia em que a fatura fecha.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Vencimento (dia)</Label>
                      <Input type="number" min={1} max={31} value={form.diaVencimento}
                        onChange={(e) => setForm((c) => ({ ...c, diaVencimento: e.target.value }))} placeholder="5" />
                      <p className="mt-1 text-[11px] text-muted-foreground">Dia em que você paga.</p>
                    </div>
                  </div>
                  <p className="rounded-md bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                    💡 Compras <strong>antes</strong> do fechamento entram na fatura deste mês. <strong>Depois</strong> do fechamento, vão para a próxima.
                  </p>
                </div>

                {/* Bloco 2 — Limite */}
                <div>
                  <Label>Limite do cartão <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input value={form.limite} onChange={(e) => setForm((c) => ({ ...c, limite: e.target.value }))} placeholder="0,00" className="pl-10" />
                  </div>
                </div>

                {/* Bloco 3 — Pagamento */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">2</span>
                    <p className="text-sm font-semibold">Pagamento da fatura</p>
                  </div>
                  <Label className="text-xs">Debitar de qual conta?</Label>
                  <select
                    value={form.contaPagamento}
                    onChange={(e) => setForm((c) => ({ ...c, contaPagamento: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione a conta...</option>
                    {accounts.filter(a => a.tipo !== "cartao").map(a => (
                      <option key={a.id} value={a.nome}>{a.nome}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Todo mês o sistema cria automaticamente uma despesa <strong>pendente</strong> no vencimento, debitando dessa conta. Você só precisa marcar como paga quando quitar.
                  </p>
                </div>
              </>
            ) : (
              <div>
                <Label>Saldo inicial (R$)</Label>
                <Input value={form.saldoInicial} onChange={(e) => setForm((current) => ({ ...current, saldoInicial: e.target.value }))} placeholder="0,00" />
                <p className="mt-1 text-xs text-muted-foreground">Saldo da conta <strong>antes</strong> de qualquer transação registrada no sistema. Para ajustar o saldo atual, use "Reajuste de saldo".</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nome.trim() || !form.banco}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Reajuste de Saldo */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reajuste de saldo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {adjustAccount && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <BankIcon conta={adjustAccount.banco} size={28} />
                <div>
                  <p className="text-sm font-semibold">{adjustAccount.nome}</p>
                  <p className="text-xs text-muted-foreground">Saldo atual: <span className={`font-mono font-medium ${adjustCurrentBalance >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(adjustCurrentBalance)}</span></p>
                </div>
              </div>
            )}

            <div>
              <Label>Novo saldo desejado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(maskCurrency(e.target.value))}
                  placeholder="0,00"
                  className="pl-10 font-mono text-lg"
                />
              </div>
              {Math.abs(adjustDiff) >= 0.01 && (
                <p className={`mt-1 text-xs font-medium ${adjustDiff > 0 ? "text-emerald-600" : "text-destructive"}`}>
                  Diferença: {adjustDiff > 0 ? "+" : ""}{fmt(adjustDiff)}
                </p>
              )}
            </div>

            <div>
              <Label className="mb-2 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Você gostaria de...</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAdjustMode("transacao")}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${adjustMode === "transacao" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground">Criar transação de ajuste</p>
                  <p className="mt-1 text-xs text-muted-foreground">Para ajustar seu saldo, uma transação de ajuste será criada.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustMode("saldo_inicial")}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${adjustMode === "saldo_inicial" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground">Modificar saldo inicial</p>
                  <p className="mt-1 text-xs text-muted-foreground">Essa opção altera seu saldo inicial para reajustar seu saldo atual.</p>
                </button>
              </div>
            </div>

            {adjustMode === "transacao" && (
              <div>
                <Label>Descrição (opcional)</Label>
                <Input
                  value={adjustDesc}
                  onChange={(e) => setAdjustDesc(e.target.value)}
                  placeholder="Descrição do ajuste..."
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdjust} disabled={!adjustValue || Math.abs(adjustDiff) < 0.005}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}