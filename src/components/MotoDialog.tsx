import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Motorcycle } from "@/lib/types";
import { loadRastreadores, saveRastreadores, loadFinancial, saveFinancial, loadMotos } from "@/lib/store";
import { getDataCache } from "@/lib/data-cache";
import { InfoTooltip } from "@/components/InfoTooltip";
import { FileText, Upload, Bike, DollarSign, Check, ChevronLeft, ChevronRight, AlertCircle, Settings2, Plus, Pencil, Trash2, CheckCircle2, Circle, Loader2, AlertTriangle, Download, TrendingUp, Wallet, Target, Sparkles, Calendar, Repeat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arrayBufferToBase64, downloadStoredFile } from "@/lib/file-data";
import { uploadDocument, downloadDocument, buildCrlvPath } from "@/lib/document-storage";
import { useCompany } from "@/contexts/CompanyContext";
import { maskCurrency, parseBRL, maskKm, parseKm, formatBRL } from "@/lib/masks";
import { computeFinancingPaidExtra } from "@/lib/moto-financing";

interface MotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moto: Motorcycle | null;
  onSave: (moto: Motorcycle) => void;
  mode: "add" | "edit";
}

const STEPS = [
  { id: 1, label: "Documento", icon: FileText, description: "CRLV da moto" },
  { id: 2, label: "Veículo", icon: Bike, description: "Dados do veículo" },
  { id: 3, label: "Financeiro", icon: DollarSign, description: "Valores e patrimônio" },
];

const emptyMoto = (): Motorcycle => ({
  id: crypto.randomUUID(),
  placa: "",
  modelo: "",
  anoModelo: null,
  cor: "",
  chassi: "",
  renavam: "",
  numMotor: "",
  aplicativo: "",
  tipo: "propria",
  ultimaVistoria: null,
  ultimaTrocaOleo: null,
  kmTrocaOleo: null,
  kmAtual: null,
  historicoOleo: [],
  status: "disponivel",
  valorCompra: null,
  dataCompra: null,
  valorFipe: null,
  dataFipe: null,
  lucroOperacional: null,
  decisao: null,
  crlvPdfName: null,
  crlvPdfData: null,
  crlvStoragePath: null,
  dataVenda: null,
  valorVenda: null,
  kmVenda: null,
  kmCompra: null,
  formaCompra: "vista",
  valorEntrada: null,
  numParcelas: null,
  valorParcela: null,
  parcelasPagas: null,
  diaVencimento: null,
});

// --- Validation ---
type FieldErrors = Record<string, string>;

function validatePlaca(v: string): string | null {
  if (!v.trim()) return "Placa é obrigatória";
  const mercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/;
  const antigo = /^[A-Z]{3}\d{4}$/;
  if (!mercosul.test(v) && !antigo.test(v)) return "Formato inválido (ex: ABC1D23 ou ABC1234)";
  return null;
}

function validateStep2(form: Motorcycle): FieldErrors {
  const e: FieldErrors = {};
  const placaErr = validatePlaca(form.placa);
  if (placaErr) e.placa = placaErr;
  if (!form.modelo.trim()) e.modelo = "Modelo é obrigatório";
  if (form.anoModelo == null) e.anoModelo = "Ano é obrigatório";
  else if (form.anoModelo < 1950 || form.anoModelo > new Date().getFullYear() + 2) e.anoModelo = "Ano inválido";
  if (!form.cor.trim()) e.cor = "Cor é obrigatória";
  if (!form.chassi.trim()) e.chassi = "Chassi é obrigatório";
  else if (form.chassi.length !== 17) e.chassi = "Chassi deve ter 17 caracteres";
  if (!form.renavam.trim()) e.renavam = "Renavam é obrigatório";
  else if (form.renavam.length !== 11) e.renavam = "Renavam deve ter 11 dígitos";
  if (!form.numMotor.trim()) e.numMotor = "Nº Motor é obrigatório";
  if (!form.aplicativo.trim()) e.aplicativo = "Rastreador é obrigatório";
  return e;
}

function validateStep3(form: Motorcycle): FieldErrors {
  const e: FieldErrors = {};
  if (form.valorCompra == null || form.valorCompra <= 0) e.valorCompra = "Valor de compra obrigatório e > 0";
  if (!form.dataCompra) e.dataCompra = "Data de compra obrigatória";
  if (form.kmCompra == null || form.kmCompra < 0) e.kmCompra = "KM na compra é obrigatório";
  return e;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[11px] text-destructive mt-0.5">{msg}</p>;
}

// --- Normalize for duplicate check ---
function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function isSimilar(a: string, b: string) {
  return normalize(a) === normalize(b);
}

// --- Rastreador Manager Dialog ---
function RastreadorManagerDialog({
  open, onOpenChange, items, onAdd, onRemove, onRename,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; onRename: (old: string, next: string) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string>("__blank__");
  const [duplicateWarning, setDuplicateWarning] = useState("");

  const checkDuplicate = (value: string, exclude?: string): string | null => {
    const match = items.find(i => i !== exclude && isSimilar(i, value));
    return match || null;
  };

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    const dup = checkDuplicate(trimmed);
    if (dup) { setDuplicateWarning(`Já existe: "${dup}"`); return; }
    onAdd(trimmed);
    setNewItem("");
    setDuplicateWarning("");
  };

  const handleRename = (old: string, next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === old) { setEditingIdx(null); return; }
    const dup = checkDuplicate(trimmed, old);
    if (dup) { setDuplicateWarning(`Já existe: "${dup}"`); return; }
    onRename(old, trimmed);
    setEditingIdx(null);
    setDuplicateWarning("");
  };

  const confirmDelete = () => {
    if (!deletingItem) return;
    if (redirectTo === "__blank__") onRemove(deletingItem);
    else onRename(deletingItem, redirectTo);
    setDeletingItem(null);
    setRedirectTo("__blank__");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setDuplicateWarning(""); setDeletingItem(null); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" />Gerenciar Rastreadores</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Ao remover ou renomear, as motos vinculadas serão atualizadas.
        </p>

        {duplicateWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5 text-xs text-yellow-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {duplicateWarning}
          </div>
        )}

        {deletingItem && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Remover "<span className="text-destructive font-semibold">{deletingItem}</span>"?
            </p>
            <p className="text-xs text-muted-foreground">Redirecionar motos vinculadas para:</p>
            <Select value={redirectTo} onValueChange={setRedirectTo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__blank__">Deixar em branco</SelectItem>
                {items.filter(i => i !== deletingItem).map(i => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setDeletingItem(null); setRedirectTo("__blank__"); }}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={confirmDelete} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Confirmar
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Novo rastreador..." value={newItem}
              onChange={e => { setNewItem(e.target.value); setDuplicateWarning(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} />
            <Button size="sm" disabled={!newItem.trim()} onClick={handleAdd} className="gap-1 shrink-0">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 group px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                {editingIdx === idx ? (
                  <>
                    <Input className="h-8 text-sm flex-1" value={editValue}
                      onChange={e => { setEditValue(e.target.value); setDuplicateWarning(""); }}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(item, editValue); }} autoFocus />
                    <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleRename(item, editValue)}>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditingIdx(null); setDuplicateWarning(""); }}>
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="h-2 w-2 rounded-full bg-primary/40 shrink-0" />
                    <span className="text-sm flex-1 text-foreground">{item}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingIdx(idx); setEditValue(item); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setDeletingItem(item); setRedirectTo("__blank__"); }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum rastreador cadastrado</p>}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">{items.length} {items.length === 1 ? "item" : "itens"}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Compute lucro operacional from financial entries ---
