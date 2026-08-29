import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { dbToLegalCase, dbToLegalCaseUpdate } from "@/lib/db-mappers";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/companies";
import { LegalCase, LegalCaseStatus, LegalCaseUpdate } from "@/lib/types";
import { WayvoLogo } from "@/components/WayvoLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Scale, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Página do módulo Jurídico — fora do shell principal do app de propósito (sem
// CompanyProvider/DataProvider/AppSidebar): quem acessa aqui como advogado externo
// não tem linha em user_companies, então o resto do app não funcionaria pra ele. Os
// dados vêm direto de legal_cases/legal_case_updates (RLS já filtra o que cada
// usuário pode ver — ver supabase/migrations/20260818120100_add_legal_module.sql),
// nunca do cache global usado pelas outras páginas.

const STATUS_LABELS: Record<LegalCaseStatus, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  sucesso: "Sucesso",
  falha: "Falha",
};

const STATUS_COLORS: Record<LegalCaseStatus, string> = {
  nao_iniciado: "bg-muted text-muted-foreground border-border",
  em_andamento: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  sucesso: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  falha: "bg-destructive/15 text-destructive border-destructive/30",
};

const STATUS_ORDER: LegalCaseStatus[] = ["nao_iniciado", "em_andamento", "sucesso", "falha"];

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR") : "—";

