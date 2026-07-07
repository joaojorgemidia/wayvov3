import { useState, useMemo, useEffect, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";
import { localToday } from "@/lib/utils";
import { Fine, Rental, FinancialEntry } from "@/lib/types";
import { saveFines, saveFinancial, loadFinancial } from "@/lib/store";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, AlertTriangle, Pencil, Trash2, RefreshCw, Car, Loader2, CheckCircle2, XCircle, Info, Settings, ShieldCheck, Upload, ScanLine } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import DetranConfigDialog from "@/components/DetranConfigDialog";
import { DetranConfig } from "@/lib/companies";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const statusLabel: Record<string, string> = { pendente: "Pendente", paga: "Paga", contestada: "Contestada", transferida: "Transferida" };
const statusColor: Record<string, string> = { pendente: "bg-warning/10 text-warning", paga: "bg-success/10 text-success", contestada: "bg-primary/10 text-primary", transferida: "bg-muted text-muted-foreground" };

const categoriaLabel: Record<string, string> = {
  vencida: "Vencida",
  nao_vencida: "A vencer",
  notificada: "Notificada",
  nao_notificada: "Não notificada",
  sob_juros: "Sob juros",
  parcelada: "Parcelada",
  sne: "SNE",
};

const emptyFine = (): Fine => ({
  id: crypto.randomUUID(), motoId: "", clienteId: null, rentalId: null,
  dataMulta: localToday(), dataVencimento: null, dataNotificacao: null,
  valor: 0, descricao: "", status: "pendente", responsavel: "cliente",
  origem: "manual", autoInfracao: null, codigoInfracao: null, numeroRenainf: null,
  orgaoCompetencia: null, horaInfracao: null, localInfracao: null,
});

// ─── Types for DETRAN results ──────────────────────────────────────────────────
interface DetranInfracao {
  categoria: string;
  auto_infracao: string | null;
  data_infracao: string | null;
  data_vencimento: string | null;
  data_notificacao: string | null;
  valor: number;
  valor_desconto: number;
  descricao: string;
  orgao_atuador: string;
  grupo: string;
  situacao: string;
  responsavel_infracao: string;
}

interface MotoResult {
  motoId: string;
  placa: string;
  data: DetranInfracao[];
  error: string | null;
  loading: boolean;
}

interface SelectableInfracao extends DetranInfracao {
  _key: string;
  motoId: string;
  placa: string;
  suggestedRental: Rental | null;
  alreadyImported: boolean;
}