function computeLucroOperacional(motoId: string, moto?: Motorcycle | null): number {
  const entries = loadFinancial();
  const motoEntries = entries.filter(e => e.motoId === motoId && !e.ignorada && e.pago);
  const receitas = motoEntries.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
  let despesas = motoEntries.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
  // Inclui parcelas/entrada já pagas do financiamento, descontando o que já está
  // lançado no financeiro para a mesma moto (evita duplicação).
  if (moto) despesas += computeFinancingPaidExtra(moto, entries);
  return receitas - despesas;
}

// --- Helpers para auto-geração de lançamentos financeiros ---
import type { FinancialEntry } from "@/lib/types";

const PURCHASE_KEYWORDS = /financ|parcela|entrada|aquisi|compra moto|compra da moto/i;

/** Verifica se já existe uma despesa de compra/entrada/parcela para a placa em uma data específica. */
function hasPurchaseEntryForDate(entries: FinancialEntry[], placa: string, motoId: string, isoDate: string): boolean {
  const upper = (placa || "").toUpperCase();
  return entries.some(e => {
    if (e.tipo !== "despesa") return false;
    if ((e.placa || "").toUpperCase() !== upper && e.motoId !== motoId) return false;
    const ref = e.dataPrevista || e.data;
    if (ref !== isoDate) return false;
    const haystack = `${e.categoria || ""} ${e.subcategoria || ""} ${e.descricao || ""} ${e.observacao || ""}`;
    return PURCHASE_KEYWORDS.test(haystack);
  });
}

/** Constrói a despesa de entrada (financiada/parcelada) ou de compra (à vista). Retorna null se já existir. */
function buildEntradaEntry(m: Motorcycle, existing: FinancialEntry[], conta: string = "Caixa"): FinancialEntry | null {
  if (!m.placa || !m.dataCompra) return null;
  const isFinanced = m.formaCompra === "financiada" || m.formaCompra === "parcelada";
  const valor = isFinanced ? (m.valorEntrada || 0) : (m.valorCompra || 0);
  if (valor <= 0) return null;
  if (hasPurchaseEntryForDate(existing, m.placa, m.id, m.dataCompra)) return null;
  return {
    id: crypto.randomUUID(),
    tipo: "despesa",
    categoria: "compra_moto",
    subcategoria: isFinanced
      ? (m.formaCompra === "financiada" ? "Financiamento" : "Parcelamento")
      : undefined,
    tags: isFinanced ? ["Entrada"] : [],
    descricao: isFinanced
      ? `Entrada ${m.formaCompra === "financiada" ? "financiamento" : "parcelamento"} moto ${m.placa}${m.modelo ? ` (${m.modelo})` : ""}`
      : `Compra à vista moto ${m.placa}${m.modelo ? ` (${m.modelo})` : ""}`,
    valor,
    data: m.dataCompra,
    dataPrevista: m.dataCompra,
    motoId: m.id,
    placa: m.placa,
    rentalId: null,
    clienteId: null,
    pago: true,
    conta,
    natureza: "investimento",
    despesaFixa: false,
    observacao: "Gerado automaticamente ao cadastrar a moto.",
  };
}

/**
 * Gera as despesas das parcelas restantes a partir da próxima data de vencimento.
 * Se em um mês já existir uma despesa de compra/parcela/financiamento para a placa, esse mês é ignorado.
 */
function buildFutureInstallments(
  m: Motorcycle,
  existing: FinancialEntry[],
  conta: string = "Caixa",
): { entries: FinancialEntry[]; skipped: number } {
  if (!m.diaVencimento || !m.numParcelas || !m.valorParcela || !m.placa) return { entries: [], skipped: 0 };
  const totalParcelas = m.numParcelas;
  const pagas = m.parcelasPagas || 0;
  const restantes = totalParcelas - pagas;
  if (restantes <= 0) return { entries: [], skipped: 0 };

  const dia = Math.min(31, Math.max(1, m.diaVencimento));
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();
  let startY = todayY;
  let startM = todayM;
  if (todayD > dia) { startM += 1; if (startM > 11) { startM = 0; startY += 1; } }

  const upperPlaca = m.placa.toUpperCase();
  const existingByMonth = new Set<string>();
  existing.forEach(e => {
    if (e.tipo !== "despesa") return;
    if ((e.placa || "").toUpperCase() !== upperPlaca && e.motoId !== m.id) return;
    const haystack = `${e.categoria || ""} ${e.subcategoria || ""} ${e.descricao || ""} ${e.observacao || ""}`;
    if (!PURCHASE_KEYWORDS.test(haystack)) return;
    const ref = e.dataPrevista || e.data;
    if (!ref) return;
    const [y, mo] = ref.split("-");
    if (y && mo) existingByMonth.add(`${y}-${mo}`);
  });

  const entries: FinancialEntry[] = [];
  let skipped = 0;
  const serieId = `moto-${m.id}-financiamento`;

  for (let i = 0; i < restantes; i++) {
    const y = startY + Math.floor((startM + i) / 12);
    const mo = ((startM + i) % 12);
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const realDay = Math.min(dia, lastDay);
    const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
    if (existingByMonth.has(monthKey)) { skipped++; continue; }
    const iso = `${monthKey}-${String(realDay).padStart(2, "0")}`;
    const parcelaNum = pagas + i + 1;
    entries.push({
      id: crypto.randomUUID(),
      tipo: "despesa",
      categoria: "compra_moto",
      subcategoria: m.formaCompra === "financiada" ? "Financiamento" : "Parcelamento",
      tags: ["Parcela"],
      descricao: `Parcela ${parcelaNum}/${totalParcelas} — ${m.formaCompra === "financiada" ? "Financiamento" : "Parcelamento"} moto ${m.placa}${m.modelo ? ` (${m.modelo})` : ""}`,
      valor: m.valorParcela!,
      data: iso,
      dataPrevista: iso,
      motoId: m.id,
      placa: m.placa,
      rentalId: null,
      clienteId: null,
      pago: false,
      conta,
      natureza: "investimento",
      despesaFixa: false,
      serieId,
      observacao: `Gerado automaticamente a partir do cadastro da moto. Parcela ${parcelaNum} de ${totalParcelas}.`,
    });
    existingByMonth.add(monthKey);
  }
  return { entries, skipped };
}