export default function JuridicoPage() {
  const { user, signOut } = useAuth();
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"todos" | LegalCaseStatus>("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LegalCase | null>(null);
  // Quem gerencia mais de uma locadora (staff com várias empresas, ou advogado com
  // acesso a mais de uma via legal_company_access) precisa escolher qual delas está
  // vendo — sem isso, casos de empresas diferentes apareciam misturados na mesma
  // lista/KPIs, já que a RLS de legal_cases libera todas as empresas que o usuário
  // tem acesso, não só a "ativa" (esta página roda fora do CompanyProvider, então
  // não existe uma "empresa ativa" pronta como no resto do app).
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [companyOptions, setCompanyOptions] = useState<{ id: string; nome: string }[]>([]);

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("legal_cases")
      .select("*")
      .order("opened_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar casos: " + error.message);
      setLoading(false);
      return;
    }
    setCases((data || []).map(dbToLegalCase));
    setLoading(false);
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);

  // Lista de locadoras que este usuário administra — via user_companies (staff) e
  // legal_company_access (advogado externo). Importante buscar isso direto, e não
  // derivar dos casos já carregados: uma locadora sem NENHUM caso ainda simplesmente
  // não apareceria como opção, e a tela caía de volta pra mostrar a única locadora
  // que tem caso — mesmo que não fosse a que o usuário estava navegando (bug real
  // reportado: acessar /juridico pela Motovia mostrava um cliente da Loca2Rodas,
  // porque só a Loca2Rodas tinha caso aberto).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: viaStaff }, { data: viaAdvogado }] = await Promise.all([
        supabase.from("user_companies").select("company_id").eq("user_id", user.id),
        supabase.from("legal_company_access").select("company_id").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const ids = Array.from(new Set([
        ...(viaStaff || []).map((r: any) => r.company_id),
        ...(viaAdvogado || []).map((r: any) => r.company_id),
      ]));
      if (ids.length === 0) { setCompanyOptions([]); return; }
      const { data: companiesData } = await supabase.from("companies").select("id, nome").in("id", ids);
      if (cancelled) return;
      const options = (companiesData || [])
        .map((c: any) => ({ id: c.id, nome: c.nome || c.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setCompanyOptions(options);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Escolhe a locadora ativa quando a lista de opções muda: mantém a seleção atual se
  // ainda for válida, senão tenta a "empresa ativa" salva pelo resto do app (mesma
  // localStorage key usada pelo CompanyContext), e só cai pra primeira opção se nem
  // isso bater com nenhum caso deste usuário.
  useEffect(() => {
    if (companyOptions.length === 0) { setSelectedCompanyId(null); return; }
    setSelectedCompanyId(prev => {
      if (prev && companyOptions.some(c => c.id === prev)) return prev;
      const lastActive = getActiveCompanyId();
      if (lastActive && companyOptions.some(c => c.id === lastActive)) return lastActive;
      return companyOptions[0].id;
    });
  }, [companyOptions]);

  const handleSwitchCompany = (id: string) => {
    setSelectedCompanyId(id);
    setActiveCompanyId(id);
  };

  const casesDaEmpresa = useMemo(
    () => cases.filter(c => c.companyId === selectedCompanyId),
    [cases, selectedCompanyId],
  );

  const kpis = useMemo(() => {
    const totalSaldo = casesDaEmpresa.reduce((s, c) => s + c.saldoPendenteSnapshot, 0);
    const totalRecuperado = casesDaEmpresa.reduce((s, c) => s + c.valorRecuperado, 0);
    const totalEmRecuperacao = casesDaEmpresa.reduce((s, c) => s + c.valorEmRecuperacao, 0);
    const taxa = totalSaldo > 0 ? (totalRecuperado / totalSaldo) * 100 : 0;
    const counts: Record<LegalCaseStatus, number> = { nao_iniciado: 0, em_andamento: 0, sucesso: 0, falha: 0 };
    casesDaEmpresa.forEach(c => counts[c.status]++);
    return { totalSaldo, totalRecuperado, totalEmRecuperacao, taxa, counts };
  }, [casesDaEmpresa]);

  const filtered = useMemo(() => {
    let list = casesDaEmpresa;
    if (statusFilter !== "todos") list = list.filter(c => c.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.clienteNome.toLowerCase().includes(q)
        || (c.motoPlaca || "").toLowerCase().includes(q)
        || (c.contratoNumero || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [casesDaEmpresa, statusFilter, search]);

  const handleUpdated = (updated: LegalCase) => {
    setCases(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setSelected(updated);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WayvoLogo variant="light" size={22} />
          <span className="text-sm font-semibold text-muted-foreground border-l pl-2.5 ml-0.5 flex items-center gap-1.5">
            <Scale className="h-4 w-4" /> Jurídico
          </span>
        </div>
        <div className="flex items-center gap-3">
          {companyOptions.length > 1 && (
            <Select value={selectedCompanyId ?? undefined} onValueChange={handleSwitchCompany}>
              <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
                <SelectValue placeholder="Locadora" />
              </SelectTrigger>
              <SelectContent>
                {companyOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {companyOptions.length === 1 && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{companyOptions[0].nome}</span>
          )}
          <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sair
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-border/50 shadow-none">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground font-medium">Taxa de recuperação</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{kpis.taxa.toFixed(1)}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{fmtBRL(kpis.totalRecuperado)} de {fmtBRL(kpis.totalSaldo)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-none">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground font-medium">Valor recuperado</p>
              <p className="text-2xl font-bold text-foreground">{fmtBRL(kpis.totalRecuperado)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-none">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground font-medium">Em recuperação</p>
              <p className="text-2xl font-bold text-foreground">{fmtBRL(kpis.totalEmRecuperacao)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-none">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground font-medium">Saldo em aberto</p>
              <p className="text-2xl font-bold text-foreground">{fmtBRL(Math.max(0, kpis.totalSaldo - kpis.totalRecuperado))}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter("todos")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${statusFilter === "todos" ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
          >
            Todos · {casesDaEmpresa.length}
          </button>
          {STATUS_ORDER.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
            >
              {STATUS_LABELS[s]} · {kpis.counts[s]}
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, placa, contrato…" className="pl-8 h-9" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border rounded-lg bg-background">
            <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="font-medium">Nenhum caso encontrado</p>
          </div>
        ) : (
          <div className="border rounded-lg bg-background divide-y overflow-hidden">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{c.clienteNome}</span>
                    {c.motoPlaca && (
                      <span className="font-mono text-[10px] font-semibold text-foreground/60 bg-muted border border-border/60 rounded px-1.5 py-px tracking-wider">{c.motoPlaca}</span>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.contratoNumero ? `Contrato ${c.contratoNumero} · ` : ""}aberto em {fmtDate(c.openedAt)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{fmtBRL(Math.max(0, c.saldoPendenteSnapshot - c.valorRecuperado))}</p>
                  <p className="text-[11px] text-muted-foreground">em aberto</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <CaseDetailDialog
          legalCase={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          userLabel={user?.email || "Usuário"}
        />
      )}
    </div>
  );
}

function CaseDetailDialog({
  legalCase, onClose, onUpdated, userLabel,
}: {
  legalCase: LegalCase;
  onClose: () => void;
  onUpdated: (c: LegalCase) => void;
  userLabel: string;
}) {
  const [status, setStatus] = useState<LegalCaseStatus>(legalCase.status);
  const [valorRecuperado, setValorRecuperado] = useState(String(legalCase.valorRecuperado));
  const [valorEmRecuperacao, setValorEmRecuperacao] = useState(String(legalCase.valorEmRecuperacao));
  const [saving, setSaving] = useState(false);
  const [updates, setUpdates] = useState<LegalCaseUpdate[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
  const [newUpdate, setNewUpdate] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);

  const loadUpdates = useCallback(async () => {
    setLoadingUpdates(true);
    const { data, error } = await supabase
      .from("legal_case_updates")
      .select("*")
      .eq("case_id", legalCase.id)
      .order("created_at", { ascending: false });
    if (!error) setUpdates((data || []).map(dbToLegalCaseUpdate));
    setLoadingUpdates(false);
  }, [legalCase.id]);

  useEffect(() => { loadUpdates(); }, [loadUpdates]);

  const handleSalvar = async () => {
    const vr = parseFloat(valorRecuperado.replace(",", ".")) || 0;
    const ver = parseFloat(valorEmRecuperacao.replace(",", ".")) || 0;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { status, valor_recuperado: vr, valor_em_recuperacao: ver };
      // Marca quando o caso entra num status final — e limpa se voltar a ficar aberto.
      patch.closed_at = (status === "sucesso" || status === "falha")
        ? (legalCase.closedAt || new Date().toISOString())
        : null;
      const { data, error } = await supabase.from("legal_cases").update(patch).eq("id", legalCase.id).select().single();
      if (error) { toast.error("Erro ao salvar: " + error.message); return; }
      toast.success("Caso atualizado");
      onUpdated(dbToLegalCase(data));
    } finally {
      setSaving(false);
    }
  };

  const handleAddUpdate = async () => {
    if (!newUpdate.trim()) return;
    setPostingUpdate(true);
    try {
      const { data, error } = await supabase
        .from("legal_case_updates")
        .insert({ case_id: legalCase.id, author_label: userLabel, body: newUpdate.trim() })
        .select()
        .single();
      if (error) { toast.error("Erro ao adicionar atualização: " + error.message); return; }
      setUpdates(prev => [dbToLegalCaseUpdate(data), ...prev]);
      setNewUpdate("");
    } finally {
      setPostingUpdate(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{legalCase.clienteNome}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><Label className="text-xs text-muted-foreground">CPF</Label><p>{legalCase.clienteCpf || "—"}</p></div>
          <div><Label className="text-xs text-muted-foreground">Telefone</Label><p>{legalCase.clienteTelefone || "—"}</p></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">Endereço</Label><p>{legalCase.clienteEndereco || "—"}</p></div>
          <div><Label className="text-xs text-muted-foreground">Contrato</Label><p>{legalCase.contratoNumero || "—"}</p></div>
          <div><Label className="text-xs text-muted-foreground">Moto</Label><p>{legalCase.motoPlaca || "—"}{legalCase.motoModelo ? ` · ${legalCase.motoModelo}` : ""}</p></div>
          <div><Label className="text-xs text-muted-foreground">Início do contrato</Label><p>{fmtDate(legalCase.dataInicioContrato)}</p></div>
          <div><Label className="text-xs text-muted-foreground">Fim do contrato</Label><p>{fmtDate(legalCase.dataFimContrato)}</p></div>
        </div>

        {legalCase.detalhePendencias.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cobranças que compõem o saldo</Label>
            <div className="border rounded-md divide-y text-sm">
              {legalCase.detalhePendencias.map((p, i) => (
                <div key={i} className="flex justify-between px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">{p.descricao}{p.vencimento ? ` · venc. ${fmtDate(p.vencimento)}` : ""}</span>
                  <span className="font-semibold">{fmtBRL(p.valor)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-1.5 text-xs font-bold bg-muted/30">
                <span>Saldo pendente (na abertura do caso)</span>
                <span>{fmtBRL(legalCase.saldoPendenteSnapshot)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LegalCaseStatus)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor recuperado</Label>
            <Input type="number" value={valorRecuperado} onChange={e => setValorRecuperado(e.target.value)} step="0.01" min={0} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor em recuperação</Label>
            <Input type="number" value={valorEmRecuperacao} onChange={e => setValorEmRecuperacao(e.target.value)} step="0.01" min={0} />
          </div>
        </div>
        <Button onClick={handleSalvar} disabled={saving} size="sm" className="w-fit">
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>

        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs text-muted-foreground">Atualizações</Label>
          <Textarea
            value={newUpdate}
            onChange={e => setNewUpdate(e.target.value)}
            placeholder="Escreva uma atualização sobre o andamento do caso…"
            className="text-sm min-h-[60px]"
          />
          <Button size="sm" variant="outline" onClick={handleAddUpdate} disabled={postingUpdate || !newUpdate.trim()}>
            {postingUpdate ? "Enviando…" : "Adicionar atualização"}
          </Button>
          <div className="space-y-2 max-h-64 overflow-y-auto pt-1">
            {loadingUpdates ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : updates.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma atualização registrada ainda.</p>
            ) : updates.map(u => (
              <div key={u.id} className="border rounded-md p-2.5 text-sm bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{u.authorLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(u.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <p className="whitespace-pre-wrap text-xs">{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