// ─── Rental matcher ────────────────────────────────────────────────────────────
function findRentalAtDate(motoId: string, dateIso: string | null, rentals: Rental[]): Rental | null {
  if (!dateIso) return null;
  const ts = new Date(dateIso + "T00:00:00").getTime();
  return rentals.find((r) => {
    if (r.motoId !== motoId) return false;
    const inicio = new Date(r.dataInicio + "T00:00:00").getTime();
    const fim = r.dataFim ? new Date(r.dataFim + "T00:00:00").getTime() : Date.now();
    return ts >= inicio && ts <= fim;
  }) ?? null;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function MultasPage() {
  const cache = useDataCacheSnapshot();
  const { activeCompany, updateDetranConfig } = useCompany();
  const [detranConfigOpen, setDetranConfigOpen] = useState(false);
  const [fines, setFines] = useState<Fine[]>([]);
  const motos = cache.motos;
  const clients = cache.clients;
  const rentals = cache.rentals as Rental[];
  useEffect(() => { setFines(cache.fines); }, [cache.fines]);

  const detranConfigurado = !!activeCompany?.detranConfig?.login;

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Fine>(emptyFine());
  const [valorStr, setValorStr] = useState("");
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [extracting, setExtracting] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [gerarEntrada, setGerarEntrada] = useState(true);
  const [naoGerarSaida, setNaoGerarSaida] = useState(false);

  // DETRAN sheet state
  const [detranOpen, setDetranOpen] = useState(false);
  const [selectedMotoIds, setSelectedMotoIds] = useState<Set<string>>(new Set());
  const [motoResults, setMotoResults] = useState<MotoResult[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const { canCreate, canEdit, canDelete } = usePermissions();
  const persist = (d: Fine[]) => { setFines(d); saveFines(d); };
  const getMotoPlaca = (id: string) => motos.find(m => m.id === id)?.placa || "—";
  const getClientName = (id: string | null) => id ? (clients.find(c => c.id === id)?.nome || "—") : "—";

  const filtered = useMemo(() => fines.filter(f =>
    getMotoPlaca(f.motoId).toLowerCase().includes(search.toLowerCase()) ||
    f.descricao.toLowerCase().includes(search.toLowerCase())
  ), [fines, search, motos]);

  const handleSave = async () => {
    if (!form.motoId) return;
    const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", ".")) || 0;
    const responsavel: Fine["responsavel"] = gerarEntrada ? "cliente" : "locadora";
    const finalForm = { ...form, valor, responsavel };
    const isNew = !fines.find(f => f.id === form.id);

    if (isNew) persist([...fines, finalForm]);
    else persist(fines.map(f => f.id === form.id ? finalForm : f));

    const gerarSaida = !naoGerarSaida;
    const deveGerarFinanceiro = isNew && valor > 0 && finalForm.dataVencimento && (gerarEntrada || gerarSaida);

    if (deveGerarFinanceiro) {
      const moto = motos.find(m => m.id === finalForm.motoId);
      const client = finalForm.clienteId ? clients.find(c => c.id === finalForm.clienteId) : null;
      const placa = moto?.placa || finalForm.motoId;
      const dataMultaFmt = finalForm.dataMulta
        ? finalForm.dataMulta.split("-").reverse().join("/")
        : null;
      const partes = [
        dataMultaFmt ? `Cometimento: ${dataMultaFmt}` : null,
        finalForm.autoInfracao ? `Auto: ${finalForm.autoInfracao}` : null,
        finalForm.descricao || null,
        finalForm.codigoInfracao ? `Cód: ${finalForm.codigoInfracao}` : null,
        finalForm.numeroRenainf ? `RENAINF: ${finalForm.numeroRenainf}` : null,
        finalForm.orgaoCompetencia ? `Órgão: ${finalForm.orgaoCompetencia}` : null,
      ].filter(Boolean).join(" | ");
      const descricao = `Multa — ${placa}${partes ? ` | ${partes}` : ""}`;

      const hoje = localToday();
      const baseComum: Partial<FinancialEntry> = {
        motoId: finalForm.motoId, rentalId: finalForm.rentalId,
        clienteId: finalForm.clienteId, clienteNome: client?.nome || "",
        placa, natureza: "operacional", conta: "", tags: ["multa"],
        recorrente: false, fixedOriginId: finalForm.id,
        descricao, observacao: partes || undefined,
      };

      const newEntries: FinancialEntry[] = [];

      if (gerarEntrada) {
        newEntries.push({
          ...(baseComum as FinancialEntry),
          id: crypto.randomUUID(), tipo: "receita",
          categoria: "multa_transito_receita", subcategoria: "Repasse de multa",
          data: hoje, dataPrevista: hoje,
          valor, pago: false,
        });
      }

      if (gerarSaida) {
        newEntries.push({
          ...(baseComum as FinancialEntry),
          id: crypto.randomUUID(), tipo: "despesa",
          categoria: "multa_transito",
          subcategoria: gerarEntrada ? "Repasse cliente" : "Locadora",
          data: finalForm.dataVencimento!, dataPrevista: finalForm.dataVencimento!,
          valor, pago: false,
        });
      }

      try {
        await saveFinancial([...loadFinancial(), ...newEntries]);
        const partes_msg = [gerarEntrada && "entrada", gerarSaida && "saída"].filter(Boolean).join(" e ");
        toast.success(`Multa salva. ${partes_msg ? `Gerado no financeiro: ${partes_msg}.` : ""}`);
      } catch {
        toast.error("Multa salva, mas erro ao gerar lançamentos financeiros.");
      }
    } else {
      toast.success("Multa salva!");
    }

    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Remover esta multa?")) persist(fines.filter(f => f.id !== id));
  };

  const handleMultaUpload = async (file: File) => {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Envie uma imagem (JPG, PNG, WEBP) ou PDF da multa.");
      return;
    }
    setExtracting(true);
    try {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      const { data, error } = await supabase.functions.invoke("extract-multa", {
        body: { fileBase64: base64, mimeType: file.type },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na leitura");
      const d = data.data;

      // Resolve moto pela placa extraída
      let motoId = form.motoId;
      let clienteId = form.clienteId;
      let rentalId = form.rentalId;
      if (d.placa) {
        const placa = String(d.placa).replace(/[-\s]/g, "").toUpperCase();
        const moto = motos.find(m => m.placa.replace(/[-\s]/g, "").toUpperCase() === placa);
        if (moto) {
          motoId = moto.id;
          const dataRef = d.dataMulta ? String(d.dataMulta) : form.dataMulta;
          const rental = findRentalAtDate(moto.id, dataRef, rentals);
          if (rental) { clienteId = rental.clienteId; rentalId = rental.id; }
        }
      }

      const novoValor = typeof d.valor === "number" ? d.valor : form.valor;
      setValorStr(novoValor > 0 ? String(novoValor).replace(".", ",") : valorStr);
      setForm(prev => ({
        ...prev,
        motoId: motoId || prev.motoId,
        clienteId: clienteId ?? prev.clienteId,
        rentalId: rentalId ?? prev.rentalId,
        dataMulta: d.dataMulta ? String(d.dataMulta) : prev.dataMulta,
        dataVencimento: d.dataVencimento ? String(d.dataVencimento) : prev.dataVencimento,
        valor: novoValor || prev.valor,
        autoInfracao: d.autoInfracao ? String(d.autoInfracao) : prev.autoInfracao,
        codigoInfracao: d.codigoInfracao ? String(d.codigoInfracao) : prev.codigoInfracao,
        numeroRenainf: d.numeroRenainf ? String(d.numeroRenainf) : prev.numeroRenainf,
        descricao: d.descricao ? String(d.descricao) : prev.descricao,
        orgaoCompetencia: d.orgaoCompetencia ? String(d.orgaoCompetencia) : prev.orgaoCompetencia,
        horaInfracao: d.horaInfracao ? String(d.horaInfracao) : prev.horaInfracao,
        localInfracao: d.localInfracao ? String(d.localInfracao) : prev.localInfracao,
      }));
      toast.success("Dados da multa extraídos com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao ler a multa");
    } finally {
      setExtracting(false);
    }
  };

  const totalPendente = fines.filter(f => f.status === "pendente").reduce((s, f) => s + f.valor, 0);

  // ─── DETRAN logic ────────────────────────────────────────────────────────────

  const frotaAtiva = useMemo(
    () => motos.filter(m => m.status !== "vendida" && m.status !== "inativa"),
    [motos],
  );

  const openDetran = () => {
    setDetranOpen(true);
    setSelectedMotoIds(new Set(frotaAtiva.map(m => m.id)));
    setMotoResults([]);
    setHasQueried(false);
    setSelected(new Set());
  };

  const toggleMoto = (id: string) => {
    setSelectedMotoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConsultar = useCallback(async () => {
    const ids = [...selectedMotoIds];
    if (ids.length === 0) { toast.warning("Selecione ao menos uma moto."); return; }

    setMotoResults(ids.map(id => ({
      motoId: id,
      placa: motos.find(m => m.id === id)?.placa ?? id,
      data: [], error: null, loading: true,
    })));
    setHasQueried(true);
    setSelected(new Set());

    const { data, error } = await supabase.functions.invoke("detran-go-debitos", {
      body: { motoIds: ids, companyId: activeCompany?.id },
    });

    if (error) {
      toast.error("Falha ao consultar DETRAN: " + error.message);
      setMotoResults(prev => prev.map(r => ({ ...r, loading: false, error: error.message })));
      return;
    }

    const results: Array<{ motoId: string; placa: string; data: DetranInfracao[]; error: string | null }> =
      data?.results ?? [];

    setMotoResults(results.map(r => ({
      motoId: r.motoId,
      placa: r.placa,
      loading: false,
      error: r.error,
      data: r.data ?? [],
    })));
  }, [selectedMotoIds, motos, activeCompany]);

  // Flatten all infracoes into selectable rows
  const allInfracoes = useMemo<SelectableInfracao[]>(() => {
    const importedAits = new Set(fines.filter(f => f.autoInfracao).map(f => f.autoInfracao!));
    return motoResults.flatMap(mr =>
      mr.data.map((d, i) => {
        const key = `${mr.motoId}::${d.auto_infracao || d.data_infracao || i}`;
        const rental = findRentalAtDate(mr.motoId, d.data_infracao, rentals);
        return {
          ...d,
          _key: key,
          motoId: mr.motoId,
          placa: mr.placa,
          suggestedRental: rental,
          alreadyImported: d.auto_infracao ? importedAits.has(d.auto_infracao) : false,
        };
      }),
    );
  }, [motoResults, fines, rentals]);

  const toggleInfracao = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      allInfracoes.filter(d => !d.alreadyImported).forEach(d => next.add(d._key));
      return next;
    });
  };

  const handleImport = async () => {
    const toImport = allInfracoes.filter(d => selected.has(d._key) && !d.alreadyImported);
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      const today = localToday();
      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

      const newFines: Fine[] = toImport
        .filter(d => d.valor > 0 && d.valor < 1_000_000 && motos.find(m => m.id === d.motoId))
        .map(d => {
          const rental = d.suggestedRental;
          const client = rental ? clients.find(c => c.id === rental.clienteId) ?? null : null;
          const dataMulta = d.data_infracao && ISO_DATE.test(d.data_infracao) ? d.data_infracao
            : d.data_vencimento && ISO_DATE.test(d.data_vencimento) ? d.data_vencimento
            : today;
          // CONDUTOR = cliente que estava usando; PROPRIETARIO = locadora
          const responsavel: "locadora" | "cliente" =
            d.responsavel_infracao === "CONDUTOR" && client ? "cliente" : "locadora";

          return {
            id: crypto.randomUUID(),
            motoId: d.motoId,
            clienteId: client?.id ?? null,
            rentalId: rental?.id ?? null,
            dataMulta,
            dataNotificacao: d.data_notificacao && ISO_DATE.test(d.data_notificacao) ? d.data_notificacao : null,
            valor: d.valor,
            descricao: d.descricao,
            status: "pendente" as const,
            responsavel,
            origem: "detran" as const,
            autoInfracao: d.auto_infracao,
            codigoInfracao: null,
          };
        });

      persist([...fines, ...newFines]);
      toast.success(`${newFines.length} multa(s) importada(s) com sucesso.`);
      setDetranOpen(false);
    } finally {
      setImporting(false);
    }
  };

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (iso: string | null) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Multas</h2>
          <p className="text-sm text-muted-foreground">{fines.length} multas · R$ {totalPendente.toFixed(2)} pendente</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openDetran} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Consultar DETRAN-GO
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDetranConfigOpen(true)}
                title={detranConfigurado ? "Editar credenciais DETRAN-GO" : "Configurar DETRAN-GO"}
                className={detranConfigurado ? "text-blue-600 hover:text-blue-700" : "text-muted-foreground"}
              >
                {detranConfigurado ? <ShieldCheck className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
              </Button>
            </div>
          )}
          {canCreate && (
            <Button onClick={() => { setForm(emptyFine()); setValorStr(""); setGerarEntrada(true); setNaoGerarSaida(false); setMode("add"); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Multa
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar placa ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma multa registrada</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Moto</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Cliente</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Data</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Valor</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Responsável</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-3 text-right font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 font-mono font-bold">
                      {getMotoPlaca(f.motoId)}
                      {f.origem === "detran" && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">DETRAN</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">{getClientName(f.clienteId)}</td>
                    <td className="px-3 py-3">{new Date(f.dataMulta + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-3 font-semibold">{fmt(f.valor)}</td>
                    <td className="px-3 py-3 text-muted-foreground max-w-[200px] truncate">{f.descricao || "—"}</td>
                    <td className="px-3 py-3">
                      <Badge variant={f.responsavel === "cliente" ? "default" : "secondary"}>
                        {f.responsavel === "cliente" ? "Cliente" : "Locadora"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[f.status]}`}>{statusLabel[f.status]}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => { setForm({ ...f }); setValorStr(f.valor ? String(f.valor).replace(".", ",") : ""); setGerarEntrada(f.responsavel === "cliente"); setNaoGerarSaida(false); setMode("edit"); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                        {canDelete && <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Formulário manual ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Nova Multa" : "Editar Multa"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* 0. Zona de upload OCR */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              } ${extracting ? "pointer-events-none opacity-60" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                setIsDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleMultaUpload(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleMultaUpload(file);
                }}
              />
              {extracting ? (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-[12px] text-muted-foreground">Lendo multa...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <ScanLine className="h-5 w-5 text-muted-foreground/60" />
                  <p className="text-[12px] font-medium text-foreground">Anexar print ou PDF da multa</p>
                  <p className="text-[10px] text-muted-foreground">O sistema preenche os campos automaticamente · JPG, PNG, PDF</p>
                </div>
              )}
            </div>

            {/* 1. Placa + Data — preenchidos primeiro para identificar o locatário */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Moto (placa)</Label>
                <SearchableSelect
                  options={motos.map(m => ({ value: m.id, label: m.placa }))}
                  value={form.motoId}
                  onValueChange={v => {
                    const rental = form.dataMulta ? findRentalAtDate(v, form.dataMulta, rentals) : null;
                    setForm({ ...form, motoId: v, clienteId: rental?.clienteId ?? null, rentalId: rental?.id ?? null });
                  }}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar placa..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Data da Multa</Label>
                <Input
                  type="date"
                  value={form.dataMulta}
                  onChange={e => {
                    const d = e.target.value;
                    const rental = form.motoId ? findRentalAtDate(form.motoId, d, rentals) : null;
                    setForm({ ...form, dataMulta: d, clienteId: rental?.clienteId ?? null, rentalId: rental?.id ?? null });
                  }}
                />
              </div>
            </div>
            {/* 2. Cliente — auto-identificado pela placa + data, mas editável */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                Locatário na data
                {form.motoId && form.dataMulta && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {form.clienteId ? "· identificado automaticamente" : "· nenhuma locação ativa nessa data"}
                  </span>
                )}
              </Label>
              <SearchableSelect
                options={[{ value: "none", label: "Nenhum" }, ...clients.map(c => ({ value: c.id, label: c.nome }))]}
                value={form.clienteId || "none"}
                onValueChange={v => setForm({ ...form, clienteId: v === "none" ? null : v })}
                placeholder="Nenhum"
                searchPlaceholder="Buscar cliente..."
              />
            </div>
            {/* 3. Valor */}
            <div className="grid gap-2">
              <Label>Valor</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span>
                <Input
                  className="pl-8"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorStr}
                  onChange={e => {
                    const raw = e.target.value;
                    setValorStr(raw);
                    const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
                    setForm({ ...form, valor: isNaN(n) ? 0 : n });
                  }}
                />
              </div>
            </div>
            {/* 3b. Checkboxes financeiro */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox
                  checked={naoGerarSaida}
                  onCheckedChange={v => setNaoGerarSaida(!!v)}
                />
                <span className="text-sm">Não gerar saída no financeiro.</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <Checkbox
                  checked={gerarEntrada}
                  onCheckedChange={v => setGerarEntrada(!!v)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-tight">
                  Gerar entrada no financeiro
                  <span className="block text-[11px] text-muted-foreground">(será pago pelo locatário)</span>
                </span>
              </label>
            </div>
            {/* 4. Status + Data Vencimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Status</Label>
                <SearchableSelect
                  options={Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v }))}
                  value={form.status}
                  onValueChange={v => setForm({ ...form, status: v as Fine["status"] })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.dataVencimento || ""} onChange={e => setForm({ ...form, dataVencimento: e.target.value || null })} />
              </div>
            </div>
            {/* 5. Nº RENAINF + Código da Infração + Auto da Infração */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Nº RENAINF</Label>
                <Input
                  value={form.numeroRenainf || ""}
                  onChange={e => setForm({ ...form, numeroRenainf: e.target.value || null })}
                  placeholder="000000000"
                />
              </div>
              <div className="grid gap-2">
                <Label>Código da infração</Label>
                <Input
                  value={form.codigoInfracao || ""}
                  onChange={e => setForm({ ...form, codigoInfracao: e.target.value || null })}
                  placeholder="Ex: 74550"
                />
              </div>
              <div className="grid gap-2">
                <Label>Auto da infração</Label>
                <Input
                  value={form.autoInfracao || ""}
                  onChange={e => setForm({ ...form, autoInfracao: e.target.value || null })}
                  placeholder="Ex: AA123456"
                />
              </div>
            </div>
            {/* 6. Descrição da infração */}
            <div className="grid gap-2">
              <Label>Descrição da infração</Label>
              <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Transitar velocidade superior máx permitida" />
            </div>
            {/* 7. Órgão competência + Hora */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2 col-span-2">
                <Label>Órgão competência</Label>
                <Input
                  value={form.orgaoCompetencia || ""}
                  onChange={e => setForm({ ...form, orgaoCompetencia: e.target.value || null })}
                  placeholder="Ex: PREF. DE: GO – SENADOR CANEDO"
                />
              </div>
              <div className="grid gap-2">
                <Label>Hora da infração</Label>
                <Input
                  value={form.horaInfracao || ""}
                  onChange={e => setForm({ ...form, horaInfracao: e.target.value || null })}
                  placeholder="12:33"
                />
              </div>
            </div>
            {/* 8. Local da infração */}
            <div className="grid gap-2">
              <Label>Local da infração</Label>
              <Input
                value={form.localInfracao || ""}
                onChange={e => setForm({ ...form, localInfracao: e.target.value || null })}
                placeholder="Ex: Av. Anuar Auad x Rua 36, Sentido bairro residencial..."
              />
            </div>
            {/* Info sobre lançamentos automáticos */}
            {mode === "add" && form.dataVencimento && (gerarEntrada || !naoGerarSaida) && (
              <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-snug">
                {gerarEntrada && !naoGerarSaida
                  ? "Ao salvar: será gerada uma entrada (cobrança ao locatário) e uma saída (despesa no vencimento)."
                  : gerarEntrada
                  ? "Ao salvar: será gerada apenas uma entrada (cobrança ao locatário)."
                  : "Ao salvar: será gerada apenas uma saída (despesa no vencimento)."}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Config DETRAN ────────────────────────────────────────────────────── */}
      <DetranConfigDialog
        open={detranConfigOpen}
        onClose={() => setDetranConfigOpen(false)}
        onSave={async (config: DetranConfig | null) => {
          await updateDetranConfig(activeCompany.id, config);
          if (config) toast.success("DETRAN-GO conectado com sucesso.");
          else toast.success("Integração DETRAN removida.");
        }}
        current={activeCompany?.detranConfig}
        companyName={activeCompany?.nome}
      />

      {/* ── Sheet DETRAN ─────────────────────────────────────────────────────── */}
      <Sheet open={detranOpen} onOpenChange={setDetranOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" /> Consultar DETRAN-GO
            </SheetTitle>
            <p className="text-sm text-muted-foreground">Busca multas e débitos diretamente no portal do DETRAN-GO via Infosimples.</p>
          </SheetHeader>

          {/* Banner: não configurado */}
          {!detranConfigurado && (
            <div className="mx-6 mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="text-sm font-semibold text-yellow-900">Credenciais DETRAN-GO não configuradas</p>
                <p className="text-xs text-yellow-700">Informe o login e senha do portal GOV.BR / DETRAN-GO nas configurações.</p>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                  onClick={() => { setDetranOpen(false); setDetranConfigOpen(true); }}
                >
                  <Settings className="h-3.5 w-3.5 mr-1.5" /> Configurar DETRAN-GO
                </Button>
              </div>
            </div>
          )}

          {/* Seleção de motos */}
          <div className="px-6 py-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Motos a consultar</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedMotoIds(new Set(frotaAtiva.map(m => m.id)))}>Todas</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedMotoIds(new Set())}>Nenhuma</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {frotaAtiva.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMoto(m.id)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border transition-colors ${
                    selectedMotoIds.has(m.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-muted-foreground/30"
                  }`}
                >
                  {m.placa}
                </button>
              ))}
            </div>
            <Button
              onClick={handleConsultar}
              disabled={!detranConfigurado || selectedMotoIds.size === 0 || motoResults.some(r => r.loading)}
              className="gap-2"
            >
              {motoResults.some(r => r.loading) ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Consultando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Consultar {selectedMotoIds.size > 0 ? `(${selectedMotoIds.size})` : ""}</>
              )}
            </Button>
          </div>

          {/* Status por moto */}
          {hasQueried && motoResults.length > 0 && (
            <div className="px-6 py-3 border-b flex flex-wrap gap-2">
              {motoResults.map(r => (
                <span
                  key={r.motoId}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono ${
                    r.loading ? "border-muted-foreground/30 text-muted-foreground"
                    : r.error ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-success/30 bg-success/10 text-success"
                  }`}
                >
                  {r.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : r.error ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {r.placa} {!r.loading && !r.error && `(${r.data.length})`}
                </span>
              ))}
            </div>
          )}

          {/* Resultados */}
          <div className="flex-1 px-6 py-4 space-y-2 overflow-y-auto">
            {!hasQueried && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                <RefreshCw className="h-10 w-10 opacity-30" />
                <p className="text-sm">Selecione as motos e clique em <strong>Consultar</strong> para buscar multas no DETRAN-GO.</p>
              </div>
            )}

            {allInfracoes.length > 0 && (
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-semibold">{allInfracoes.length} multa(s) encontrada(s)</span>
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                  Selecionar todas
                </Button>
              </div>
            )}

            {allInfracoes.map(d => (
              <InfracaoCard
                key={d._key}
                infracao={d}
                checked={selected.has(d._key)}
                onToggle={() => toggleInfracao(d._key)}
                fmt={fmt}
                fmtDate={fmtDate}
                clientName={d.suggestedRental ? clients.find(c => c.id === d.suggestedRental!.clienteId)?.nome ?? null : null}
              />
            ))}

            {motoResults.filter(r => r.error).map(r => (
              <div key={r.motoId} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>{r.placa}:</strong> {r.error}</span>
              </div>
            ))}

            {hasQueried && !motoResults.some(r => r.loading) && allInfracoes.length === 0 && motoResults.every(r => !r.error) && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
                <CheckCircle2 className="h-8 w-8 text-success opacity-60" />
                <p className="text-sm">Nenhuma multa pendente encontrada.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {selected.size > 0 && (
            <div className="px-6 py-4 border-t flex items-center justify-between bg-background">
              <span className="text-sm text-muted-foreground">{selected.size} multa(s) selecionada(s)</span>
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Importar selecionadas
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Card de infração ─────────────────────────────────────────────────────────
function InfracaoCard({
  infracao, checked, onToggle, fmt, fmtDate, clientName,
}: {
  infracao: SelectableInfracao;
  checked: boolean;
  onToggle: () => void;
  fmt: (v: number) => string;
  fmtDate: (iso: string | null) => string;
  clientName: string | null;
}) {
  const grupoColor: Record<string, string> = {
    GRAVE: "bg-red-100 text-red-700",
    GRAVISSIMA: "bg-red-200 text-red-800",
    MEDIA: "bg-yellow-100 text-yellow-700",
    LEVE: "bg-blue-100 text-blue-700",
  };

  return (
    <div
      className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
        infracao.alreadyImported ? "opacity-50 bg-muted/30 cursor-default"
        : checked ? "border-primary/40 bg-primary/5 cursor-pointer"
        : "hover:bg-muted/30 cursor-pointer"
      }`}
      onClick={() => !infracao.alreadyImported && onToggle()}
    >
      <Checkbox
        checked={checked}
        disabled={infracao.alreadyImported}
        onCheckedChange={() => !infracao.alreadyImported && onToggle()}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-sm">{infracao.placa}</span>
          {infracao.grupo && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${grupoColor[infracao.grupo.toUpperCase()] ?? "bg-muted text-muted-foreground"}`}>
              {infracao.grupo}
            </span>
          )}
          {infracao.categoria && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {categoriaLabel[infracao.categoria] ?? infracao.categoria}
            </Badge>
          )}
          {infracao.alreadyImported && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Já importada</Badge>}
          <span className="font-semibold text-sm ml-auto">{fmt(infracao.valor)}</span>
        </div>
        <p className="text-xs text-foreground/80 leading-tight">{infracao.descricao}</p>
        {infracao.orgao_atuador && (
          <p className="text-xs text-muted-foreground">{infracao.orgao_atuador}</p>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
          {infracao.data_infracao && <span>Infração: {fmtDate(infracao.data_infracao)}</span>}
          {infracao.data_vencimento && <span>Vencimento: {fmtDate(infracao.data_vencimento)}</span>}
          {infracao.valor_desconto > 0 && infracao.valor_desconto < infracao.valor && (
            <span className="text-green-600">Com desconto: {fmt(infracao.valor_desconto)}</span>
          )}
        </div>
        {clientName && (
          <div className="flex items-center gap-1 text-xs text-primary font-medium">
            <Info className="h-3 w-3" />
            Locatário na data: <strong>{clientName}</strong>
            {infracao.responsavel_infracao === "CONDUTOR" ? " — responsável (condutor)" : " — locadora é responsável (proprietário)"}
          </div>
        )}
      </div>
    </div>
  );
}