/**
 * Sincroniza os lançamentos da série de financiamento/parcelamento + a despesa de entrada/compra
 * quando a moto é editada. Regras:
 *  - Parcelas PAGAS são preservadas (nunca alteradas/removidas).
 *  - Parcelas PENDENTES (não pagas) da série são recalculadas: valor, dataPrevista (pelo diaVencimento),
 *    descrição, subcategoria. Excedentes são removidas; faltantes são criadas.
 *  - A despesa de entrada/compra (mesma placa, contém keyword PURCHASE_KEYWORDS, sem nº de parcela)
 *    é atualizada se ainda estiver PENDENTE; se estiver paga, é preservada.
 *  - Se a forma de compra mudou para "à vista" e existirem parcelas pendentes da série, todas são removidas.
 */
function syncFinancialEntries(
  m: Motorcycle,
  entries: FinancialEntry[],
  conta: string = "Caixa",
): { next: FinancialEntry[]; updated: number; created: number; removed: number } {
  if (!m.placa) return { next: entries, updated: 0, created: 0, removed: 0 };
  const upperPlaca = m.placa.toUpperCase();
  const isFinanced = m.formaCompra === "financiada" || m.formaCompra === "parcelada";
  const serieId = `moto-${m.id}-financiamento`;

  let updated = 0;
  let created = 0;
  let removed = 0;

  // 1) Atualiza/remove parcelas da série
  const seriePending = entries.filter(
    (e) => e.serieId === serieId && e.tipo === "despesa" && !e.pago && !e.ignorada,
  );
  const seriePaidCount = entries.filter(
    (e) => e.serieId === serieId && e.tipo === "despesa" && e.pago,
  ).length;

  let next = entries.filter((e) => !(seriePending.some((p) => p.id === e.id)));
  removed += seriePending.length;

  if (isFinanced && m.diaVencimento && m.numParcelas && m.valorParcela && m.valorParcela > 0) {
    const totalParcelas = m.numParcelas;
    const pagasInformadas = m.parcelasPagas || 0;
    // Considera o maior entre parcelasPagas informadas e parcelas já marcadas como pagas no financeiro
    const jaPagas = Math.max(pagasInformadas, seriePaidCount);
    const restantes = Math.max(0, totalParcelas - jaPagas);

    const dia = Math.min(31, Math.max(1, m.diaVencimento));
    const today = new Date();
    let startY = today.getFullYear();
    let startM = today.getMonth();
    if (today.getDate() > dia) {
      startM += 1;
      if (startM > 11) { startM = 0; startY += 1; }
    }

    // Coleta meses já ocupados por outras despesas de compra (não da série) para evitar duplicar
    const occupiedMonths = new Set<string>();
    next.forEach((e) => {
      if (e.tipo !== "despesa") return;
      if ((e.placa || "").toUpperCase() !== upperPlaca && e.motoId !== m.id) return;
      if (e.serieId === serieId) return;
      const haystack = `${e.categoria || ""} ${e.subcategoria || ""} ${e.descricao || ""} ${e.observacao || ""}`;
      if (!PURCHASE_KEYWORDS.test(haystack)) return;
      const ref = e.dataPrevista || e.data;
      if (!ref) return;
      const [y, mo] = ref.split("-");
      if (y && mo) occupiedMonths.add(`${y}-${mo}`);
    });

    const sub = m.formaCompra === "financiada" ? "Financiamento" : "Parcelamento";
    for (let i = 0; i < restantes; i++) {
      const y = startY + Math.floor((startM + i) / 12);
      const mo = (startM + i) % 12;
      const lastDay = new Date(y, mo + 1, 0).getDate();
      const realDay = Math.min(dia, lastDay);
      const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
      if (occupiedMonths.has(monthKey)) continue;
      const iso = `${monthKey}-${String(realDay).padStart(2, "0")}`;
      const parcelaNum = jaPagas + i + 1;
      next.push({
        id: crypto.randomUUID(),
        tipo: "despesa",
        categoria: "compra_moto",
        subcategoria: sub,
        tags: ["Parcela"],
        descricao: `Parcela ${parcelaNum}/${totalParcelas} — ${sub} moto ${m.placa}${m.modelo ? ` (${m.modelo})` : ""}`,
        valor: m.valorParcela!,
        data: iso,
        dataPrevista: iso,
        motoId: m.id,
        placa: m.placa,
        rentalId: null,
        clienteId: null,
        pago: false,
        conta,
        natureza: "investimento",
        despesaFixa: false,
        serieId,
        observacao: `Sincronizado automaticamente. Parcela ${parcelaNum} de ${totalParcelas}.`,
      });
      occupiedMonths.add(monthKey);
      created++;
    }
    // ajuste contábil: se o número de pendentes recriadas iguala o que existia, contamos como "atualizado"
    const reused = Math.min(removed, created);
    updated += reused;
    created -= reused;
    removed -= reused;
  }

  // 2) Atualiza despesa de entrada/compra (não pertencente à série) se ainda pendente
  const entradaIdx = next.findIndex((e) => {
    if (e.tipo !== "despesa") return false;
    if (e.serieId === serieId) return false;
    if ((e.placa || "").toUpperCase() !== upperPlaca && e.motoId !== m.id) return false;
    const haystack = `${e.categoria || ""} ${e.subcategoria || ""} ${e.descricao || ""} ${e.observacao || ""}`;
    if (!PURCHASE_KEYWORDS.test(haystack)) return false;
    // Não confundir com parcelas: descrição de parcela contém "Parcela N/M"
    if (/Parcela\s+\d+\s*\/\s*\d+/i.test(e.descricao || "")) return false;
    return true;
  });
  if (entradaIdx >= 0) {
    const cur = next[entradaIdx];
    if (!cur.pago) {
      const novoValor = isFinanced ? (m.valorEntrada || 0) : (m.valorCompra || 0);
      const novaData = m.dataCompra || cur.data;
      const novaSub = isFinanced ? (m.formaCompra === "financiada" ? "Financiamento" : "Parcelamento") : undefined;
      const novaDesc = isFinanced
        ? `Entrada ${m.formaCompra === "financiada" ? "financiamento" : "parcelamento"} moto ${m.placa}${m.modelo ? ` (${m.modelo})` : ""}`
        : `Compra à vista moto ${m.placa}${m.modelo ? ` (${m.modelo})` : ""}`;
      if (novoValor <= 0) {
        // Forma de compra/valor zerou — remove a despesa pendente
        next.splice(entradaIdx, 1);
        removed++;
      } else if (
        cur.valor !== novoValor ||
        cur.data !== novaData ||
        (cur.dataPrevista || cur.data) !== novaData ||
        cur.subcategoria !== novaSub ||
        cur.descricao !== novaDesc ||
        (cur.tags?.[0] || "") !== (isFinanced ? "Entrada" : "")
      ) {
        next[entradaIdx] = {
          ...cur,
          valor: novoValor,
          data: novaData,
          dataPrevista: novaData,
          subcategoria: novaSub,
          descricao: novaDesc,
          tags: isFinanced ? ["Entrada"] : [],
          conta: conta || cur.conta,
          observacao: (cur.observacao || "") + (cur.observacao?.includes("Sincronizado") ? "" : " · Sincronizado automaticamente."),
        };
        updated++;
      }
    }
  }

  return { next, updated, created, removed };
}

export function MotoDialog({ open, onOpenChange, moto, onSave, mode }: MotoDialogProps) {
  const [form, setForm] = useState<Motorcycle>(moto || emptyMoto());
  const { activeCompany } = useCompany();
  const [step, setStep] = useState(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [rastreadores, setRastreadores] = useState<string[]>(loadRastreadores);
  const [rastreadorManagerOpen, setRastreadorManagerOpen] = useState(false);
  const [fipeLoading, setFipeLoading] = useState(false);
  const [skipStep2, setSkipStep2] = useState(false);
  // Opções para auto-gerar lançamentos financeiros ao salvar
  const [autoGenEntrada, setAutoGenEntrada] = useState(true);
  const [autoGenParcelas, setAutoGenParcelas] = useState(true);
  const [contaLancamento, setContaLancamento] = useState<string>("Caixa");
  const bankAccounts = useMemo(() => (getDataCache().bankAccounts || []) as Array<{ id: string; nome: string }>, [open]);

  useEffect(() => {
    if (open) {
      const base = moto ? { ...moto, historicoOleo: [...(moto.historicoOleo || [])] } : emptyMoto();
      // Auto-compute lucro operacional
      if (moto) {
        base.lucroOperacional = computeLucroOperacional(moto.id, base);
      }
      setForm(base);
      setStep(mode === "edit" ? 2 : 1);
      setPdfFile(null);
      setTouched({});
      setSkipStep2(false);
      // Por padrão sugerir gerar despesas só em novos cadastros
      setAutoGenEntrada(mode === "add");
      setAutoGenParcelas(mode === "add");
      // Conta padrão: primeira conta cadastrada (ou "Caixa" se não houver)
      const accs = (getDataCache().bankAccounts || []) as Array<{ nome: string }>;
      setContaLancamento(accs[0]?.nome || "Caixa");
      setRastreadores(loadRastreadores());
    }
  }, [open, moto, mode]);

  // Auto-lookup FIPE when modelo + anoModelo are set and step goes to 3
  useEffect(() => {
    if (step === 3 && form.modelo && form.anoModelo && !form.valorFipe && !fipeLoading) {
      lookupFipe();
    }
  }, [step]);

  // Quando forma de aquisição é financiada/parcelada, valor de compra = entrada + (nº parcelas × valor parcela)
  useEffect(() => {
    if (form.formaCompra !== "financiada" && form.formaCompra !== "parcelada") return;
    const total = (form.valorEntrada || 0) + ((form.numParcelas || 0) * (form.valorParcela || 0));
    if (total !== (form.valorCompra || 0)) {
      setForm(prev => ({ ...prev, valorCompra: total > 0 ? total : null }));
    }
  }, [form.formaCompra, form.valorEntrada, form.numParcelas, form.valorParcela]);

  const lookupFipe = useCallback(async () => {
    if (!form.modelo || !form.anoModelo) return;
    setFipeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-fipe", {
        body: { modelo: form.modelo, anoModelo: form.anoModelo },
      });
      if (error) throw error;
      if (data?.success && data?.data?.valor) {
        const valor = Number(data.data.valor);
        const ref = data.data.referencia || "";
        const codFipe = data.data.codigoFipe || "";
        setForm(prev => ({
          ...prev,
          valorFipe: valor,
          dataFipe: new Date().toISOString().slice(0, 10),
        }));
        toast.success(`FIPE ${ref}: R$ ${valor.toLocaleString("pt-BR")}${codFipe ? ` (${codFipe})` : ""}`, { duration: 5000 });
        if (data.data.aviso) toast.info(data.data.aviso, { duration: 5000 });
      } else if (data?.error) {
        toast.warning(data.error);
      } else if (data?.success) {
        toast.warning("Valor FIPE não disponível para este modelo. Preencha manualmente.");
      }
    } catch (err) {
      console.error("FIPE lookup error:", err);
      toast.warning("Não foi possível consultar o valor FIPE. Preencha manualmente.");
    } finally {
      setFipeLoading(false);
    }
  }, [form.modelo, form.anoModelo]);

  const step2Errors = useMemo(() => touched[2] ? validateStep2(form) : {}, [form, touched]);
  const step3Errors = useMemo(() => touched[3] ? validateStep3(form) : {}, [form, touched]);

  const canAdvanceStep2 = Object.keys(validateStep2(form)).length === 0;
  const canAdvanceStep3 = Object.keys(validateStep3(form)).length === 0;

  // Detecta placa duplicada (ignora a própria moto em edição)
  const duplicatePlaca = (() => {
    const placa = (form.placa || "").trim().toUpperCase();
    if (!placa) return null;
    const found = loadMotos().find(
      (m) => (m.placa || "").trim().toUpperCase() === placa && m.id !== form.id,
    );
    return found || null;
  })();
  const isDuplicate = !!duplicatePlaca;

  const tryAdvance = (from: number) => {
    setTouched(prev => ({ ...prev, [from]: true }));
    if (from === 2 && !canAdvanceStep2) {
      const placaErr = validatePlaca(form.placa);
      if (placaErr) {
        toast.error("A placa é obrigatória e não pode ser ignorada");
        return;
      }
      if (!skipStep2) {
        toast.error("Preencha todos os campos obrigatórios corretamente");
        return;
      }
    }
    if (from === 2 && isDuplicate) {
      toast.error(`Placa ${duplicatePlaca!.placa} já cadastrada${duplicatePlaca!.modelo ? ` (${duplicatePlaca!.modelo})` : ""}`);
      return;
    }
    if (from === 3 && !canAdvanceStep3) {
      toast.error("Preencha todos os campos obrigatórios corretamente");
      return;
    }
    setStep(from + 1);
  };

  const tryGoTo = (target: number) => {
    if (target < step) { setStep(target); return; }
    if (target > 1 && step <= 1) { setStep(2); return; }
    if (target >= 3 && step <= 2) {
      setTouched(prev => ({ ...prev, 2: true }));
      const placaErr = validatePlaca(form.placa);
      if (placaErr) { toast.error("A placa é obrigatória e não pode ser ignorada"); return; }
      if (!canAdvanceStep2 && !skipStep2) { toast.error("Corrija os erros no Passo 2 antes de avançar"); return; }
      if (isDuplicate) { toast.error(`Placa ${duplicatePlaca!.placa} já cadastrada${duplicatePlaca!.modelo ? ` (${duplicatePlaca!.modelo})` : ""}`); return; }
    }
    setStep(target);
  };

  const handleSave = () => {
    setTouched(prev => ({ ...prev, 2: true, 3: true }));
    const placaErr = validatePlaca(form.placa);
    if (placaErr) { toast.error("A placa é obrigatória e não pode ser ignorada"); setStep(2); return; }
    if (isDuplicate) {
      toast.error(`Placa ${duplicatePlaca!.placa} já cadastrada${duplicatePlaca!.modelo ? ` (${duplicatePlaca!.modelo})` : ""}. Cadastro bloqueado.`);
      setStep(2);
      return;
    }
    if (!canAdvanceStep2 && !skipStep2) { toast.error("Corrija os erros nos dados do veículo"); setStep(2); return; }
    if (!canAdvanceStep3) { toast.error("Corrija os erros nos dados financeiros"); setStep(3); return; }
    // Gera lançamentos financeiros conforme checkboxes
    const existing = loadFinancial();
    let working = existing;
    let syncUpdated = 0;
    let syncCreated = 0;
    let syncRemoved = 0;

    // Sincroniza lançamentos existentes quando estiver editando uma moto já cadastrada
    if (mode === "edit") {
      const r = syncFinancialEntries(form, working, contaLancamento);
      working = r.next;
      syncUpdated = r.updated;
      syncCreated = r.created;
      syncRemoved = r.removed;
    }

    const additions: typeof existing = [];
    let entradaCreated = 0;
    let parcelasCreated = 0;
    let parcelasSkipped = 0;

    if (autoGenEntrada) {
      const r = buildEntradaEntry(form, working, contaLancamento);
      if (r) { additions.push(r); entradaCreated = 1; }
    }
    const isFinanced = form.formaCompra === "financiada" || form.formaCompra === "parcelada";
    if (autoGenParcelas && isFinanced) {
      const r = buildFutureInstallments(form, [...working, ...additions], contaLancamento);
      additions.push(...r.entries);
      parcelasCreated = r.entries.length;
      parcelasSkipped = r.skipped;
    }
    if (additions.length > 0 || working !== existing) {
      saveFinancial([...working, ...additions]);
    }

    // Recalculate lucro before saving
    const lucro = computeLucroOperacional(form.id, form);
    onSave({ ...form, lucroOperacional: lucro });
    onOpenChange(false);

    const parts: string[] = ["Moto salva"];
    if (entradaCreated) parts.push(`despesa de ${isFinanced ? "entrada" : "compra"} criada`);
    if (parcelasCreated) parts.push(`${parcelasCreated} parcela(s) criadas${parcelasSkipped ? ` (${parcelasSkipped} ignoradas)` : ""}`);
    if (syncUpdated) parts.push(`${syncUpdated} lançamento(s) atualizados`);
    if (syncCreated) parts.push(`${syncCreated} novo(s) lançamento(s)`);
    if (syncRemoved) parts.push(`${syncRemoved} lançamento(s) removidos`);
    toast.success(parts.join(" · "));
  };


  const handlePdfUpload = useCallback(async (file: File) => {
    setPdfFile(file);
    setForm(prev => ({ ...prev, crlvPdfName: file.name }));
    setExtracting(true);

    let pdfBase64 = "";
    toast.info("Analisando documento CRLV com IA...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      pdfBase64 = arrayBufferToBase64(arrayBuffer);
      setForm(prev => ({ ...prev, crlvPdfData: pdfBase64 }));

      if (activeCompany?.id) {
        try {
          const path = await uploadDocument(
            "crlv-documents",
            buildCrlvPath(activeCompany.id, form.id, file.name),
            file,
            "application/pdf",
          );
          setForm(prev => ({ ...prev, crlvStoragePath: path }));
        } catch (uploadErr) {
          console.error("CRLV upload error:", uploadErr);
          toast.warning("Não foi possível salvar o CRLV no servidor. O download pode não funcionar após recarregar.");
        }
      }

      const { data, error } = await supabase.functions.invoke("extract-crlv", {
        body: { pdfBase64 },
      });

      if (error) throw new Error(error.message || "Erro ao chamar a função de extração");

      if (data?.success && data?.data) {
        const d = data.data;
        setForm(prev => ({
          ...prev,
          placa: d.placa?.toUpperCase() || prev.placa,
          modelo: d.modelo || prev.modelo,
          anoModelo: d.anoModelo ? Number(d.anoModelo) : prev.anoModelo,
          cor: d.cor || prev.cor,
          chassi: d.chassi?.toUpperCase() || prev.chassi,
          renavam: d.renavam?.replace(/\D/g, "") || prev.renavam,
          numMotor: d.numMotor?.toUpperCase() || prev.numMotor,
        }));
        toast.success("Dados extraídos com sucesso! Revise os campos preenchidos.", { duration: 5000 });
      } else {
        toast.warning(data?.error || "Não foi possível extrair os dados. Preencha manualmente.", { duration: 5000 });
      }
    } catch (err: unknown) {
      console.error("CRLV extraction error:", err);
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro na extração: ${msg}. Preencha manualmente.`, { duration: 5000 });
    } finally {
      setExtracting(false);
      setStep(2);
    }
  }, [activeCompany?.id, form.id]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") handlePdfUpload(file);
    else toast.error("Apenas arquivos PDF são aceitos");
  }, [handlePdfUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePdfUpload(file);
  }, [handlePdfUpload]);

  // Rastreador management
  const addRastreador = (name: string) => {
    const updated = [...rastreadores, name];
    setRastreadores(updated);
    saveRastreadores(updated);
  };
  const removeRastreador = (name: string) => {
    const updated = rastreadores.filter(r => r !== name);
    setRastreadores(updated);
    saveRastreadores(updated);
    if (form.aplicativo === name) setForm(prev => ({ ...prev, aplicativo: "" }));
  };
  const renameRastreador = (old: string, next: string) => {
    const updated = rastreadores.map(r => r === old ? next : r);
    setRastreadores(updated);
    saveRastreadores(updated);
    if (form.aplicativo === old) setForm(prev => ({ ...prev, aplicativo: next }));
  };

  const progressValue = (step / STEPS.length) * 100;
  const errBorder = (field: string, errors: FieldErrors) => errors[field] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{mode === "add" ? "Cadastrar Nova Moto" : `Editar ${form.placa || "moto"}`}</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-6 pt-2">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              const hasError = (s.id === 2 && touched[2] && !canAdvanceStep2) || (s.id === 3 && touched[3] && !canAdvanceStep3);
              return (
                <div key={s.id} className="flex items-center gap-1.5 flex-1">
                  <button
                    onClick={() => tryGoTo(s.id)}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors rounded-md px-2 py-1.5 ${
                      hasError
                        ? "bg-destructive/10 text-destructive"
                        : isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                        ? "bg-success/10 text-success"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {hasError ? <AlertCircle className="h-3.5 w-3.5" /> : isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{s.id}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px ${isDone && !hasError ? "bg-success" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progressValue} className="h-1" />
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 min-h-[320px]">
          {/* Step 1: Documento */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <FileText className="h-10 w-10 mx-auto text-primary opacity-70" />
                <h3 className="font-semibold text-foreground">Documento CRLV</h3>
                <p className="text-xs text-muted-foreground">
                  Anexe o PDF do CRLV para preencher os dados automaticamente
                </p>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer hover:border-primary/50 hover:bg-primary/5 ${
                  pdfFile ? "border-success bg-success/5" : "border-border"
                }`}
                onClick={() => document.getElementById("crlv-upload")?.click()}
              >
                {extracting ? (
                  <div className="space-y-3">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                    <p className="text-sm text-muted-foreground">Analisando documento...</p>
                  </div>
                ) : pdfFile || form.crlvPdfName ? (
                  <div className="space-y-2">
                    <Check className="h-8 w-8 mx-auto text-success" />
                    <p className="text-sm font-medium text-success">{pdfFile?.name || form.crlvPdfName}</p>
                    <p className="text-xs text-muted-foreground">Clique para trocar o arquivo</p>
                    {(form.crlvStoragePath || form.crlvPdfData) && (
                      <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (form.crlvStoragePath) {
                            await downloadDocument("crlv-documents", form.crlvStoragePath, form.crlvPdfName || "crlv.pdf");
                          } else if (form.crlvPdfData) {
                            downloadStoredFile(form.crlvPdfData, form.crlvPdfName || "crlv.pdf", "application/pdf");
                          }
                        } catch (error) {
                          console.error("CRLV download error:", error);
                          toast.error("Não foi possível baixar o CRLV.");
                        }
                      }}><Download className="h-3 w-3" />Baixar CRLV</Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Arraste o PDF aqui ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground">Formato aceito: PDF do CRLV</p>
                  </div>
                )}
                <input
                  id="crlv-upload"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Opcional — você pode pular e preencher manualmente.
              </p>
            </div>
          )}

          {/* Step 2: Dados do Veículo */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Placa <span className="text-destructive">*</span>
                    <InfoTooltip text="Placa no padrão Mercosul (ABC1D23) ou antigo (ABC1234)" />
                  </Label>
                  <Input className={`${errBorder("placa", step2Errors)} ${isDuplicate ? "border-destructive focus-visible:ring-destructive" : ""}`} value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="ABC1D23" maxLength={7} />
                  <FieldError msg={step2Errors.placa} />
                  {isDuplicate && (
                    <p className="text-xs text-destructive font-medium">
                      Placa já cadastrada{duplicatePlaca!.modelo ? ` em "${duplicatePlaca!.modelo}"` : ""}. Cadastro bloqueado.
                    </p>
                  )}
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Tipo <span className="text-destructive">*</span>
                    <InfoTooltip text="Própria: patrimônio da empresa. Terceiro: veículo sob gestão" />
                  </Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "propria" | "terceiro" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="propria">Própria</SelectItem>
                      <SelectItem value="terceiro">Terceiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Modelo <span className="text-destructive">*</span>
                  </Label>
                  <Input className={errBorder("modelo", step2Errors)} value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="CG 160 Fan" />
                  <FieldError msg={step2Errors.modelo} />
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Ano/Modelo <span className="text-destructive">*</span>
                  </Label>
                  <Input className={errBorder("anoModelo", step2Errors)} type="number" value={form.anoModelo ?? ""} onChange={(e) => setForm({ ...form, anoModelo: e.target.value ? Number(e.target.value) : null })} placeholder="2025" />
                  <FieldError msg={step2Errors.anoModelo} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Cor <span className="text-destructive">*</span>
                    <InfoTooltip text="Cor do veículo conforme documento" />
                  </Label>
                  <Input className={errBorder("cor", step2Errors)} value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} placeholder="Vermelha" />
                  <FieldError msg={step2Errors.cor} />
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Chassi <span className="text-destructive">*</span>
                    <InfoTooltip text="Número do chassi (VIN) — 17 caracteres" />
                  </Label>
                  <Input className={errBorder("chassi", step2Errors)} value={form.chassi} onChange={(e) => setForm({ ...form, chassi: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="9C2KC..." maxLength={17} />
                  <FieldError msg={step2Errors.chassi} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Renavam <span className="text-destructive">*</span>
                    <InfoTooltip text="Código de 11 dígitos para identificação no DETRAN" />
                  </Label>
                  <Input className={errBorder("renavam", step2Errors)} value={form.renavam} onChange={(e) => setForm({ ...form, renavam: e.target.value.replace(/\D/g, "") })} placeholder="00000000000" maxLength={11} />
                  <FieldError msg={step2Errors.renavam} />
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1 text-xs">
                    Nº Motor <span className="text-destructive">*</span>
                    <InfoTooltip text="Número de identificação gravado no motor" />
                  </Label>
                  <Input className={errBorder("numMotor", step2Errors)} value={form.numMotor} onChange={(e) => setForm({ ...form, numMotor: e.target.value.toUpperCase() })} placeholder="KC08E..." />
                  <FieldError msg={step2Errors.numMotor} />
                </div>
              </div>

              <div className="grid gap-1">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1 text-xs">
                    Rastreador <span className="text-destructive">*</span>
                    <InfoTooltip text="Sistema de rastreamento vinculado ao veículo" />
                  </Label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground gap-1"
                    onClick={() => setRastreadorManagerOpen(true)}>
                    <Settings2 className="h-3 w-3" /> Gerenciar
                  </Button>
                </div>
                <Select value={form.aplicativo || "none"} onValueChange={(v) => setForm({ ...form, aplicativo: v === "none" ? "" : v })}>
                  <SelectTrigger className={errBorder("aplicativo", step2Errors)}>
                    <SelectValue placeholder="Selecione o rastreador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Selecione...</SelectItem>
                    {rastreadores.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError msg={step2Errors.aplicativo} />
              </div>

              {touched[2] && Object.keys(step2Errors).length > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="flex-1 text-xs text-destructive">
                    {Object.keys(step2Errors).length} campo(s) com erro.
                    {skipStep2 ? " Validação ignorada — você poderá avançar." : " Corrija para avançar ou ignore por enquanto."}
                  </p>
                  <Button
                    type="button"
                    variant={skipStep2 ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setSkipStep2(s => !s)}
                  >
                    {skipStep2 ? "Reativar validação" : "Ignorar por enquanto"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Financeiro */}
          {step === 3 && (
            <div className="space-y-4">
              {(() => {
                const isFinanced = form.formaCompra === "financiada" || form.formaCompra === "parcelada";
                const totalFinanciado = (form.valorEntrada || 0) + ((form.numParcelas || 0) * (form.valorParcela || 0));
                const restante = ((form.numParcelas || 0) - (form.parcelasPagas || 0)) * (form.valorParcela || 0);
                const pagasPct = form.numParcelas ? Math.min(100, ((form.parcelasPagas || 0) / form.numParcelas) * 100) : 0;
                const valorizacao = (form.valorCompra && form.valorFipe) ? ((form.valorFipe - form.valorCompra) / form.valorCompra) * 100 : null;

                return (
                  <>
                    {/* SEÇÃO 1: Aquisição */}
                    <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Aquisição</h3>
                          <p className="text-[11px] text-muted-foreground">Como e quando você comprou</p>
                        </div>
                      </header>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              Forma de aquisição
                              <InfoTooltip text="Como o veículo foi adquirido: à vista, financiado ou parcelado direto" />
                            </Label>
                            <Select value={form.formaCompra || "vista"} onValueChange={(v) => setForm({ ...form, formaCompra: v as "vista" | "financiada" | "parcelada" })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vista">À vista</SelectItem>
                                <SelectItem value="financiada">Financiada</SelectItem>
                                <SelectItem value="parcelada">Parcelada</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              Data de Compra <span className="text-destructive">*</span>
                            </Label>
                            <Input className={errBorder("dataCompra", step3Errors)} type="date" value={form.dataCompra || ""} onChange={(e) => setForm({ ...form, dataCompra: e.target.value || null })} />
                            <FieldError msg={step3Errors.dataCompra} />
                          </div>
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              KM na Compra <span className="text-destructive">*</span>
                            </Label>
                            <Input className={errBorder("kmCompra", step3Errors)} inputMode="numeric" value={form.kmCompra != null ? maskKm(String(form.kmCompra)) : ""} onChange={(e) => { const masked = maskKm(e.target.value); setForm({ ...form, kmCompra: masked ? parseKm(masked) : null }); }} placeholder="0" />
                            <FieldError msg={step3Errors.kmCompra} />
                          </div>
                        </div>

                        {isFinanced ? (
                          <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-3">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              <Sparkles className="h-3 w-3" />
                              Configuração de {form.formaCompra === "financiada" ? "financiamento" : "parcelamento"}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="grid gap-1">
                                <Label className="text-xs">Entrada</Label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground pointer-events-none">R$</span>
                                  <Input className="pl-8 pr-2 tabular-nums" inputMode="numeric"
                                    value={form.valorEntrada != null ? formatBRL(form.valorEntrada) : ""}
                                    onChange={(e) => { const masked = maskCurrency(e.target.value); setForm({ ...form, valorEntrada: masked ? parseBRL(masked) : null }); }}
                                    placeholder="0,00" />
                                </div>
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">Nº de parcelas</Label>
                                <Input type="number" min={1} step={1}
                                  value={form.numParcelas ?? ""}
                                  onChange={(e) => setForm({ ...form, numParcelas: e.target.value ? Number(e.target.value) : null })}
                                  placeholder="36" />
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">Valor da parcela</Label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground pointer-events-none">R$</span>
                                  <Input className="pl-8 pr-2 tabular-nums" inputMode="numeric"
                                    value={form.valorParcela != null ? formatBRL(form.valorParcela) : ""}
                                    onChange={(e) => { const masked = maskCurrency(e.target.value); setForm({ ...form, valorParcela: masked ? parseBRL(masked) : null }); }}
                                    placeholder="0,00" />
                                </div>
                              </div>
                              <div className="grid gap-1">
                                <Label className="flex items-center gap-1 text-xs">
                                  Parcelas pagas
                                  <InfoTooltip text="Quantas parcelas já foram quitadas no momento do cadastro" />
                                </Label>
                                <Input type="number" min={0} step={1}
                                  value={form.parcelasPagas ?? ""}
                                  onChange={(e) => setForm({ ...form, parcelasPagas: e.target.value ? Number(e.target.value) : null })}
                                  placeholder="0" />
                              </div>
                            </div>

                            {form.numParcelas && form.valorParcela ? (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="rounded-md bg-background/80 ring-1 ring-border px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                                    <div className="text-sm font-semibold tabular-nums">{formatBRL(totalFinanciado)}</div>
                                  </div>
                                  <div className="rounded-md bg-background/80 ring-1 ring-border px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Restante</div>
                                    <div className="text-sm font-semibold tabular-nums">{formatBRL(restante)}</div>
                                  </div>
                                  <div className="rounded-md bg-background/80 ring-1 ring-border px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pagas</div>
                                    <div className="text-sm font-semibold tabular-nums">{form.parcelasPagas || 0}/{form.numParcelas}</div>
                                  </div>
                                </div>
                                <Progress value={pagasPct} className="h-1.5" />
                              </div>
                            ) : null}

                            {/* Vencimento + ação de gerar lançamentos futuros */}
                            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 items-end pt-1">
                              <div className="grid gap-1">
                                <Label className="flex items-center gap-1 text-xs">
                                  <Calendar className="h-3 w-3" /> Dia do vencimento
                                  <InfoTooltip text="Dia do mês (1-31) em que cada parcela vence. Usado para gerar os próximos lançamentos no financeiro." />
                                </Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={31}
                                  step={1}
                                  value={form.diaVencimento ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value ? Math.min(31, Math.max(1, Number(e.target.value))) : null;
                                    setForm({ ...form, diaVencimento: v });
                                  }}
                                  placeholder="10"
                                />
                              </div>
                              <label className="flex items-start gap-2 rounded-lg border bg-background/60 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                                <Checkbox
                                  checked={autoGenParcelas}
                                  onCheckedChange={(c) => setAutoGenParcelas(c === true)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1">
                                  <div className="text-xs font-medium flex items-center gap-1.5">
                                    <Repeat className="h-3.5 w-3.5 text-primary" />
                                    Gerar despesas das próximas parcelas
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Ao salvar, cria as parcelas restantes a partir do próximo vencimento. Meses que já tiverem lançamento de compra/parcela para esta placa são ignorados.
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-1">
                          <Label className="flex items-center gap-1 text-xs">
                            Valor de Compra <span className="text-destructive">*</span>
                            <InfoTooltip text={isFinanced ? "Calculado automaticamente: entrada + (nº de parcelas × valor da parcela)." : "Valor pago na aquisição do veículo"} />
                            {isFinanced && <span className="ml-1 rounded bg-primary/10 text-primary text-[10px] font-medium px-1.5 py-0.5">auto</span>}
                          </Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                            <Input
                              className={`pl-9 tabular-nums ${errBorder("valorCompra", step3Errors)} ${isFinanced ? "bg-muted/60 cursor-not-allowed" : ""}`}
                              inputMode="numeric"
                              readOnly={isFinanced}
                              disabled={isFinanced}
                              title={isFinanced ? "Calculado pela forma de aquisição (entrada + parcelas)" : undefined}
                              value={form.valorCompra != null ? formatBRL(form.valorCompra) : ""}
                              onChange={(e) => {
                                if (isFinanced) return;
                                const masked = maskCurrency(e.target.value);
                                setForm({ ...form, valorCompra: masked ? parseBRL(masked) : null });
                              }}
                              placeholder="15.000,00"
                            />
                          </div>
                          <FieldError msg={step3Errors.valorCompra} />
                          {/* Checkbox: gerar despesa de entrada (financiado/parcelado) ou compra (à vista) */}
                          {((isFinanced && (form.valorEntrada || 0) > 0) || (!isFinanced && (form.valorCompra || 0) > 0)) && (
                            <label className="mt-1 flex items-start gap-2 rounded-lg border bg-background/60 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                              <Checkbox
                                checked={autoGenEntrada}
                                onCheckedChange={(c) => setAutoGenEntrada(c === true)}
                                className="mt-0.5"
                              />
                              <div className="flex-1">
                                <div className="text-xs font-medium flex items-center gap-1.5">
                                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                                  {isFinanced
                                    ? `Gerar despesa da entrada (${formatBRL(form.valorEntrada || 0)})`
                                    : `Gerar despesa da compra (${formatBRL(form.valorCompra || 0)})`}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Ao salvar, cria a despesa na data de compra. Será ignorada se já existir lançamento equivalente para esta placa nessa data.
                                </p>
                              </div>
                            </label>
                          )}
                          {/* Conta para os lançamentos gerados automaticamente */}
                          {(autoGenEntrada || (autoGenParcelas && isFinanced)) && (
                            <div className="mt-2 grid gap-1 rounded-lg border bg-background/60 px-3 py-2">
                              <Label className="flex items-center gap-1 text-xs">
                                <Wallet className="h-3.5 w-3.5 text-primary" />
                                Conta dos lançamentos gerados
                                <InfoTooltip text="Conta usada nas despesas criadas automaticamente (entrada/compra e parcelas)." />
                              </Label>
                              <Select value={contaLancamento} onValueChange={setContaLancamento}>
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecione a conta" />
                                </SelectTrigger>
                                <SelectContent>
                                  {bankAccounts.length === 0 && (
                                    <SelectItem value="Caixa">Caixa</SelectItem>
                                  )}
                                  {bankAccounts.map((a) => (
                                    <SelectItem key={a.id} value={a.nome}>{a.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* SEÇÃO 2: Avaliação FIPE */}
                    <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <TrendingUp className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Avaliação FIPE</h3>
                          <p className="text-[11px] text-muted-foreground">Valor de mercado de referência</p>
                        </div>
                      </header>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              Valor FIPE Atual
                              <InfoTooltip text="Valor de mercado estimado pela tabela FIPE. Consultado automaticamente ao preencher modelo e ano." />
                              {fipeLoading && <Loader2 className="h-3 w-3 animate-spin text-primary ml-1" />}
                            </Label>
                            <div className="flex gap-1.5">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                                <Input className="pl-9 tabular-nums" inputMode="numeric" value={form.valorFipe != null ? formatBRL(form.valorFipe) : ""} onChange={(e) => { const masked = maskCurrency(e.target.value); setForm({ ...form, valorFipe: masked ? parseBRL(masked) : null }); }} placeholder="Automático" />
                              </div>
                              <Button type="button" variant="outline" size="sm" className="shrink-0 h-9 px-2" disabled={fipeLoading || !form.modelo || !form.anoModelo} onClick={lookupFipe}>
                                {fipeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}
                              </Button>
                            </div>
                          </div>
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              Data da Consulta FIPE
                              <InfoTooltip text="Data da última consulta à tabela FIPE" />
                            </Label>
                            <Input type="date" value={form.dataFipe || ""} onChange={(e) => setForm({ ...form, dataFipe: e.target.value || null })} />
                          </div>
                        </div>

                        {!isFinanced && form.valorFipe != null && form.valorFipe > 0 && (
                          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                            <p className="text-xs text-foreground">
                              Usar valor FIPE (<span className="font-semibold">{formatBRL(form.valorFipe)}</span>) como valor de compra?
                            </p>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => setForm({ ...form, valorCompra: form.valorFipe })}>
                              Usar FIPE
                            </Button>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* SEÇÃO 3: Análise */}
                    <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Target className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Análise & Decisão</h3>
                          <p className="text-[11px] text-muted-foreground">Resultado operacional e estratégia</p>
                        </div>
                      </header>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              Lucro Operacional
                              <InfoTooltip text="Calculado automaticamente: receitas − despesas vinculadas a esta moto no módulo financeiro" />
                              <span className="ml-1 rounded bg-primary/10 text-primary text-[10px] font-medium px-1.5 py-0.5">auto</span>
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                              <Input className="pl-9 tabular-nums bg-muted/50 cursor-default" value={formatBRL(form.lucroOperacional ?? 0)} readOnly />
                            </div>
                          </div>
                          <div className="grid gap-1">
                            <Label className="flex items-center gap-1 text-xs">
                              Decisão
                              <InfoTooltip text="Recomendação sobre o que fazer com o veículo (opcional)" />
                            </Label>
                            <Select value={form.decisao || "none"} onValueChange={(v) => setForm({ ...form, decisao: v === "none" ? null : v as "manter" | "monitorar" | "avaliar_venda" })}>
                              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não definida</SelectItem>
                                <SelectItem value="manter">Manter</SelectItem>
                                <SelectItem value="monitorar">Monitorar</SelectItem>
                                <SelectItem value="avaliar_venda">Avaliar Venda</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {form.valorCompra && form.valorFipe ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div className={`rounded-lg p-3 ring-1 ${valorizacao != null && valorizacao >= 0 ? "bg-success/10 ring-success/20" : "bg-destructive/10 ring-destructive/20"}`}>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Valorização FIPE</div>
                              <div className={`text-lg font-bold tabular-nums ${valorizacao != null && valorizacao >= 0 ? "text-success" : "text-destructive"}`}>
                                {valorizacao != null && valorizacao >= 0 ? "+" : ""}{(valorizacao ?? 0).toFixed(1)}%
                              </div>
                            </div>
                            <div className="rounded-lg p-3 ring-1 bg-primary/10 ring-primary/20">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Retorno Total</div>
                              <div className="text-lg font-bold tabular-nums text-primary">
                                {formatBRL((form.valorFipe - form.valorCompra) + (form.lucroOperacional || 0))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic text-center py-1">
                            Preencha valor de compra e FIPE para ver o resumo patrimonial.
                          </p>
                        )}
                      </div>
                    </section>
                  </>
                );
              })()}

              {touched[3] && Object.keys(step3Errors).length > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">
                    {Object.keys(step3Errors).length} campo(s) com erro. Corrija para salvar.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 pt-2 border-t">
          <div>
            {step > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="text-muted-foreground">
                Pular etapa
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {step < STEPS.length ? (
              <Button size="sm" onClick={() => step === 1 ? setStep(2) : tryAdvance(step)} className="gap-1">
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} className="gap-1">
                <Check className="h-4 w-4" /> Salvar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Rastreador Manager */}
      <RastreadorManagerDialog
        open={rastreadorManagerOpen}
        onOpenChange={setRastreadorManagerOpen}
        items={rastreadores}
        onAdd={addRastreador}
        onRemove={removeRastreador}
        onRename={renameRastreador}
      />
    </Dialog>
  );
}
