import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
function entriesSignature(arr) {
  return arr.map(e => `${e.id}:${e.pago}:${e.valor}:${e.data}:${e.conta}`).join("|");
}
import { toast } from "sonner";
import { FinancialEntry, Motorcycle } from "@/lib/types";
import { loadFinancial, saveFinancial, loadMotos, saveMotos, loadClients, loadRentals, loadFinConfig, saveFinConfig, FinConfig } from "@/lib/store";
import { importSpreadsheetEntries } from "@/lib/import-spreadsheet";
import { resolveAllAssociations, resolveAssociations } from "@/lib/financial-associations";
import { auditCompraMotoEntry, shouldLockManualClassification } from "@/lib/financial-entry-audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Plus, Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  DollarSign, Pencil, Trash2, Calendar, Repeat, CheckCircle2, Circle,
  Fuel, Wrench, Shield, FileText, Car, Package, CreditCard, Wallet,
  PieChart as PieChartIcon, BarChart3, Settings2, HelpCircle,
  EyeOff, Pin, Tag as TagIcon, Check, ChevronsUpDown, Bookmark, AlertTriangle,
  MoreVertical, CheckCheck, Banknote, X, Eye, ChevronsLeft, ChevronsRight, ArrowLeftRight, ChevronDown,
  ExternalLink, Loader2, Link2, RefreshCw
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth, addMonths, addYears, addDays, addWeeks, subMonths, subDays, isSameMonth, parseISO, isWithinInterval } from "date-fns";
import { generateRecurrenceDates } from "@/lib/recurrence";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { BankIcon } from "@/components/BankLogos";
import { ptBR } from "date-fns/locale";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { getCompanyFeatureFlags } from "@/lib/companies";
import { useCompany } from "@/contexts/CompanyContext";
import { ImportExportBar } from "@/components/ImportExportBar";
import { useBankAccounts } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { reconcileCardInvoices, getCardInvoicesList, computeCardInvoiceYm } from "@/lib/credit-card-invoices";
import { calculateAccountBalances } from "@/lib/account-balances";
import { usePermissions } from "@/hooks/usePermissions";

// ─── Label → Internal value mapping for imported data ───
import {
  CATEGORY_LABEL_TO_VALUE,
  CATEGORY_LABEL_TO_VALUE_DESPESA,
  CATEGORY_SIBLINGS,
  DEFAULT_CATEGORIAS,
  DEFAULT_SUBCATEGORIAS,
  DEFAULT_TAGS,
  CATEGORY_COLORS,
} from "@/lib/financeiro-constants";
function normalizeCategoryValue(label: string, tipo: "receita" | "despesa"): string {
  if (tipo === "despesa" && CATEGORY_LABEL_TO_VALUE_DESPESA[label]) return CATEGORY_LABEL_TO_VALUE_DESPESA[label];
  return CATEGORY_LABEL_TO_VALUE[label] || label;
}

function applyCompraMotoCorrections(entries: FinancialEntry[], motos: Motorcycle[] = []) {
  let changed = false;
  const normalized = entries.map(entry => {
    const next = auditCompraMotoEntry(entry, motos, normalizeCategoryValue(entry.categoria, entry.tipo));
    if (next !== entry) changed = true;
    return next;
  });
  return { entries: normalized, changed };
}


function normalizeImportText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildImportReconciliationKey(entry: FinancialEntry) {
  return [
    entry.data || "",
    Number(entry.valor || 0).toFixed(2),
    normalizeImportText(entry.descricao),
    normalizeImportText(entry.tipo),
    normalizeImportText(entry.conta),
    normalizeImportText(entry.placa),
    normalizeImportText(entry.clienteNome),
    normalizeImportText(entry.categoria),
    normalizeImportText(entry.subcategoria),
    normalizeImportText(entry.natureza),
  ].join("|");
}

const emptyEntry = (): FinancialEntry => ({
  id: crypto.randomUUID(), tipo: "receita", categoria: "", subcategoria: "", descricao: "",
  valor: 0, data: new Date().toISOString().split("T")[0], dataPrevista: "",
  motoId: null, rentalId: null, clienteId: null, pago: true,
  recorrente: false, recorrenciaTipo: "mensal", recorrenciaVezes: 1, recorrenciaPorPeriodo: 1,
  despesaFixa: false, ignorada: false, observacao: "", tags: [],
  conta: "", natureza: "operacional",
});

// ─── Helper: tooltip label ───
function CompBadge({ current, previous, label, positiveIsGood }: { current: number; previous: number; label: string; positiveIsGood: boolean }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pct = previous !== 0 ? ((diff / Math.abs(previous)) * 100) : (current > 0 ? 100 : -100);
  const isPositive = diff > 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded ${isGood ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isPositive ? "+" : ""}{pct.toFixed(1)}%
      </span>
      <span className="text-[10px] text-muted-foreground">vs {label}</span>
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Section wrapper for form ───
function FormSection({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3 ${className || ""}`}>
      {title && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>}
      {children}
    </div>
  );
}

// ─── Searchable Combobox ───
function SearchableSelect({
  value, onValueChange, options, placeholder = "Selecione...", disabled = false, icon: IconComp,
}: {
  value: string; onValueChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ElementType }[];
  placeholder?: string; disabled?: boolean; icon?: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          className="w-full justify-between h-9 font-normal text-sm">
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                {selected.icon && <selected.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {selected.label}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" onWheel={e => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Buscar..." className="h-9" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {options.map(o => {
                const OptIcon = o.icon;
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => { onValueChange(o.value); setOpen(false); }}>
                    <div className="flex items-center gap-2 flex-1">
                      {OptIcon && <OptIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span>{o.label}</span>
                    </div>
                    {value === o.value && <Check className="h-4 w-4 text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Grouped Category + Subcategory Select ───
function GroupedCategorySelect({
  categorias, subcategorias, selectedCategoria, selectedSubcategoria, onSelect,
}: {
  categorias: { value: string; label: string; icon?: React.ElementType }[];
  subcategorias: Record<string, string[]>;
  selectedCategoria: string;
  selectedSubcategoria: string;
  onSelect: (cat: string, sub: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    const cat = categorias.find(c => c.value === selectedCategoria);
    if (!cat) return null;
    if (selectedSubcategoria) return `${cat.label} › ${selectedSubcategoria}`;
    return cat.label;
  }, [categorias, selectedCategoria, selectedSubcategoria]);

  const SelectedIcon = categorias.find(c => c.value === selectedCategoria)?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between h-9 font-normal text-sm">
          <span className="flex items-center gap-2 truncate">
            {selectedLabel ? (
              <>
                {SelectedIcon && <SelectedIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {selectedLabel}
              </>
            ) : (
              <span className="text-muted-foreground">Buscar categoria...</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" onWheel={e => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Buscar..." className="h-9" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {categorias.map(cat => {
                const subs = subcategorias[cat.value] || [];
                const CatIcon = cat.icon;
                return (
                  <React.Fragment key={cat.value}>
                    <CommandItem
                      value={cat.label}
                      onSelect={() => { onSelect(cat.value, ""); setOpen(false); }}
                      className="font-medium"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {CatIcon && <CatIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span>{cat.label}</span>
                      </div>
                      {selectedCategoria === cat.value && !selectedSubcategoria && <Check className="h-4 w-4 text-primary" />}
                    </CommandItem>
                    {subs.map(sub => (
                      <CommandItem
                        key={`${cat.value}-${sub}`}
                        value={`${cat.label} ${sub}`}
                        onSelect={() => { onSelect(cat.value, sub); setOpen(false); }}
                        className="pl-8 text-muted-foreground"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs">↳</span>
                          <span>{sub}</span>
                        </div>
                        {selectedCategoria === cat.value && selectedSubcategoria === sub && <Check className="h-4 w-4 text-primary" />}
                      </CommandItem>
                    ))}
                  </React.Fragment>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Normalize for similarity check ───
function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function isSimilar(a: string, b: string) {
  const na = normalize(a), nb = normalize(b);
  return na === nb;
}

// ─── Inline List Manager ───
function ListManagerDialog({
  open, onOpenChange, title, items,
  onAdd, onRemove, onRename,
  crossCheckItems,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string;
  items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; onRename: (old: string, next: string) => void;
  crossCheckItems?: { label: string; location: string }[];
}) {
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string>("__blank__");
  const [duplicateWarning, setDuplicateWarning] = useState("");

  const checkDuplicate = (value: string, exclude?: string): string | null => {
    const match = items.find(i => i !== exclude && isSimilar(i, value));
    if (match) return `Já existe nesta lista: "${match}"`;
    if (crossCheckItems) {
      const cross = crossCheckItems.find(c => isSimilar(c.label, value));
      if (cross) return `Já existe em: ${cross.location}`;
    }
    return null;
  };

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    const dup = checkDuplicate(trimmed);
    if (dup) { setDuplicateWarning(dup); return; }
    onAdd(trimmed);
    setNewItem("");
    setDuplicateWarning("");
  };

  const handleRename = (old: string, next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === old) { setEditingIdx(null); return; }
    const dup = checkDuplicate(trimmed, old);
    if (dup) { setDuplicateWarning(dup); return; }
    onRename(old, trimmed);
    setEditingIdx(null);
    setDuplicateWarning("");
  };

  const confirmDelete = () => {
    if (!deletingItem) return;
    if (redirectTo === "__blank__") {
      onRemove(deletingItem);
    } else {
      onRename(deletingItem, redirectTo);
    }
    setDeletingItem(null);
    setRedirectTo("__blank__");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setDuplicateWarning(""); setDeletingItem(null); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" />{title}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Ao remover ou renomear, os lançamentos existentes serão atualizados automaticamente.
        </p>

        {duplicateWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
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
            <p className="text-xs text-muted-foreground">
              Os lançamentos com este item serão redirecionados para:
            </p>
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
            <Input placeholder="Novo item..." value={newItem}
              onChange={e => { setNewItem(e.target.value); setDuplicateWarning(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} />
            <Button size="sm" disabled={!newItem.trim()} onClick={handleAdd} className="gap-1 shrink-0">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
            {[...items].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((item) => {
              const idx = items.indexOf(item);
              return (
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
              );
            })}
            {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum item cadastrado</p>}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">{items.length} {items.length === 1 ? "item" : "itens"}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Category manager with inline subcategory management */
function CategoryManagerDialog({
  open, onOpenChange, title, tipo,
  categorias, subcategorias,
  onAddCat, onRemoveCat, onRenameCat,
  onMigrateCat,
  onAddSubcat, onRemoveSubcat, onRenameSubcat,
  onMigrateSubcat,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string;
  tipo: "receita" | "despesa";
  categorias: { value: string; label: string }[];
  subcategorias: Record<string, string[]>;
  onAddCat: (label: string) => void;
  onRemoveCat: (label: string, catValue: string) => void;
  onRenameCat: (old: string, next: string) => void;
  onMigrateCat: (oldLabel: string, targetLabel: string, oldCatValue: string) => void;
  onAddSubcat: (catValue: string, item: string) => void;
  onRemoveSubcat: (catValue: string, item: string) => void;
  onRenameSubcat: (catValue: string, old: string, next: string) => void;
  onMigrateSubcat: (catValue: string, oldLabel: string, targetLabel: string) => void;
}) {
  const [newCat, setNewCat] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [newSubcat, setNewSubcat] = useState("");
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingSubcat, setEditingSubcat] = useState<{ cat: string; sub: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingItem, setDeletingItem] = useState<{ type: "cat" | "sub"; catValue: string; label: string } | null>(null);
  const [redirectTo, setRedirectTo] = useState("__blank__");
  const [warning, setWarning] = useState("");

  const allCatLabels = categorias.map(c => c.label);

  const handleAddCat = () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    const dup = allCatLabels.find(l => isSimilar(l, trimmed));
    if (dup) { setWarning(`Já existe: "${dup}"`); return; }
    onAddCat(trimmed);
    setNewCat("");
    setWarning("");
  };

  const handleRenameCat = () => {
    if (!editingCat || !editValue.trim() || editValue.trim() === editingCat) { setEditingCat(null); return; }
    const dup = allCatLabels.find(l => l !== editingCat && isSimilar(l, editValue.trim()));
    if (dup) { setWarning(`Já existe: "${dup}"`); return; }
    onRenameCat(editingCat, editValue.trim());
    setEditingCat(null);
    setWarning("");
  };

  const handleAddSubcat = (catValue: string) => {
    const trimmed = newSubcat.trim();
    if (!trimmed) return;
    const existing = subcategorias[catValue] || [];
    const dup = existing.find(s => isSimilar(s, trimmed));
    if (dup) { setWarning(`Já existe: "${dup}"`); return; }
    onAddSubcat(catValue, trimmed);
    setNewSubcat("");
    setWarning("");
  };

  const handleRenameSubcat = () => {
    if (!editingSubcat || !editValue.trim()) { setEditingSubcat(null); return; }
    if (editValue.trim() === editingSubcat.sub) { setEditingSubcat(null); return; }
    onRenameSubcat(editingSubcat.cat, editingSubcat.sub, editValue.trim());
    setEditingSubcat(null);
    setWarning("");
  };

  const confirmDelete = () => {
    if (!deletingItem) return;
    if (deletingItem.type === "cat") {
      if (redirectTo !== "__blank__") {
        onMigrateCat(deletingItem.label, redirectTo, deletingItem.catValue);
      } else {
        onRemoveCat(deletingItem.label, deletingItem.catValue);
      }
    } else {
      if (redirectTo !== "__blank__") {
        onMigrateSubcat(deletingItem.catValue, deletingItem.label, redirectTo);
      } else {
        onRemoveSubcat(deletingItem.catValue, deletingItem.label);
      }
    }
    setDeletingItem(null);
    setRedirectTo("__blank__");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setWarning(""); setDeletingItem(null); setExpandedCat(null); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />{title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Gerencie categorias e subcategorias. Clique em uma categoria para expandir suas subcategorias.
        </p>

        {warning && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />{warning}
          </div>
        )}

        {deletingItem && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Remover {deletingItem.type === "cat" ? "categoria" : "subcategoria"} "<span className="text-destructive font-semibold">{deletingItem.label}</span>"?
            </p>
            <p className="text-xs text-muted-foreground">Os lançamentos serão redirecionados para:</p>
            <Select value={redirectTo} onValueChange={setRedirectTo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__blank__">Deixar em branco</SelectItem>
                {deletingItem.type === "cat"
                  ? allCatLabels.filter(l => l !== deletingItem.label).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)
                  : (subcategorias[deletingItem.catValue] || []).filter(s => s !== deletingItem.label).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                }
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
          {/* Add category */}
          <div className="flex gap-2">
            <Input placeholder="Nova categoria..." value={newCat}
              onChange={e => { setNewCat(e.target.value); setWarning(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleAddCat(); }} />
            <Button size="sm" disabled={!newCat.trim()} onClick={handleAddCat} className="gap-1 shrink-0">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          {/* Category list */}
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {categorias.map((cat) => {
              const subs = subcategorias[cat.value] || [];
              const isExpanded = expandedCat === cat.value;
              return (
                <div key={cat.value} className="border rounded-lg overflow-hidden">
                  {/* Category row */}
                  <div className="flex items-center gap-2 group px-3 py-2 hover:bg-muted/50 transition-colors">
                    {editingCat === cat.label ? (
                      <>
                        <Input className="h-8 text-sm flex-1" value={editValue}
                          onChange={e => { setEditValue(e.target.value); setWarning(""); }}
                          onKeyDown={e => { if (e.key === "Enter") handleRenameCat(); }} autoFocus />
                        <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleRenameCat}>
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditingCat(null); setWarning(""); }}>
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          className="flex items-center gap-2 flex-1 text-left"
                          onClick={() => setExpandedCat(isExpanded ? null : cat.value)}
                        >
                          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                          <span className="text-sm font-medium text-foreground">{cat.label}</span>
                          {subs.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">({subs.length} sub)</span>
                          )}
                        </button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setEditingCat(cat.label); setEditValue(cat.label); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setDeletingItem({ type: "cat", catValue: cat.value, label: cat.label }); setRedirectTo("__blank__"); }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Subcategories (expanded) */}
                  {isExpanded && (
                    <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
                      <div className="flex gap-2">
                        <Input placeholder="Nova subcategoria..." className="h-8 text-sm" value={newSubcat}
                          onChange={e => { setNewSubcat(e.target.value); setWarning(""); }}
                          onKeyDown={e => { if (e.key === "Enter") handleAddSubcat(cat.value); }} />
                        <Button size="sm" variant="outline" disabled={!newSubcat.trim()} onClick={() => handleAddSubcat(cat.value)} className="h-8 gap-1 shrink-0 text-xs">
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </div>
                      {subs.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1">Nenhuma subcategoria</p>
                      )}
                      {subs.map((sub) => (
                        <div key={sub} className="flex items-center gap-2 group/sub pl-4 py-1 rounded hover:bg-muted/50">
                          {editingSubcat?.cat === cat.value && editingSubcat?.sub === sub ? (
                            <>
                              <Input className="h-7 text-xs flex-1" value={editValue}
                                onChange={e => { setEditValue(e.target.value); setWarning(""); }}
                                onKeyDown={e => { if (e.key === "Enter") handleRenameSubcat(); }} autoFocus />
                              <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleRenameSubcat}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setEditingSubcat(null); setWarning(""); }}>
                                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="h-1.5 w-1.5 rounded-full bg-primary/30 shrink-0" />
                              <span className="text-xs flex-1 text-foreground">{sub}</span>
                              <Button size="sm" variant="ghost" className="h-6 w-6 opacity-0 group-hover/sub:opacity-100"
                                onClick={() => { setEditingSubcat({ cat: cat.value, sub }); setEditValue(sub); }}>
                                <Pencil className="h-2.5 w-2.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 opacity-0 group-hover/sub:opacity-100"
                                onClick={() => { setDeletingItem({ type: "sub", catValue: cat.value, label: sub }); setRedirectTo("__blank__"); }}>
                                <Trash2 className="h-2.5 w-2.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {categorias.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhuma categoria</p>}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">{categorias.length} {categorias.length === 1 ? "categoria" : "categorias"}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FinanceiroPage() {
  const { activeCompany } = useCompany();
  const currentCompanyId = activeCompany.id;
  const { canCreate, canEdit, canDelete } = usePermissions();

  // IDs de faturas auto-geradas que o usuário excluiu explicitamente. Persistidos em
  // localStorage para sobreviver a navegação e não serem recriados pelo reconcile.
  const suppressedInvoiceIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`wayvo:suppressed-invoices:${currentCompanyId}`);
      suppressedInvoiceIdsRef.current = raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { suppressedInvoiceIdsRef.current = new Set(); }
  }, [currentCompanyId]);

  // Chaves "baseId::data" de ocorrências recorrentes que o usuário excluiu explicitamente.
  // Persistidas para que o auto-materialize não as recrie após a deleção.
  const deletedOccurrencesRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`wayvo:deleted-occurrences:${currentCompanyId}`);
      deletedOccurrencesRef.current = raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { deletedOccurrencesRef.current = new Set(); }
  }, [currentCompanyId]);

  const { applyCompraMotoCorrections: shouldCorrectCompraMoto, filterImportedEntries } =
    getCompanyFeatureFlags(currentCompanyId);
  const cache = useDataCacheSnapshot();
  const liveMotos = cache.motos;
  const liveClients = cache.clients;
  const liveRentals = cache.rentals;

  const [entries, setEntries] = useState<FinancialEntry[]>(() => {
    const existingFinancial = loadFinancial();
    if (existingFinancial.length === 0) return [];
    const allMotos = liveMotos.length ? liveMotos : loadMotos();
    const allClients = liveClients.length ? liveClients : loadClients();
    const allRentals = liveRentals.length ? liveRentals : loadRentals();

    if (filterImportedEntries) {
      const cleaned = existingFinancial.filter(e => !e.id.startsWith("imp_"));
      if (cleaned.length !== existingFinancial.length) {
        return cleaned.map(e => ({ ...e, pago: e.pago ?? true, conta: e.conta || "" }));
      }
    }
    let data: FinancialEntry[] = existingFinancial.map(e => ({ ...e, pago: e.pago ?? true, conta: e.conta || "" }));

    const associationCtx = { motos: allMotos, clients: allClients, rentals: allRentals };
    const reassociated = resolveAllAssociations(
      data,
      associationCtx,
    ).map(e => ({ ...e, pago: e.pago ?? true, conta: e.conta || "" }));

    data = reassociated;

    if (shouldCorrectCompraMoto) {
      const compraMotoCorrection = applyCompraMotoCorrections(data, allMotos);
      data = compraMotoCorrection.entries;
    }

    return data;
  });
  const motos = liveMotos;
  const clients = liveClients;
  const rentals = liveRentals;

  // Reset imediato ao trocar de empresa para evitar dados obsoletos renderizando
  useEffect(() => {
    setEntries([]);
  }, [currentCompanyId]);

  useEffect(() => {
    if (!cache.initialized) return;

    const normalizedEntries = cache.financial.map(e => ({
      ...e,
      pago: e.pago ?? true,
      conta: e.conta || "",
    }));

    const associationCtx = { motos: liveMotos, clients: liveClients, rentals: liveRentals };
    let nextEntries = resolveAllAssociations(
      normalizedEntries,
      associationCtx,
    ).map(e => ({ ...e, pago: e.pago ?? true, conta: e.conta || "" }));

    if (shouldCorrectCompraMoto) {
      const corrected = applyCompraMotoCorrections(nextEntries, liveMotos);
      nextEntries = corrected.entries as typeof nextEntries;
    }

    setEntries((prev) => entriesSignature(prev) === entriesSignature(nextEntries) ? prev : nextEntries);
  }, [cache.initialized, cache.financial, liveMotos, liveClients, liveRentals, currentCompanyId]);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [customRangeMode, setCustomRangeMode] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"all" | "receita" | "despesa">("all");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("all");
  const [contaFilter, setContaFilter] = useState<string>("all");
  const [pagoFilter, setPagoFilter] = useState<"all" | "pago" | "pendente">("all");
  const [placaFilter, setPlacaFilter] = useState("");
  const [locatarioFilter, setLocatarioFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyPagas, setOnlyPagas] = useState(false);
  const [onlyPendentes, setOnlyPendentes] = useState(false);
  const [onlyRecorrentes, setOnlyRecorrentes] = useState(false);
  const [dueFilter, setDueFilter] = useState<"all" | "atrasadas" | "hoje" | "amanha">("all");
  const [ignoradasFilter, setIgnoradasFilter] = useState<"incluir" | "ocultar" | "somente">("incluir");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FinancialEntry>(emptyEntry());
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferValor, setTransferValor] = useState("");
  const [transferData, setTransferData] = useState(new Date().toISOString().split("T")[0]);
  const [transferObs, setTransferObs] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [advCardId, setAdvCardId] = useState("");
  const [advAmount, setAdvAmount] = useState("");
  const [advDate, setAdvDate] = useState(new Date().toISOString().split("T")[0]);
  const [advBank, setAdvBank] = useState("");
  const [advNote, setAdvNote] = useState("");
  const [activeTab, setActiveTab] = useState("transacoes");
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCCCard, setSelectedCCCard] = useState<any>(null);
  const [ccViewYm, setCcViewYm] = useState<string>("");

  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollTableToTop = useCallback(() => {
    requestAnimationFrame(() => {
      tableContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const scrollToEntryRow = useCallback((entryId: string) => {
    // Aguarda render para garantir que a linha foi adicionada ao DOM
    setTimeout(() => {
      const el = document.getElementById(`entry-row-${entryId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
      } else {
        tableContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);
  }, []);

  const focusImportedPeriod = useCallback((importedEntries: FinancialEntry[]) => {
    const validDates = importedEntries
      .map((entry) => {
        try {
          return parseISO(entry.data);
        } catch {
          return null;
        }
      })
      .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (!validDates.length) return;

    const from = validDates[0];
    const to = validDates[validDates.length - 1];

    if (isSameMonth(from, to)) {
      setCustomRangeMode(false);
      setCustomFrom(undefined);
      setCustomTo(undefined);
      setCurrentMonth(from);
      return;
    }

    setCustomFrom(from);
    setCustomTo(to);
    setCustomRangeMode(true);
  }, []);

  // Custom config
  const [finConfig, setFinConfig] = useState<FinConfig>(loadFinConfig);
  const [managerOpen, setManagerOpen] = useState<null | "cat_receita" | "cat_despesa" | "subcat" | "tags">(null);
  const [subcatTarget, setSubcatTarget] = useState("");
  const [confirmToggleEntry, setConfirmToggleEntry] = useState<FinancialEntry | null>(null);
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmConta, setConfirmConta] = useState("");
  const [confirmValor, setConfirmValor] = useState("");
  const [confirmPayBank, setConfirmPayBank] = useState("");
  const [rentalPaySuccess, setRentalPaySuccess] = useState<{
    nome: string; telefone: string;
    vencimento: string; pagamento: string;
    valor: number; periodoLabel: string; mensagem: string;
  } | null>(null);
  const [detailEntry, setDetailEntry] = useState<FinancialEntry | null>(null);

  // Fecha o Sheet de detalhe automaticamente quando a entrada for removida de entries
  // (evita o overlay do Sheet bloquear cliques no AlertDialog de exclusão).
  useEffect(() => {
    if (detailEntry && !entries.find(e => e.id === detailEntry.id)) {
      setDetailEntry(null);
    }
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistConfig = useCallback((c: FinConfig) => { setFinConfig(c); saveFinConfig(c); }, []);

  // Merge default + custom categories
  const CATEGORIAS = useMemo(() => {
    const sortWithOutrosLast = (arr: typeof DEFAULT_CATEGORIAS.receita) => {
      const outros = arr.filter(c => c.value.startsWith("outro_"));
      const rest = arr.filter(c => !c.value.startsWith("outro_"));
      return [...rest.sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), ...outros];
    };
    const removedReceita = new Set(finConfig.removedDefaults?.receita || []);
    const removedDespesa = new Set(finConfig.removedDefaults?.despesa || []);
    return {
      receita: sortWithOutrosLast([
        ...DEFAULT_CATEGORIAS.receita.filter(c => !removedReceita.has(c.value)),
        ...finConfig.customCategorias.receita.map(c => ({ ...c, icon: DollarSign })),
      ]),
      despesa: sortWithOutrosLast([
        ...DEFAULT_CATEGORIAS.despesa.filter(c => !removedDespesa.has(c.value)),
        ...finConfig.customCategorias.despesa.map(c => ({ ...c, icon: DollarSign })),
      ]),
    };
  }, [finConfig]);

  // Merge default + custom subcategories
  const SUBCATEGORIAS = useMemo(() => {
    const merged = { ...DEFAULT_SUBCATEGORIAS };
    // Filter out removed default subcategories
    const removedSubs = finConfig.removedSubcategorias || {};
    Object.entries(removedSubs).forEach(([k, removed]) => {
      if (Array.isArray(removed) && merged[k]) {
        merged[k] = merged[k].filter(s => !(removed as string[]).includes(s));
      }
    });
    Object.entries(finConfig.customSubcategorias).forEach(([k, v]) => {
      const sanitized = v.filter(s => s !== "Financiamento/Parcelamento");
      merged[k] = [...(merged[k] || []), ...sanitized.filter(s => !(merged[k] || []).includes(s))];
    });
    if (merged.compra_moto) {
      merged.compra_moto = merged.compra_moto.filter(s => s !== "Financiamento/Parcelamento");
    }
    // Subcategorias de manutenção são estruturais — sempre presentes independente do finConfig
    for (const key of ["manutencao_receita", "manutencao_despesa"] as const) {
      merged[key] = [...new Set([...(merged[key] || []), "Corretiva", "Preventiva"])];
    }
    // Sort all subcategories alphabetically
    Object.keys(merged).forEach(k => { merged[k] = merged[k].sort((a, b) => a.localeCompare(b, "pt-BR")); });
    return merged;
  }, [finConfig]);

  const { data: bankAccountsList } = useBankAccounts();
  const creditCards = useMemo(() => (bankAccountsList || []).filter(a => a.tipo === "cartao"), [bankAccountsList]);
  const CONTAS = useMemo(() => {
    return (bankAccountsList || []).map(a => a.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bankAccountsList]);
  const selectedCard = useMemo(() => creditCards.find(c => c.nome === form.conta), [creditCards, form.conta]);
  const [parcelas, setParcelas] = useState<number>(1);

  // Merge default + custom tags per category
  const TAGS = useMemo(() => {
    const merged = { ...DEFAULT_TAGS };
    // Filter out removed default tags
    const removedTags = finConfig.removedTags || {};
    Object.entries(removedTags).forEach(([k, removed]) => {
      if (Array.isArray(removed) && merged[k]) {
        merged[k] = merged[k].filter(t => !(removed as string[]).includes(t));
      }
    });
    const custom = finConfig.customTags;
    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
      Object.entries(custom).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          merged[k] = [...(merged[k] || []), ...v.filter(s => !(merged[k] || []).includes(s))];
        }
      });
    }
    // Sort all tags alphabetically
    Object.keys(merged).forEach(k => { merged[k] = merged[k].sort((a, b) => a.localeCompare(b, "pt-BR")); });
    return merged;
  }, [finConfig]);

  // Tags da categoria selecionada: união das tags do nível categoria
  // + tags de TODAS as subcategorias daquela categoria (sem duplicar).
  const activeTags = useMemo(() => {
    if (!form.categoria) return [];
    const merged: string[] = [];
    const add = (list?: string[]) => {
      (list || []).forEach(t => { if (!merged.includes(t)) merged.push(t); });
    };
    add(TAGS[form.categoria]);
    const prefix = `${form.categoria}:`;
    Object.keys(TAGS).forEach(key => {
      if (key.startsWith(prefix)) add(TAGS[key]);
    });
    return merged.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [TAGS, form.categoria]);

  const motoSelectOptions = useMemo(() => {
    const base = [{ value: "none", label: "Nenhum" }, ...motos.map(m => ({ value: m.id, label: m.placa })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))];
    const hasCurrentMoto = !!form.motoId && motos.some(m => m.id === form.motoId);
    if (!hasCurrentMoto && form.placa) {
      return [{ value: `legacy-placa:${form.placa}`, label: `${form.placa} (sem vínculo)` }, ...base];
    }
    return base;
  }, [motos, form.motoId, form.placa]);

  const motoSelectValue = useMemo(() => {
    const hasCurrentMoto = !!form.motoId && motos.some(m => m.id === form.motoId);
    if (hasCurrentMoto && form.motoId) return form.motoId;
    if (form.placa) return `legacy-placa:${form.placa}`;
    return "none";
  }, [motos, form.motoId, form.placa]);

  const clienteSelectOptions = useMemo(() => {
    const base = [{ value: "none", label: "Nenhum" }, ...clients.map(c => ({ value: c.id, label: c.nome })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))];
    const hasCurrentCliente = !!form.clienteId && clients.some(c => c.id === form.clienteId);
    if (!hasCurrentCliente && form.clienteNome) {
      return [{ value: `legacy-cliente:${form.clienteNome}`, label: `${form.clienteNome} (sem vínculo)` }, ...base];
    }
    return base;
  }, [clients, form.clienteId, form.clienteNome]);

  const clienteSelectValue = useMemo(() => {
    const hasCurrentCliente = !!form.clienteId && clients.some(c => c.id === form.clienteId);
    if (hasCurrentCliente && form.clienteId) return form.clienteId;
    if (form.clienteNome) return `legacy-cliente:${form.clienteNome}`;
    return "none";
  }, [clients, form.clienteId, form.clienteNome]);

  const getCatLabel = useCallback((value: string, tipo: "receita" | "despesa") => {
    return (CATEGORIAS[tipo] || []).find(c => c.value === value)?.label || value;
  }, [CATEGORIAS]);

  const getCatIcon = useCallback((value: string, tipo: "receita" | "despesa") => {
    return (CATEGORIAS[tipo] || []).find(c => c.value === value)?.icon || DollarSign;
  }, [CATEGORIAS]);

  const persist = useCallback(async (d: FinancialEntry[]) => {
    // Guard global: despesa operacional NUNCA pode ser salva sem placa/veículo.
    const prevById = new Map(entries.map(e => [e.id, e]));
    const isBad = (e: FinancialEntry) =>
      e.tipo === "despesa" &&
      e.natureza === "operacional" &&
      !e.motoId &&
      !(e.placa && String(e.placa).trim());
    const newlyBad = d.find(e => {
      if (!isBad(e)) return false;
      const prev = prevById.get(e.id);
      if (!prev) return true;
      return !isBad(prev);
    });
    if (newlyBad) {
      const msg = "Despesa operacional precisa ter placa/veículo associado.";
      toast.error(msg);
      throw new Error(msg);
    }
    setEntries(d);
    try {
      await saveFinancial(d);
    } catch (err) {
      // Rollback: restaura o estado local se o save falhar
      setEntries(entries);
      throw err;
    }
  }, [entries]);

  const persistWithFeedback = useCallback(async (d: FinancialEntry[], options?: { successMessage?: string }) => {
    setIsSaving(true);
    try {
      await persist(d);
      setLastSaveAt(new Date().toISOString());
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }
      return true;
    } catch (error) {
      console.error("Erro ao persistir lançamentos financeiros:", error);
      toast.error("Não foi possível salvar o lançamento.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [persist]);

  const ASAAS_TERMINAL = ["RECEIVED", "CANCELLED", "REFUNDED", "REFUND_REQUESTED"];

  const syncAsaasPayment = useCallback(async (updated: FinancialEntry, original: FinancialEntry) => {
    if (!updated.asaasPaymentId) return;
    if (updated.pago) return;
    if (ASAAS_TERMINAL.includes(updated.asaasStatus || "")) return;
    const dateChanged = updated.data !== original.data;
    const valueChanged = updated.valor !== original.valor;
    if (!dateChanged && !valueChanged) return;
    const body: Record<string, unknown> = { asaasPaymentId: updated.asaasPaymentId, companyId: currentCompanyId };
    if (dateChanged) body.dueDate = updated.data;
    if (valueChanged) body.value = updated.valor;
    const { error } = await supabase.functions.invoke("asaas-update-payment", { body });
    if (error) toast.warning("Salvo localmente, mas não foi possível atualizar o boleto no Asaas.");
  }, [currentCompanyId]);

  const syncAsaasChanges = useCallback(async (updatedList: FinancialEntry[], originalList: FinancialEntry[]) => {
    const origById = new Map(originalList.map(e => [e.id, e]));
    await Promise.allSettled(
      updatedList
        .filter(e => !!e.asaasPaymentId && !ASAAS_TERMINAL.includes(e.asaasStatus || ""))
        .map(e => {
          const orig = origById.get(e.id);
          if (!orig) return Promise.resolve();
          return syncAsaasPayment(e, orig);
        }),
    );
  }, [syncAsaasPayment]);

  const cancelAsaasPayments = useCallback(async (toDelete: FinancialEntry[]) => {
    const cancellable = toDelete.filter(
      e => !!e.asaasPaymentId && !e.pago && !ASAAS_TERMINAL.includes(e.asaasStatus || ""),
    );
    if (cancellable.length === 0) return;
    const results = await Promise.allSettled(
      cancellable.map(e =>
        supabase.functions.invoke("asaas-cancel-payment", { body: { asaasPaymentId: e.asaasPaymentId, companyId: currentCompanyId } }),
      ),
    );
    const failures = results.filter(r => r.status === "fulfilled" && r.value.error);
    if (failures.length > 0) {
      let detail = "";
      try {
        const err = (failures[0] as PromiseFulfilledResult<{ data: unknown; error: { context?: Response; message?: string } }>).value.error;
        const body = await err.context?.json?.();
        detail = body?.error ?? "";
      } catch { /* ignora */ }
      toast.warning(`${failures.length} boleto(s) não puderam ser cancelados no Asaas${detail ? `: ${detail}` : ""}`);
    }
  }, [currentCompanyId]);

  // Migration now handled centrally in loadFinancial()

  // ─── Reconcile credit-card invoices ────────────────────────────
  // Whenever despesas posted to a credit-card account change, regenerate the
  // pending "Pagamento de fatura" entries (one per card per month of due date).
  const lastInvoiceSigRef = useRef<string>("");
  useEffect(() => {
    if (!bankAccountsList || bankAccountsList.length === 0) return;
    const cards = bankAccountsList.filter((a: any) => a.tipo === "cartao");
    if (cards.length === 0) return;
    // Build a lightweight signature of inputs to avoid redundant work.
    const sig = JSON.stringify({
      cards: cards.map((c: any) => [c.id, c.nome, c.diaVencimento, c.contaPagamento]),
      ents: entries
        .filter(e => e.tipo === "despesa" && cards.some((c: any) => c.nome === e.conta))
        .map(e => [e.id, e.valor, e.data, e.dataPrevista, e.conta, e.ignorada]),
      inv: entries.filter(e => e.categoria === "fatura_cartao").map(e => [e.id, e.valor, e.pago, e.conta, e.dataPrevista]),
    });
    if (sig === lastInvoiceSigRef.current) return;
    lastInvoiceSigRef.current = sig;
    const next = reconcileCardInvoices(entries, cards as any, suppressedInvoiceIdsRef.current);
    if (JSON.stringify(next) !== JSON.stringify(entries)) {
      persist(next).catch(err => console.error("[fatura-cartao] reconcile failed", err));
    }
  }, [entries, bankAccountsList, persist]);

  const getRecurringDate = useCallback((baseDateStr: string, tipo: FinancialEntry["recorrenciaTipo"], step: number) => {
    const baseDate = parseISO(baseDateStr);
    let nextDate: Date;
    switch (tipo) {
      case "diario": nextDate = addDays(baseDate, step); break;
      case "semanal": nextDate = addWeeks(baseDate, step); break;
      case "anual": nextDate = addYears(baseDate, step); break;
      default: nextDate = addMonths(baseDate, step); break;
    }
    return format(nextDate, "yyyy-MM-dd");
  }, []);

  // Auto-materialize fixed and recurring entries so future months always show up
  React.useEffect(() => {
    const bases = entries.filter(e => !e.fixedOriginId && (e.recorrente || e.despesaFixa));
    if (!bases.length) return;

    const nextEntries = [...entries];
    let changed = false;

    bases.forEach(base => {
      const seedDate = base.dataPrevista || base.data;
      const seriesId = base.serieId || base.id;
      const totalOccurrences = base.despesaFixa ? 24 : Math.max(base.recorrenciaVezes || 0, 0);
      const interval = Math.max(1, base.recorrenciaPorPeriodo || 1);
      const occurrenceDates = generateRecurrenceDates(
        seedDate,
        (base.recorrenciaTipo || "mensal") as any,
        totalOccurrences,
        interval,
      );

      for (const occurrenceDate of occurrenceDates) {
        // 0) ocorrência que o usuário excluiu explicitamente → nunca recriar
        if (deletedOccurrencesRef.current.has(`${base.id}::${occurrenceDate}`)) continue;

        // 1) já existe ocorrência na série para essa data?
        const seriesIdx = nextEntries.findIndex(entry => {
          if (entry.id === base.id) return false;
          const entryEffDate = entry.dataPrevista || entry.data;
          return (entry.fixedOriginId === base.id || entry.serieId === seriesId) && entryEffDate === occurrenceDate;
        });
        if (seriesIdx >= 0) continue;

        // 2) existe um lançamento "irmão" pré-existente (gerado por outro fluxo,
        //    ex.: cobrança de aluguel pelo wizard) que bate com essa ocorrência?
        //    Critério SEM descrição/conta: mesmo tipo, categoria, valor, data e
        //    moto/cliente. Se sim, adota-o na série em vez de duplicar.
        const adoptIdx = nextEntries.findIndex(entry => {
          if (entry.id === base.id) return false;
          if (entry.fixedOriginId || entry.serieId) return false;
          const entryEffDate = entry.dataPrevista || entry.data;
          if (entryEffDate !== occurrenceDate) return false;
          if (entry.tipo !== base.tipo) return false;
          if (normalizeCategoryValue(entry.categoria, entry.tipo) !== normalizeCategoryValue(base.categoria, base.tipo)) return false;
          if (entry.valor !== base.valor) return false;
          const sameMoto = (entry.motoId || null) === (base.motoId || null) || (entry.placa || "") === (base.placa || "");
          const sameClient = (entry.clienteId || null) === (base.clienteId || null);
          return sameMoto && sameClient;
        });

        if (adoptIdx >= 0) {
          const existing = nextEntries[adoptIdx];
          nextEntries[adoptIdx] = { ...existing, serieId: seriesId, fixedOriginId: base.id, recurringGroupId: base.recurringGroupId || existing.recurringGroupId || null };
          changed = true;
        } else {
          nextEntries.push({
            ...base,
            id: crypto.randomUUID(),
            serieId: seriesId,
            fixedOriginId: base.id,
            recurringGroupId: base.recurringGroupId || null,
            data: occurrenceDate,
            dataPrevista: occurrenceDate,
            pago: false,
          });
          changed = true;
        }
      }
    });

    if (changed) {
      if (entriesSignature(entries) !== entriesSignature(nextEntries)) {
        persist(nextEntries).catch(err => { console.error("[FinanceiroPage] recurrence materialize error:", err); });
      }
    }
  }, [entries, getRecurringDate, persist]);

  // Auto-associate: find the client linked to a vehicle via active rentals
  const getClientForMoto = useCallback((motoId: string) => {
    // Try direct ID match first
    let activeRental = rentals.find(r => r.motoId === motoId && r.status === "ativa");
    // Fallback: match by placa (handles legacy IDs from migration)
    if (!activeRental) {
      const moto = motos.find(m => m.id === motoId);
      if (moto) {
        activeRental = rentals.find(r => {
          if (r.status !== "ativa") return false;
          const rentalMoto = motos.find(m => m.id === r.motoId);
          return rentalMoto?.placa === moto.placa;
        });
      }
    }
    return activeRental?.clienteId || null;
  }, [rentals, motos]);

  // Auto-associate: find the moto linked to a client via active rentals
  const getMotoForClient = useCallback((clienteId: string) => {
    const activeRental = rentals.find(r => r.clienteId === clienteId && r.status === "ativa");
    return activeRental?.motoId || null;
  }, [rentals]);

  const resolveEntryAssociations = useCallback(
    (entry: FinancialEntry) => resolveAssociations(entry, { motos, clients, rentals }),
    [motos, clients, rentals],
  );

  // When vehicle changes, auto-set client and preserve raw display fields
  const handleMotoChange = (motoId: string | null) => {
    if (!motoId) {
      setForm({ ...form, motoId: null, placa: "", rentalId: null, clienteId: null, clienteNome: "" });
      return;
    }

    const moto = motos.find(m => m.id === motoId);
    const autoClienteId = getClientForMoto(motoId);
    const autoClienteNome = autoClienteId ? clients.find(c => c.id === autoClienteId)?.nome || "" : "";

    setForm({
      ...form,
      motoId,
      placa: moto?.placa || form.placa || "",
      rentalId: null,
      clienteId: autoClienteId ?? form.clienteId,
      clienteNome: autoClienteNome || form.clienteNome || "",
    });
  };

  // Filter entries for current month or custom range
  const monthEntries = useMemo(() =>
    entries.filter(e => {
      try {
        // Use effective date: paid → data (payment date), pending → dataPrevista (due date) or data
        const effectiveDateStr = e.pago ? e.data : (e.dataPrevista || e.data);
        const effectiveDate = parseISO(effectiveDateStr);
        if (customRangeMode && customFrom && customTo) {
          return isWithinInterval(effectiveDate, { start: customFrom, end: customTo });
        }
        return isSameMonth(effectiveDate, currentMonth);
      } catch { return false; }
    }),
    [entries, currentMonth, customRangeMode, customFrom, customTo]
  );

  // Expand to full dataset whenever any date range filter is active.
  const filteredSource = useMemo(
    () => (dateFrom || dateTo ? entries : monthEntries),
    [entries, monthEntries, dateFrom, dateTo],
  );

  const filtered = useMemo(() => {
    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const normPlaca = (s: string) => norm(s).replace(/[\s\-]/g, "");
    const q = norm(search);
    const entryOrder = new Map(filteredSource.map((entry, index) => [entry.id, index]));

    return filteredSource.filter(e => {
      const normalizedEntryCategory = normalizeCategoryValue(e.categoria, e.tipo);
      const matchTipo = tipoFilter === "all" || e.tipo === tipoFilter;
      // Toggle switches override pagoFilter
      const matchPago = onlyPagas ? e.pago : onlyPendentes ? !e.pago : (pagoFilter === "all" || (pagoFilter === "pago" ? e.pago : !e.pago));
      const matchCategoria = categoriaFilter === "all" || (() => {
        if (categoriaFilter.includes("::")) {
          const [catVal, subVal] = categoriaFilter.split("::");
          const siblings = CATEGORY_SIBLINGS[catVal] || [catVal];
          return siblings.includes(normalizedEntryCategory) && e.subcategoria === subVal;
        }
        const siblings = CATEGORY_SIBLINGS[categoriaFilter] || [categoriaFilter];
        return siblings.includes(normalizedEntryCategory);
      })();
      const matchConta = contaFilter === "all"
        ? true
        : contaFilter === "__none__"
          ? !(e.conta)
          : contaFilter === "__cards__"
            ? creditCards.some(c => c.nome === (e.conta || ""))
            : (e.conta || "") === contaFilter;
      // Placa filter — comparação exata (dropdown sempre fornece placa completa)
      const motoPlaca = (e.motoId ? (motos.find(m => m.id === e.motoId)?.placa || e.placa || "") : (e.placa || "")).trim();
      const matchPlaca = !placaFilter || motoPlaca === placaFilter;
      // Locatário filter
      const clientName = e.clienteId ? (clients.find(c => c.id === e.clienteId)?.nome || e.clienteNome || "") : (e.clienteNome || "");
      const matchLocatario = !locatarioFilter || clientName === locatarioFilter || clientName.toLowerCase().includes(locatarioFilter.toLowerCase());
      // Search — accent-insensitive, plate ignores dashes/spaces, valor matches as string
      const valorStr = e.valor != null ? String(e.valor.toFixed(2)).replace(".", ",") : "";
      const matchSearch = !q || norm(e.descricao).includes(q) || norm(getCatLabel(normalizedEntryCategory, e.tipo)).includes(q) || norm(e.observacao || "").includes(q) || norm(e.subcategoria || "").includes(q) || normPlaca(motoPlaca).includes(normPlaca(search)) || norm(clientName).includes(q) || valorStr.includes(q) || String(e.valor ?? "").includes(q);
      // Date range filter
      const effectiveDate = !e.pago && e.dataPrevista ? e.dataPrevista : e.data;
      const matchDateFrom = !dateFrom || effectiveDate >= dateFrom;
      const matchDateTo = !dateTo || effectiveDate <= dateTo;
      const matchRecorrente = !onlyRecorrentes || e.recorrente || e.despesaFixa || !!e.fixedOriginId || !!e.serieId;
      // Due-date quick filter (atrasadas / hoje / amanhã) — applies only to pending entries
      let matchDue = true;
      if (dueFilter !== "all") {
        if (e.pago) {
          matchDue = false;
        } else {
          const due = e.dataPrevista || e.data;
          const today = new Date(); today.setHours(0,0,0,0);
          const todayStr = today.toISOString().split("T")[0];
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split("T")[0];
          if (dueFilter === "atrasadas") matchDue = due < todayStr;
          else if (dueFilter === "hoje") matchDue = due === todayStr;
          else if (dueFilter === "amanha") matchDue = due === tomorrowStr;
        }
      }
      const matchIgnoradas = ignoradasFilter === "incluir" ? true : ignoradasFilter === "ocultar" ? !e.ignorada : !!e.ignorada;
      return matchSearch && matchTipo && matchPago && matchCategoria && matchConta && matchPlaca && matchLocatario && matchDateFrom && matchDateTo && matchRecorrente && matchDue && matchIgnoradas;
    }).sort((a, b) => {
      // Primeiro: ordenar por data efetiva decrescente (dias do mês)
      const dateA = a.pago ? a.data : (a.dataPrevista || a.data);
      const dateB = b.pago ? b.data : (b.dataPrevista || b.data);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      // Transferências do mesmo par: saída (despesa) antes da entrada (receita)
      if (a.categoria === "transferencia" && b.categoria === "transferencia" && a.serieId && a.serieId === b.serieId && a.tipo !== b.tipo) {
        return a.tipo === "despesa" ? -1 : 1;
      }
      // Taxas Asaas sempre após o recebimento no mesmo dia
      const aIsFee = a.id.startsWith("asaas-fee-");
      const bIsFee = b.id.startsWith("asaas-fee-");
      if (aIsFee !== bIsFee) return aIsFee ? 1 : -1;
      // Dentro do mesmo dia: mais recentes primeiro (último cadastrado no topo)
      const createdA = a.createdAt || "";
      const createdB = b.createdAt || "";
      if (createdA && createdB && createdA !== createdB) return createdB.localeCompare(createdA);
      return (entryOrder.get(b.id) ?? -1) - (entryOrder.get(a.id) ?? -1);
    });
  }, [filteredSource, search, tipoFilter, pagoFilter, categoriaFilter, contaFilter, getCatLabel, placaFilter, locatarioFilter, dateFrom, dateTo, onlyPagas, onlyPendentes, onlyRecorrentes, dueFilter, ignoradasFilter, motos, clients]);

  // Reset page when filters change
  const filteredLen = filtered.length;
  React.useEffect(() => { setCurrentPage(1); }, [filteredLen, search, tipoFilter, pagoFilter, categoriaFilter, contaFilter, placaFilter, locatarioFilter, rowsPerPage]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, FinancialEntry[]> = {};
    filtered.forEach(e => {
      const effectiveDate = !e.pago && e.dataPrevista ? e.dataPrevista : e.data;
      if (!groups[effectiveDate]) groups[effectiveDate] = [];
      groups[effectiveDate].push(e);
    });
    // Dentro de cada grupo: mais recentes primeiro; transferências do mesmo par: saída antes da entrada; taxas Asaas após recebimento
    Object.values(groups).forEach(arr => arr.sort((a, b) => {
      if (a.categoria === "transferencia" && b.categoria === "transferencia" && a.serieId && a.serieId === b.serieId) {
        if (a.tipo !== b.tipo) return a.tipo === "despesa" ? -1 : 1;
      }
      const aIsFee = a.id.startsWith("asaas-fee-");
      const bIsFee = b.id.startsWith("asaas-fee-");
      if (aIsFee !== bIsFee) return aIsFee ? 1 : -1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    }));
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  // Is date overdue?
  const isOverdue = (e: FinancialEntry) => {
    if (e.pago) return false;
    const dueDate = e.dataPrevista || e.data;
    const today = new Date().toISOString().split("T")[0];
    return dueDate < today;
  };

  // Filtered totals for summary line
  const filteredTotals = useMemo(() => {
    const active = filtered.filter(e => !e.ignorada);
    const receitasPagas = active.filter(e => e.pago && e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
    const despesasPagas = active.filter(e => e.pago && e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
    const totalPago = receitasPagas - despesasPagas;
    const receitasPendentes = active.filter(e => !e.pago && e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
    const despesasPendentes = active.filter(e => !e.pago && e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
    const totalPendente = receitasPendentes - despesasPendentes;
    const totalAtrasado = active.filter(e => !e.pago && isOverdue(e)).reduce((s, e) => {
      return s + (e.tipo === "receita" ? e.valor : -e.valor);
    }, 0);
    return { totalPago, totalPendente, totalAtrasado };
  }, [filtered]);

  const totals = useMemo(() => {
    const active = filtered.filter(e => !e.ignorada);
    const receitas = active.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
    const despesas = active.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
    const receitasPagas = active.filter(e => e.tipo === "receita" && e.pago).reduce((s, e) => s + e.valor, 0);
    const despesasPagas = active.filter(e => e.tipo === "despesa" && e.pago).reduce((s, e) => s + e.valor, 0);
    const pendentes = active.filter(e => !e.pago).reduce((s, e) => s + e.valor, 0);
    const saldoEfetuado = receitasPagas - despesasPagas;
    return { receitas, despesas, saldo: receitas - despesas, receitasPagas, despesasPagas, pendentes, saldoEfetuado };
  }, [filtered]);

  // Dedup filtered list (CC and non-CC together)
  const ccCardNames = useMemo(() => new Set(creditCards.map((c: any) => c.nome)), [creditCards]);
  const filteredNonCC = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [filtered]);

  // Comparison period totals
  const compTotals = useMemo(() => {
    if (!compareMode) return null;
    let prevFrom: Date, prevTo: Date;
    if (customRangeMode && customFrom && customTo) {
      const diff = customTo.getTime() - customFrom.getTime();
      prevTo = new Date(customFrom.getTime() - 1);
      prevFrom = new Date(prevTo.getTime() - diff);
    } else {
      const prev = subMonths(currentMonth, 1);
      prevFrom = startOfMonth(prev);
      prevTo = endOfMonth(prev);
    }
    const prevEntries = entries.filter(e => {
      try {
        const d = parseISO(e.data);
        return isWithinInterval(d, { start: prevFrom, end: prevTo });
      } catch { return false; }
    }).filter(e => !e.ignorada);
    const receitas = prevEntries.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
    const despesas = prevEntries.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
    return { receitas, despesas, saldo: receitas - despesas, label: `${format(prevFrom, "dd/MM")} — ${format(prevTo, "dd/MM")}` };
  }, [compareMode, entries, currentMonth, customRangeMode, customFrom, customTo]);


  const categoryData = useMemo(() => {
    const tipo = tipoFilter === "all" ? "despesa" : tipoFilter;
    const catEntries = monthEntries.filter(e => e.tipo === tipo);
    const map: Record<string, number> = {};
    catEntries.forEach(e => {
      const label = getCatLabel(e.categoria, e.tipo);
      map[label] = (map[label] || 0) + e.valor;
    });
    return Object.entries(map)
      .map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [monthEntries, tipoFilter, getCatLabel]);

  const monthlyEvolution = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(currentMonth, i);
      const mEntries = entries.filter(e => { try { return isSameMonth(parseISO(e.data), m); } catch { return false; } });
      const rec = mEntries.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
      const desp = mEntries.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
      months.push({ mes: format(m, "MMM", { locale: ptBR }), receitas: rec, despesas: desp, saldo: rec - desp });
    }
    return months;
  }, [entries, currentMonth]);

  const categoryBudget = useMemo(() => {
    const catEntries = monthEntries.filter(e => e.tipo === "despesa");
    const map: Record<string, number> = {};
    catEntries.forEach(e => {
      const label = getCatLabel(e.categoria, e.tipo);
      map[label] = (map[label] || 0) + e.valor;
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map)
      .map(([cat, valor]) => ({ cat, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [monthEntries, getCatLabel]);

  const [editScopeTarget, setEditScopeTarget] = useState<FinancialEntry | null>(null);
  const [asaasLoadingId, setAsaasLoadingId] = useState<string | null>(null);
  const [syncingFeesId, setSyncingFeesId] = useState<string | null>(null);

  const handleSyncAsaasFees = async (entry: FinancialEntry) => {
    if (!entry.asaasPaymentId) return;
    setSyncingFeesId(entry.id);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-sync-fees", {
        body: { asaasPaymentId: entry.asaasPaymentId, entryId: entry.id, companyId: currentCompanyId },
      });
      if (error) throw error;
      const totalRegistered = (data?.registeredFees ?? 0) + (data?.registeredJuros ?? 0);
      if (totalRegistered > 0) {
        const parts: string[] = [];
        if (data?.registeredFees > 0) parts.push(`${data.registeredFees} taxa(s) Asaas`);
        if (data?.registeredJuros > 0) parts.push(`juros/multa`);
        toast.success(`Registrado: ${parts.join(" e ")}.`);
      } else {
        toast.info("Nenhuma taxa ou juros encontrados no Asaas para este pagamento.");
      }
    } catch (e: any) {
      toast.error("Erro ao buscar taxas: " + (e?.message || "Tente novamente."));
    } finally {
      setSyncingFeesId(null);
    }
  };

  const handleGenerateAsaasBoleto = async (entry: FinancialEntry) => {
    setAsaasLoadingId(entry.id);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-charge", {
        body: { entryId: entry.id },
      });
      if (error) {
        let msg = error.message;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      const updated = entries.map(e =>
        e.id === entry.id
          ? { ...e, asaasPaymentId: data.paymentId, asaasStatus: data.status, asaasBoletoUrl: data.boletoUrl, asaasInvoiceUrl: data.invoiceUrl }
          : e
      );
      await persistWithFeedback(updated, { successMessage: "Boleto gerado e enviado para o cliente!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar boleto";
      toast.error(msg);
    } finally {
      setAsaasLoadingId(null);
    }
  };

  const buildNormalizedEntry = (): FinancialEntry | null => {
    if (!form.data) { toast.error("Data de recebimento é obrigatória"); return null; }
    if (!form.categoria) { toast.error("Categoria é obrigatória"); return null; }
    if (!form.conta) { toast.error("Conta é obrigatória"); return null; }
    if (!form.natureza) { toast.error("Natureza é obrigatória"); return null; }
    if (form.tipo === "despesa" && form.categoria === "manutencao_despesa" && !form.fixedOriginId) {
      toast.error("Despesas de manutenção são criadas automaticamente pela Ordem de Serviço. Acesse o módulo Manutenções / OS.");
      return null;
    }
    if (form.natureza === "operacional" && form.tipo === "despesa" && !form.motoId && !form.placa) {
      toast.error("Veículo/Placa é obrigatório para despesas operacionais");
      return null;
    }
    if (form.tipo === "despesa" && (form.motoId || form.placa) && form.natureza === "administrativa") {
      toast.error("Despesas com placa devem ter natureza Operacional ou Investimento");
      return null;
    }

    const existing = entries.find(e => e.id === form.id);
    const resolved = auditCompraMotoEntry(
      resolveEntryAssociations({
        ...form,
        categoria: normalizeCategoryValue(form.categoria, form.tipo),
        classificacaoManual: (existing?.classificacaoManual || false) || shouldLockManualClassification(form, existing),
      }),
      motos,
    );

    // For unpaid entries, dataPrevista (due date) must always match data (avoids
    // stale dataPrevista when user edits the date). For paid entries, keep the
    // original due date if present, otherwise fall back to the payment date.
    const syncedPrevista = resolved.pago
      ? (resolved.dataPrevista || resolved.data)
      : resolved.data;

    // For CC expenses (unpaid), dataPrevista must be the invoice due date so
    // the reconcile groups it into the correct invoice month.
    let finalPrevista = syncedPrevista;
    if (!resolved.pago && resolved.tipo === "despesa" && resolved.categoria !== "fatura_cartao") {
      const ccCard = creditCards.find(c => c.nome === resolved.conta);
      if (ccCard) {
        try {
          const invYm = computeCardInvoiceYm(resolved.data, ccCard as any);
          const [yStr, mStr] = invYm.split("-");
          const y = Number(yStr); const m = Number(mStr) - 1;
          const dueDay = (ccCard as any).diaVencimento || 1;
          const lastDay = new Date(y, m + 1, 0).getDate();
          finalPrevista = `${invYm}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
        } catch { /* fallback to purchase date */ }
      }
    }

    const isManutenção = resolved.categoria === "manutencao_despesa" || resolved.categoria === "manutencao_receita";
    const cleanTags = isManutenção ? resolved.tags : (resolved.tags || []).filter(t => t !== "OS");

    return {
      ...resolved,
      tags: cleanTags,
      dataPrevista: finalPrevista,
      observacao: resolved.observacao || resolved.subcategoria || "",
      serieId: resolved.recorrente || resolved.despesaFixa ? (existing?.serieId || resolved.serieId || resolved.id) : resolved.serieId,
      recurringGroupId: (resolved.recorrente || resolved.despesaFixa)
        ? (existing?.recurringGroupId || crypto.randomUUID())
        : (existing?.recurringGroupId || null),
    };
  };

  const handleSave = async () => {
    const normalizedEntry = buildNormalizedEntry();
    if (!normalizedEntry) return false;
    if (isSaving) return false;

    const isEditing = entries.some(e => e.id === normalizedEntry.id);
    const seriesId = normalizedEntry.serieId || normalizedEntry.fixedOriginId;

    // Transferência: editar um lado deve refletir no par (entrada/saída)
    if (isEditing && normalizedEntry.categoria === "transferencia" && normalizedEntry.serieId) {
      const partner = entries.find(e => e.serieId === normalizedEntry.serieId && e.id !== normalizedEntry.id);
      if (partner) {
        const updatedPartner: FinancialEntry = {
          ...partner,
          valor: normalizedEntry.valor,
          data: normalizedEntry.data,
          dataPrevista: normalizedEntry.dataPrevista,
          pago: normalizedEntry.pago,
          observacao: normalizedEntry.observacao,
          tags: normalizedEntry.tags,
          descricao: partner.tipo === "despesa"
            ? `Transferência → ${normalizedEntry.tipo === "receita" ? normalizedEntry.conta : partner.conta}`
            : `Transferência ← ${normalizedEntry.tipo === "despesa" ? normalizedEntry.conta : partner.conta}`,
        };
        const updated = entries.map(e =>
          e.id === normalizedEntry.id ? normalizedEntry :
          e.id === partner.id ? updatedPartner : e
        );
        const saved = await persistWithFeedback(updated, { successMessage: "Transferência atualizada (entrada e saída)." });
        if (!saved) return false;
        setDialogOpen(false);
        return true;
      }
    }

    // Só abre o diálogo de escopo para despesas fixas ou recorrentes (com série)
    const isRecurringSeries = !!(seriesId || normalizedEntry.recorrente || normalizedEntry.despesaFixa);
    if (isEditing && isRecurringSeries) {
      setEditScopeTarget(normalizedEntry);
      return false;
    }

    // Credit card entry generation (1x or installments) — purchase date is preserved
    // in the observation; data/dataPrevista point at the invoice due date.
    const card = !isEditing && normalizedEntry.tipo === "despesa"
      ? creditCards.find(c => c.nome === normalizedEntry.conta)
      : null;

    let updated: FinancialEntry[];
    if (card) {
      const purchaseIso = normalizedEntry.data;
      const purchaseDate = new Date(purchaseIso + "T00:00:00");
      const closingDay = card.diaFechamento || 1;
      const dueDay = card.diaVencimento || 1;
      const baseSerie = parcelas > 1 ? `cc-${normalizedEntry.id}` : undefined;
      const ccGroupId = parcelas > 1 ? crypto.randomUUID() : null;
      const valorParcela = Math.round((normalizedEntry.valor / parcelas) * 100) / 100;
      const installments: FinancialEntry[] = [];
      // Determine the closing month for this purchase: if purchase day is after
      // the closing day, it goes to next month's invoice. Otherwise current.
      const closingMonthOffset = purchaseDate.getDate() > closingDay ? 1 : 0;
      // Due date = first dueDay on/after the closing date. If dueDay <= closingDay,
      // due date falls in the month after closing.
      const dueMonthOffsetFromClosing = dueDay > closingDay ? 0 : 1;
      const firstInvoiceMonthOffset = closingMonthOffset + dueMonthOffsetFromClosing;
      for (let i = 0; i < parcelas; i++) {
        const inv = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + firstInvoiceMonthOffset + i, 1);
        const lastDay = new Date(inv.getFullYear(), inv.getMonth() + 1, 0).getDate();
        inv.setDate(Math.min(dueDay, lastDay));
        const dueIso = inv.toISOString().split("T")[0];
        const parcelaTag = parcelas > 1 ? ` • Parcela ${i + 1}/${parcelas}` : "";
        installments.push({
          ...normalizedEntry,
          id: i === 0 ? normalizedEntry.id : crypto.randomUUID(),
          valor: valorParcela,
          data: dueIso,
          dataPrevista: dueIso,
          // Compras no cartão só são "pagas" quando a fatura é paga.
          pago: false,
          descricao: parcelas > 1 ? `${normalizedEntry.descricao} (${i + 1}/${parcelas})` : normalizedEntry.descricao,
          serieId: baseSerie,
          recurringGroupId: ccGroupId,
          observacao: (normalizedEntry.observacao || "") + ` • Compra em ${purchaseDate.toLocaleDateString("pt-BR")}${parcelaTag} • ${card.nome}`,
        });
      }
      updated = [...entries, ...installments];
      if (parcelas > 1) toast.success(`${parcelas} parcelas geradas no cartão ${card.nome}`);
      else toast.success(`Despesa lançada na fatura do ${card.nome}`);
    } else {
      const exists = entries.find(e => e.id === normalizedEntry.id);
      updated = exists
        ? entries.map(e => e.id === normalizedEntry.id ? normalizedEntry : e)
        : [...entries, normalizedEntry];
    }

    const prevEntry = entries.find(e => e.id === normalizedEntry.id);
    const saved = await persistWithFeedback(updated, {
      successMessage: isEditing ? "Lançamento atualizado." : "Lançamento salvo."
    });
    if (!saved) return false;

    if (isEditing && prevEntry) {
      syncAsaasPayment(normalizedEntry, prevEntry).catch(() => {});
    }

    // Sync "venda_moto" entries back to the motorcycle record
    if (normalizedEntry.categoria === "venda_moto" && normalizedEntry.motoId) {
      const allMotos = loadMotos();
      const targetMoto = allMotos.find(m => m.id === normalizedEntry.motoId);
      if (targetMoto && (targetMoto.valorVenda !== normalizedEntry.valor || targetMoto.dataVenda !== normalizedEntry.data || targetMoto.status !== "vendida")) {
        const updatedMotos = allMotos.map(m =>
          m.id === normalizedEntry.motoId
            ? { ...m, valorVenda: normalizedEntry.valor, dataVenda: normalizedEntry.data, status: "vendida" as const }
            : m,
        );
         saveMotos(updatedMotos);
        toast.success("Lançamento salvo e moto atualizada");
      }
    }

    setDialogOpen(false);
    if (!isEditing) scrollTableToTop();
    return true;
  };

  const handleEditScopeOnly = async () => {
    if (!editScopeTarget) return;
    if (isSaving) return;
    const prevEntry = entries.find(e => e.id === editScopeTarget.id);
    const updated = entries.map(e => e.id === editScopeTarget.id ? editScopeTarget : e);
    const saved = await persistWithFeedback(updated, { successMessage: "Lançamento atualizado." });
    if (!saved) return;
    if (prevEntry) syncAsaasPayment(editScopeTarget, prevEntry).catch(() => {});
    setEditScopeTarget(null);
    setDialogOpen(false);
  };

  const handleEditScopePending = async () => {
    if (!editScopeTarget) return;
    if (isSaving) return;
    const groupId = editScopeTarget.recurringGroupId;
    const seriesId = editScopeTarget.serieId || editScopeTarget.fixedOriginId;
    // Campos não-data propagados para toda a série.
    // Para entradas auto-materializadas (fixedOriginId presente) as datas são mantidas
    // por ocorrência para evitar duplicatas. Para entradas pré-geradas (wizard de locação,
    // sem fixedOriginId) o delta de dias é aplicado para manter o dia da semana correto.
    const scopeFields = { valor: editScopeTarget.valor, categoria: editScopeTarget.categoria, subcategoria: editScopeTarget.subcategoria, conta: editScopeTarget.conta, natureza: editScopeTarget.natureza, placa: editScopeTarget.placa, motoId: editScopeTarget.motoId, clienteNome: editScopeTarget.clienteNome, clienteId: editScopeTarget.clienteId, tags: editScopeTarget.tags, observacao: editScopeTarget.observacao, ignorada: editScopeTarget.ignorada };

    const original = entries.find(e => e.id === editScopeTarget.id);
    const originalDate = original?.data ?? "";
    const shiftDay = (d: string, delta: number) => {
      const dt = new Date(d + "T00:00:00");
      dt.setDate(dt.getDate() + delta);
      return dt.toISOString().split("T")[0];
    };
    const dayDelta = originalDate && editScopeTarget.data
      ? Math.round((new Date(editScopeTarget.data + "T00:00:00").getTime() - new Date(originalDate + "T00:00:00").getTime()) / 86400000)
      : 0;
    const updated = entries.map(e => {
      if (e.id === editScopeTarget.id) return editScopeTarget;
      if (e.pago) return e;
      // Só afeta entradas na mesma série com data >= a entrada editada
      if ((e.data ?? "") < originalDate) return e;
      const inSeries = groupId
        ? e.recurringGroupId === groupId
        : !!(seriesId && (e.serieId === seriesId || e.fixedOriginId === seriesId || e.id === seriesId));
      if (!inSeries) return e;
      // Entradas pré-geradas (sem fixedOriginId): desloca a data pelo mesmo delta
      // para manter o dia da semana do pagamento consistente.
      const dateShift = (!e.fixedOriginId && dayDelta !== 0 && e.data) ? {
        data: shiftDay(e.data, dayDelta),
        dataPrevista: e.dataPrevista ? shiftDay(e.dataPrevista, dayDelta) : e.dataPrevista,
      } : {};
      return { ...e, ...scopeFields, ...dateShift };
    });
    const saved = await persistWithFeedback(updated, { successMessage: "Pendências atualizadas." });
    if (!saved) return;
    syncAsaasChanges(updated, entries).catch(() => {});
    setEditScopeTarget(null);
    setDialogOpen(false);
  };

  const handleEditScopeAll = async () => {
    if (!editScopeTarget) return;
    if (isSaving) return;
    const groupId = editScopeTarget.recurringGroupId;
    const seriesId = editScopeTarget.serieId || editScopeTarget.fixedOriginId;
    if (!groupId && !seriesId) { handleEditScopeOnly(); return; }
    const scopeFields = { valor: editScopeTarget.valor, categoria: editScopeTarget.categoria, subcategoria: editScopeTarget.subcategoria, conta: editScopeTarget.conta, natureza: editScopeTarget.natureza, placa: editScopeTarget.placa, motoId: editScopeTarget.motoId, clienteNome: editScopeTarget.clienteNome, clienteId: editScopeTarget.clienteId, tags: editScopeTarget.tags, observacao: editScopeTarget.observacao, ignorada: editScopeTarget.ignorada };
    const updated = entries.map(e => {
      if (e.id === editScopeTarget.id) return editScopeTarget;
      const inSeries = groupId
        ? e.recurringGroupId === groupId
        : !!(seriesId && (e.serieId === seriesId || e.fixedOriginId === seriesId || e.id === seriesId));
      if (inSeries) return { ...e, ...scopeFields };
      return e;
    });
    const saved = await persistWithFeedback(updated, { successMessage: "Série atualizada." });
    if (!saved) return;
    syncAsaasChanges(updated, entries).catch(() => {});
    setEditScopeTarget(null);
    setDialogOpen(false);
  };

  const handleTransfer = () => {
    if (!transferFrom || !transferTo || transferFrom === transferTo || !transferValor) return;
    const valor = parseFloat(transferValor.replace(/\./g, "").replace(",", "."));
    if (isNaN(valor) || valor <= 0) return;
    const baseId = crypto.randomUUID();
    const transferSerieId = `transfer-${baseId}`;
    const saida: FinancialEntry = {
      ...emptyEntry(), id: baseId, tipo: "despesa", categoria: "transferencia",
      descricao: `Transferência → ${transferTo}`, valor, data: transferData,
      pago: true, conta: transferFrom, natureza: "administrativa",
      observacao: transferObs, tags: ["Transferência"], serieId: transferSerieId,
      ignorada: true,
    };
    const entrada: FinancialEntry = {
      ...emptyEntry(), id: crypto.randomUUID(), tipo: "receita", categoria: "transferencia",
      descricao: `Transferência ← ${transferFrom}`, valor, data: transferData,
      pago: true, conta: transferTo, natureza: "administrativa",
      observacao: transferObs, tags: ["Transferência"], serieId: transferSerieId,
      ignorada: true,
    };
    persist([...entries, saida, entrada]).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
    setTransferOpen(false);
    setTransferFrom(""); setTransferTo(""); setTransferValor(""); setTransferObs("");
    setTransferData(new Date().toISOString().split("T")[0]);
    // Navega para o mês da transferência sem aplicar filtros, depois faz scroll até a linha.
    try {
      const transferDateObj = parseISO(transferData);
      if (!isNaN(transferDateObj.getTime())) {
        setCustomRangeMode(false);
        setCustomFrom(undefined);
        setCustomTo(undefined);
        if (!isSameMonth(transferDateObj, currentMonth)) {
          setCurrentMonth(transferDateObj);
        }
      }
    } catch { /* ignore */ }
    setCurrentPage(1);
    scrollToEntryRow(baseId);
  };

  const handleSaveAdiantamento = async () => {
    const card = creditCards.find(c => c.id === advCardId);
    if (!card || !advAmount || !advDate || !advBank) return;
    const valor = parseFloat(advAmount.replace(/\./g, "").replace(",", "."));
    if (isNaN(valor) || valor <= 0) return;
    // Calculate which invoice due date this advance applies to (same logic as purchases)
    const closingDay = card.diaFechamento || 1;
    const dueDay = card.diaVencimento || 1;
    const advD = new Date(advDate + "T00:00:00");
    const closingMonthOffset = advD.getDate() > closingDay ? 1 : 0;
    const dueMonthOffsetFromClosing = dueDay > closingDay ? 0 : 1;
    const firstInvoiceMonthOffset = closingMonthOffset + dueMonthOffsetFromClosing;
    const invMonth = new Date(advD.getFullYear(), advD.getMonth() + firstInvoiceMonthOffset, 1);
    const lastDay = new Date(invMonth.getFullYear(), invMonth.getMonth() + 1, 0).getDate();
    invMonth.setDate(Math.min(dueDay, lastDay));
    const invDueIso = invMonth.toISOString().split("T")[0];
    const advance: FinancialEntry = {
      ...emptyEntry(),
      id: crypto.randomUUID(),
      tipo: "despesa",
      categoria: "fatura_cartao",
      descricao: `Adiantamento fatura ${card.nome}`,
      valor,
      data: advDate,
      dataPrevista: invDueIso,
      pago: true,
      conta: advBank,
      ignorada: false,
      tags: ["Adiantamento"],
      natureza: "administrativa",
      serieId: `adv_${card.id}`,
      observacao: advNote ? `Adiantamento fatura ${card.nome} • ${advNote}` : `Adiantamento fatura ${card.nome}`,
    };
    const saved = await persistWithFeedback([...entries, advance], {
      successMessage: `Adiantamento de R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} registrado.`,
    });
    if (saved) {
      setAdvOpen(false);
      setAdvAmount("");
      setAdvNote("");
      setAdvDate(new Date().toISOString().split("T")[0]);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<FinancialEntry | null>(null);

  // Nunca usar confirm() nativo — pode ser bloqueado pelo browser.
  // Sempre abre o AlertDialog para qualquer exclusão (com ou sem série).
  const handleDelete = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    if (entry.pago) {
      toast.error("Não é possível excluir um lançamento já pago/recebido.");
      return;
    }
    setDeleteTarget(entry);
  };

  const handleDeleteOnly = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    // Faturas auto-geradas (id inv__ ou fatura-) precisam ser suprimidas para que o
    // reconcile não as recrie imediatamente após a deleção.
    if ((target.id.startsWith("inv__") || target.id.startsWith("fatura-")) && target.categoria === "fatura_cartao") {
      suppressedInvoiceIdsRef.current.add(target.id);
      try {
        localStorage.setItem(
          `wayvo:suppressed-invoices:${currentCompanyId}`,
          JSON.stringify([...suppressedInvoiceIdsRef.current]),
        );
      } catch { /* ignora */ }
    }
    // Ocorrências de séries recorrentes precisam ser tombstonadas para que o
    // auto-materialize não as recrie. A chave é "baseId::data".
    const occDate = target.dataPrevista || target.data;
    const occBaseId = target.fixedOriginId || (target.serieId && target.serieId !== target.id ? target.serieId : null);
    if (occBaseId && occDate) {
      const occKey = `${occBaseId}::${occDate}`;
      deletedOccurrencesRef.current.add(occKey);
      try {
        localStorage.setItem(
          `wayvo:deleted-occurrences:${currentCompanyId}`,
          JSON.stringify([...deletedOccurrencesRef.current]),
        );
      } catch { /* ignora */ }
    }
    await cancelAsaasPayments([target]);
    // Transferências são sempre par — apaga os dois lados juntos
    const idsToRemove = new Set<string>([target.id]);
    if (target.categoria === "transferencia" && target.serieId) {
      entries.forEach(e => { if (e.id !== target.id && e.serieId === target.serieId) idsToRemove.add(e.id); });
    }
    const updated = entries.filter(e => !idsToRemove.has(e.id));
    setEntries(updated);
    saveFinancial(updated)
      .then(() => toast.success(idsToRemove.size > 1 ? "Transferência removida (ambos os lados)." : "Lançamento removido."))
      .catch(err => { setEntries(entries); console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };

  // Retorna true se `e` pertence à mesma série que `target`.
  const isSameSeries = (e: FinancialEntry, target: FinancialEntry): boolean => {
    if (target.recurringGroupId && e.recurringGroupId) {
      return e.recurringGroupId === target.recurringGroupId;
    }
    const sid = target.serieId || target.fixedOriginId;
    return !!(sid && (e.serieId === sid || e.fixedOriginId === sid));
  };

  // "Esta e as próximas pendentes" — exclui este e todos os NÃO PAGOS com data >= este.
  const handleDeleteFuturesInSeries = async () => {
    if (!deleteTarget) return;
    const targetDate = deleteTarget.data ?? "";
    const idsToRemove = new Set<string>([deleteTarget.id]);
    entries.forEach(e => {
      if (e.id !== deleteTarget.id && isSameSeries(e, deleteTarget) && !e.pago && (e.data ?? "") >= targetDate) {
        idsToRemove.add(e.id);
      }
    });

    let displayEntries = entries.filter(e => !idsToRemove.has(e.id));
    let dbEntries = displayEntries;

    // Quando a série usa auto-materialização (recorrente/despesaFixa), limitar
    // recorrenciaVezes da entrada-base evita que o efeito recrie as entradas deletadas.
    const baseEntry = displayEntries.find(e =>
      !e.fixedOriginId &&
      (e.recorrente || e.despesaFixa) &&
      (deleteTarget.recurringGroupId
        ? e.recurringGroupId === deleteTarget.recurringGroupId
        : (() => { const sid = deleteTarget.serieId || deleteTarget.fixedOriginId; return !!(sid && (e.serieId === sid || e.id === sid)); })())
    );
    if (baseEntry) {
      const remaining = displayEntries.filter(e =>
        e.id !== baseEntry.id && isSameSeries(e, baseEntry)
      ).length;
      // Importante: limpar `despesaFixa` (que ignora recorrenciaVezes e força 24
      // ocorrências no auto-materialize) e, se nada sobrou, também `recorrente`.
      // Sem isso, o efeito de auto-materialização recria as entradas excluídas.
      const applyBase = (e: FinancialEntry) => e.id === baseEntry.id
        ? { ...e, recorrenciaVezes: remaining, despesaFixa: false, recorrente: remaining > 0 ? e.recorrente : false }
        : e;
      displayEntries = displayEntries.map(applyBase);
      dbEntries = dbEntries.map(applyBase);
    }

    const count = idsToRemove.size;
    const toCancel = entries.filter(e => idsToRemove.has(e.id));
    setDeleteTarget(null);
    await cancelAsaasPayments(toCancel);
    setEntries(displayEntries);
    saveFinancial(dbEntries)
      .then(() => toast.success(`${count} lançamento(s) removido(s).`))
      .catch(err => { setEntries(entries); console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };

  // "Todos da série (incluindo pagos)" — exclui todos os lançamentos da série.
  const handleDeleteAllIncludingPaid = async () => {
    if (!deleteTarget) return;
    const idsToRemove = new Set<string>([deleteTarget.id]);
    entries.forEach(e => {
      if (e.id !== deleteTarget.id && isSameSeries(e, deleteTarget)) idsToRemove.add(e.id);
    });
    const count = idsToRemove.size;
    const toCancel = entries.filter(e => idsToRemove.has(e.id));
    setDeleteTarget(null);
    await cancelAsaasPayments(toCancel);
    const updated = entries.filter(e => !idsToRemove.has(e.id));
    setEntries(updated);
    saveFinancial(updated)
      .then(() => toast.success(`${count} lançamento(s) removido(s).`))
      .catch(err => { setEntries(entries); console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };

  const togglePago = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      setConfirmToggleEntry(entry);
      setConfirmDate(!entry.pago ? new Date().toISOString().split("T")[0] : "");
      setConfirmConta(entry.conta || "");
      setConfirmValor(entry.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
      const card = creditCards.find(c => c.nome === (entry.conta || ""));
      setConfirmPayBank(card?.contaPagamento || "");
    }
  };

  // Recalcula confirmValor com multa+juros quando a data de pagamento muda
  useEffect(() => {
    if (!confirmToggleEntry || confirmToggleEntry.pago || !confirmDate) return;
    const rental = confirmToggleEntry.rentalId
      ? rentals.find(r => r.id === confirmToggleEntry.rentalId)
      : null;
    const dueDateStr = confirmToggleEntry.dataPrevista || confirmToggleEntry.data;
    if (!rental || !dueDateStr) {
      setConfirmValor(confirmToggleEntry.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
      return;
    }
    const due = new Date(dueDateStr + "T00:00:00");
    const pay = new Date(confirmDate + "T00:00:00");
    const daysOverdue = Math.max(0, Math.floor((pay.getTime() - due.getTime()) / 86400000));
    if (daysOverdue === 0) {
      setConfirmValor(confirmToggleEntry.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
      return;
    }
    const multa = rental.multaAtraso || 0;
    const jurosDia = (confirmToggleEntry.valor * (rental.jurosAtrasoMes || 0) / 100) / 30;
    const total = confirmToggleEntry.valor + multa + jurosDia * daysOverdue;
    setConfirmValor(total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDate, confirmToggleEntry]);

  const confirmTogglePago = () => {
    if (!confirmToggleEntry) return;
    const id = confirmToggleEntry.id;
    const parsedValor = parseFloat(confirmValor.replace(/\./g, "").replace(",", "."));
    const finalValor = !isNaN(parsedValor) && parsedValor > 0 ? parsedValor : confirmToggleEntry.valor;
    persist(entries.map(e => {
      if (e.id !== id) return e;
      if (!e.pago) {
        const finalConta = confirmConta || e.conta;
        const isCard = creditCards.some(c => c.nome === finalConta);
        let obs = e.observacao || "";
        if (isCard && confirmPayBank) {
          obs = obs.replace(/\s*•\s*Pago via [^•]+/g, "").trim();
          obs = (obs ? obs + " " : "") + `• Pago via ${confirmPayBank}`;
        }
        return { ...e, pago: true, valor: finalValor, data: confirmDate || new Date().toISOString().split("T")[0], conta: finalConta, observacao: obs };
      } else {
        return { ...e, pago: false, data: e.dataPrevista || e.data };
      }
    }));
    // Success panel para pagamentos de aluguel de locação
    if (!confirmToggleEntry.pago && confirmToggleEntry.rentalId && confirmToggleEntry.tipo === "receita" && confirmToggleEntry.categoria === "aluguel") {
      const rental = rentals.find(r => r.id === confirmToggleEntry.rentalId);
      const client = clients.find(c => c.id === confirmToggleEntry.clienteId);
      const dueDateStr = confirmToggleEntry.dataPrevista || confirmToggleEntry.data;
      const dueDate = dueDateStr ? new Date(dueDateStr + "T00:00:00") : null;
      const startDate = rental ? new Date(rental.dataInicio + "T00:00:00") : null;
      const payDate = confirmDate || new Date().toISOString().split("T")[0];
      let periodoLabel = "";
      if (rental && dueDate && startDate) {
        const freq = rental.frequenciaPagamento;
        const periodDays = freq === "quinzenal" ? 14 : freq === "mensal" ? 30 : 7;
        const diffDays = Math.round((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const periodNum = Math.max(1, Math.floor(diffDays / periodDays) + 1);
        const periodEnd = new Date(dueDate.getTime() + (periodDays - 1) * 24 * 60 * 60 * 1000);
        const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const labelTipo = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
        periodoLabel = `${labelTipo} ${String(periodNum).padStart(2, "0")}: ${fmt(dueDate)} até ${fmt(periodEnd)}`;
      }
      const nome = client?.nome || "Locatário";
      const priNome = nome.split(" ")[0];
      const mensagem = [
        `Olá, ${priNome}! Segue confirmação do seu pagamento:`,
        "",
        periodoLabel ? `📋 Referência: ${periodoLabel}` : null,
        dueDateStr ? `📅 Vencimento: ${new Date(dueDateStr + "T12:00:00").toLocaleDateString("pt-BR")}` : null,
        `✅ Pago em: ${new Date(payDate + "T12:00:00").toLocaleDateString("pt-BR")}`,
        `💰 Valor: R$ ${finalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "",
        "Obrigado! 🏍️",
      ].filter(Boolean).join("\n");
      setRentalPaySuccess({
        nome,
        telefone: client?.telefone || "",
        vencimento: dueDateStr ? new Date(dueDateStr + "T12:00:00").toLocaleDateString("pt-BR") : "—",
        pagamento: new Date(payDate + "T12:00:00").toLocaleDateString("pt-BR"),
        valor: finalValor,
        periodoLabel: periodoLabel || "—",
        mensagem,
      });
    }
    setConfirmToggleEntry(null);
  };

  // Config helpers — propagate changes to existing entries
  const addCategory = (tipo: "receita" | "despesa", label: string) => {
    const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const c = { ...finConfig };
    c.customCategorias = { ...c.customCategorias, [tipo]: [...c.customCategorias[tipo], { value: `custom_${value}`, label }] };
    persistConfig(c);
  };
  const removeCategory = (tipo: "receita" | "despesa", label: string, catValue?: string) => {
    // Remove from custom if it's custom
    const customCat = finConfig.customCategorias[tipo].find(x => x.label === label);
    const c = { ...finConfig };
    if (customCat) {
      c.customCategorias = { ...c.customCategorias, [tipo]: c.customCategorias[tipo].filter(x => x.label !== label) };
    }
    // If default, add to "removed defaults" list
    const defaultCat = DEFAULT_CATEGORIAS[tipo].find(x => x.label === label);
    if (defaultCat) {
      c.removedDefaults = { ...(c.removedDefaults || { receita: [], despesa: [] }), [tipo]: [...((c.removedDefaults || { receita: [], despesa: [] })[tipo] || []), defaultCat.value] };
    }
    persistConfig(c);
    // Clear category from existing entries
    const valueToRemove = catValue || customCat?.value || defaultCat?.value;
    if (valueToRemove) {
      persist(entries.map(e => e.categoria === valueToRemove ? { ...e, categoria: "", subcategoria: "" } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
    }
  };
  // Migrate all entries from one category to another, then remove the source category
  const migrateCategory = (tipo: "receita" | "despesa", oldLabel: string, targetLabel: string, oldCatValue: string) => {
    // Find target value from label (could be default or custom)
    const targetDefault = DEFAULT_CATEGORIAS[tipo].find(x => x.label === targetLabel);
    const targetCustom = finConfig.customCategorias[tipo].find(x => x.label === targetLabel);
    const targetValue = targetDefault?.value || targetCustom?.value;
    if (!targetValue || !oldCatValue) return;
    // 1. Migrate entries
    persist(entries.map(e => e.categoria === oldCatValue ? { ...e, categoria: targetValue } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
    // 2. Remove the source category from config
    const c = { ...finConfig };
    const customCat = finConfig.customCategorias[tipo].find(x => x.label === oldLabel);
    if (customCat) {
      c.customCategorias = { ...c.customCategorias, [tipo]: c.customCategorias[tipo].filter(x => x.label !== oldLabel) };
    }
    const defaultCat = DEFAULT_CATEGORIAS[tipo].find(x => x.label === oldLabel);
    if (defaultCat) {
      c.removedDefaults = { ...(c.removedDefaults || { receita: [], despesa: [] }), [tipo]: [...((c.removedDefaults || { receita: [], despesa: [] })[tipo] || []), defaultCat.value] };
    }
    persistConfig(c);
  };
  const renameCategory = (tipo: "receita" | "despesa", old: string, next: string) => {
    if (!next) return;
    const customCat = finConfig.customCategorias[tipo].find(x => x.label === old);
    const defaultCat = DEFAULT_CATEGORIAS[tipo].find(x => x.label === old);
    const c = { ...finConfig };
    const newValue = next.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (customCat) {
      c.customCategorias = { ...c.customCategorias, [tipo]: c.customCategorias[tipo].map(x => x.label === old ? { value: `custom_${newValue}`, label: next } : x) };
    }
    if (defaultCat) {
      // Remove default and add as custom with new name
      c.removedDefaults = { ...(c.removedDefaults || { receita: [], despesa: [] }), [tipo]: [...((c.removedDefaults || { receita: [], despesa: [] })[tipo] || []), defaultCat.value] };
      c.customCategorias = { ...c.customCategorias, [tipo]: [...c.customCategorias[tipo], { value: `custom_${newValue}`, label: next }] };
    }
    persistConfig(c);
    const oldValue = customCat?.value || defaultCat?.value;
    if (oldValue) {
      persist(entries.map(e => e.categoria === oldValue ? { ...e, categoria: customCat ? `custom_${newValue}` : `custom_${newValue}` } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
    }
  };

  const addSubcategoria = (cat: string, item: string) => {
    const c = { ...finConfig };
    c.customSubcategorias = { ...c.customSubcategorias, [cat]: [...(c.customSubcategorias[cat] || []), item] };
    persistConfig(c);
  };
  const removeSubcategoria = (cat: string, item: string) => {
    const c = { ...finConfig };
    const isDefault = (DEFAULT_SUBCATEGORIAS[cat] || []).includes(item);
    const isCustom = (c.customSubcategorias[cat] || []).includes(item);
    if (isCustom) {
      c.customSubcategorias = { ...c.customSubcategorias, [cat]: (c.customSubcategorias[cat] || []).filter(s => s !== item) };
    }
    if (isDefault) {
      const removedSubs = { ...(c.removedSubcategorias || {}) };
      removedSubs[cat] = [...(removedSubs[cat] || []), item];
      c.removedSubcategorias = removedSubs;
    }
    persistConfig(c);
    persist(entries.map(e => e.subcategoria === item && e.categoria === cat ? { ...e, subcategoria: "" } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };
  // Migrate all entries from one subcategory to another within the same category, then remove the source
  const migrateSubcategoria = (cat: string, oldItem: string, targetItem: string) => {
    if (!targetItem || oldItem === targetItem) return;
    // 1. Migrate entries
    persist(entries.map(e => (e.categoria === cat && e.subcategoria === oldItem) ? { ...e, subcategoria: targetItem } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
    // 2. Remove the source subcategory from config
    const c = { ...finConfig };
    const isDefault = (DEFAULT_SUBCATEGORIAS[cat] || []).includes(oldItem);
    const isCustom = (c.customSubcategorias[cat] || []).includes(oldItem);
    if (isCustom) {
      c.customSubcategorias = { ...c.customSubcategorias, [cat]: (c.customSubcategorias[cat] || []).filter(s => s !== oldItem) };
    }
    if (isDefault) {
      const removedSubs = { ...((c as any).removedSubcategorias || {}) };
      removedSubs[cat] = [...(removedSubs[cat] || []), oldItem];
      (c as any).removedSubcategorias = removedSubs;
    }
    persistConfig(c);
  };
  const renameSubcategoria = (cat: string, old: string, next: string) => {
    if (!next) return;
    const c = { ...finConfig };
    const isDefault = (DEFAULT_SUBCATEGORIAS[cat] || []).includes(old);
    const isCustom = (c.customSubcategorias[cat] || []).includes(old);
    if (isCustom) {
      c.customSubcategorias = { ...c.customSubcategorias, [cat]: (c.customSubcategorias[cat] || []).map(s => s === old ? next : s) };
    } else if (isDefault) {
      // Remove the default by tracking it, add the new name as custom
      const removedSubs = { ...((c as any).removedSubcategorias || {}) };
      removedSubs[cat] = [...(removedSubs[cat] || []), old];
      (c as any).removedSubcategorias = removedSubs;
      c.customSubcategorias = { ...c.customSubcategorias, [cat]: [...(c.customSubcategorias[cat] || []), next] };
    }
    persistConfig(c);
    persist(entries.map(e => e.subcategoria === old && e.categoria === cat ? { ...e, subcategoria: next } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };

  // Get the effective tag key for the current form context
  const getTagKey = useCallback(() => {
    const cat = form.categoria;
    if (!cat) return "";
    if (form.subcategoria) {
      const subKey = `${cat}:${form.subcategoria}`;
      if ((TAGS[subKey] || []).length > 0) return subKey;
    }
    return cat;
  }, [form.categoria, form.subcategoria, TAGS]);

  const addTag = (tag: string) => {
    const key = getTagKey();
    if (!key) return;
    const existing = finConfig.customTags[key] || [];
    const c = { ...finConfig, customTags: { ...finConfig.customTags, [key]: [...existing, tag] } };
    persistConfig(c);
  };
  const removeTag = (tag: string) => {
    const key = getTagKey();
    if (!key) return;
    // Remove from custom tags
    const existing = finConfig.customTags[key] || [];
    const updatedCustom = { ...finConfig.customTags, [key]: existing.filter(t => t !== tag) };
    // If it's a default tag, store as "removed" so it doesn't reappear
    const isDefault = (DEFAULT_TAGS[key] || []).includes(tag);
    const removedTags = { ...(finConfig.removedTags || {}) };
    if (isDefault) {
      removedTags[key] = [...(removedTags[key] || []), tag];
    }
    const c = { ...finConfig, customTags: updatedCustom, removedTags };
    persistConfig(c);
    persist(entries.map(e => e.tags?.includes(tag) ? { ...e, tags: (e.tags || []).filter(t => t !== tag) } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };
  const renameTag = (old: string, next: string) => {
    if (!next) return;
    const key = getTagKey();
    if (!key) return;
    const isDefault = (DEFAULT_TAGS[key] || []).includes(old);
    const isCustom = (finConfig.customTags[key] || []).includes(old);
    const c = { ...finConfig };
    if (isCustom) {
      c.customTags = { ...c.customTags, [key]: (c.customTags[key] || []).map(t => t === old ? next : t) };
    } else if (isDefault) {
      // Remove default, add as custom with new name
      const removedTags = { ...(c.removedTags || {}) };
      removedTags[key] = [...(removedTags[key] || []), old];
      c.removedTags = removedTags;
      c.customTags = { ...c.customTags, [key]: [...(c.customTags[key] || []), next] };
    }
    persistConfig(c);
    persist(entries.map(e => e.tags?.includes(old) ? { ...e, tags: (e.tags || []).map(t => t === old ? next : t) } : e)).catch(err => { console.error("[FinanceiroPage] persist error:", err); toast.error("Erro ao salvar. Verifique sua conexão."); });
  };

  const monthLabel = customRangeMode && customFrom && customTo
    ? `${format(customFrom, "dd/MM")} — ${format(customTo, "dd/MM/yyyy")}`
    : format(currentMonth, "MMMM yyyy", { locale: ptBR });

  // Pending count
  const pendingCount = monthEntries.filter(e => !e.pago && !e.ignorada).length;
  const pendingTotal = monthEntries.filter(e => !e.pago && !e.ignorada).reduce((s, e) => s + e.valor, 0);

  // Category icon map
  const catIconMap: Record<string, string> = {
    aluguel: "🛵", caucao: "🛡️", manutencao_receita: "🔧", multa_transito_receita: "📄",
    venda_moto: "🏍️", pecas_receita: "📦", juros_atraso: "💰", outro_receita: "💰",
    compra_moto: "🏍️", manutencao_despesa: "🔧", seguro: "🛡️", rastreador: "📡",
    multa_transito: "📄", imposto: "📋", sistema: "💻", equipe: "👥",
    marketing: "📢", lava_jato: "🚿", taxas: "🏦", assinaturas: "📱", outro_despesa: "💰",
  };

  // Receitas breakdown
  const receitasRealizadas = monthEntries.filter(e => !e.ignorada && e.tipo === "receita" && e.pago).length;
  const receitasPendentesCount = monthEntries.filter(e => !e.ignorada && e.tipo === "receita" && !e.pago).length;
  const despesasRealizadas = monthEntries.filter(e => !e.ignorada && e.tipo === "despesa" && e.pago).length;
  const despesasPendentesCount = monthEntries.filter(e => !e.ignorada && e.tipo === "despesa" && !e.pago).length;
  const totalTransacoes = monthEntries.filter(e => !e.ignorada).length;

  // Bank balances — cálculo único compartilhado com /contas
  const { bankBalances, registeredAccountNames } = useMemo(() => {
    const registered = new Set<string>();
    (bankAccountsList || []).forEach((account: any) => {
      registered.add(account.nome);
    });
    const accountBalances = calculateAccountBalances(bankAccountsList || [], entries, 90);
    const bals = Object.fromEntries(Object.entries(accountBalances).map(([name, balance]) => [name, balance.atual]));
    return { bankBalances: bals, registeredAccountNames: registered };
  }, [entries, bankAccountsList]);
  // Total em caixa: only sum registered accounts (ignore "Sem conta" and unknown)
  const totalCaixa = Object.entries(bankBalances)
    .filter(([name]) => registeredAccountNames.has(name))
    .reduce((sum, [, val]) => sum + val, 0);
  const displayBankNames = Array.from(new Set([...CONTAS, ...Object.keys(bankBalances)])).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

  const mono = "font-mono";

  // Bank icon colors
  const BANK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    "C6": { bg: "bg-[#242424]", text: "text-white", label: "C6" },
    "Mercado Pago": { bg: "bg-[#009ee3]", text: "text-white", label: "MP" },
    "Dinheiro": { bg: "bg-success/20", text: "text-success", label: "$" },
    "Nubank": { bg: "bg-[#820ad1]", text: "text-white", label: "Nu" },
    "Inter": { bg: "bg-[#ff7a00]", text: "text-white", label: "In" },
    "Itaú": { bg: "bg-[#003399]", text: "text-white", label: "Itaú" },
  };
  const getBankBadge = (conta: string) => {
    const bank = BANK_COLORS[conta];
    if (!bank) return { bg: "bg-muted", text: "text-muted-foreground", label: conta?.charAt(0)?.toUpperCase() || "?" };
    return bank;
  };

  const hasActiveFilters =categoriaFilter !== "all" || contaFilter !== "all" || dateFrom || dateTo || placaFilter || locatarioFilter || tipoFilter !== "all" || onlyPagas || onlyPendentes || onlyRecorrentes || dueFilter !== "all" || ignoradasFilter !== "incluir" || search;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão geral de receitas e despesas da frota</p>
        </div>
        <ImportExportBar
          kind="financeiro"
          items={entries}
          motos={motos}
          onImport={async (rows) => {
            const newEntries = rows.map(r => r.data as FinancialEntry);
            try {
              const { getBulkInsertCallback } = await import("@/lib/data-cache");
              const cb = getBulkInsertCallback();
              if (cb) {
                await cb("financial_entries", newEntries);
                setEntries(prev => {
                  const remainingById = new Map(prev.map(e => [e.id, e]));
                  const existingByKey = new Map<string, FinancialEntry[]>();

                  prev.forEach(entry => {
                    const key = buildImportReconciliationKey(entry);
                    const bucket = existingByKey.get(key) || [];
                    bucket.push(entry);
                    existingByKey.set(key, bucket);
                  });

                  newEntries.forEach(entry => {
                    const key = buildImportReconciliationKey(entry);
                    const bucket = existingByKey.get(key) || [];
                    const matched = bucket.find(item => item.id === entry.id) || bucket.shift();

                    if (matched) {
                      remainingById.delete(matched.id);
                      if (!bucket.length) existingByKey.delete(key);
                      else existingByKey.set(key, bucket.filter(item => item.id !== matched.id));
                    }

                    remainingById.set(entry.id, entry);
                  });

                  return Array.from(remainingById.values());
                });
              } else {
                const remainingById = new Map(entries.map(e => [e.id, e]));
                const existingByKey = new Map<string, FinancialEntry[]>();

                entries.forEach(entry => {
                  const key = buildImportReconciliationKey(entry);
                  const bucket = existingByKey.get(key) || [];
                  bucket.push(entry);
                  existingByKey.set(key, bucket);
                });

                newEntries.forEach(entry => {
                  const key = buildImportReconciliationKey(entry);
                  const bucket = existingByKey.get(key) || [];
                  const matched = bucket.find(item => item.id === entry.id) || bucket.shift();

                  if (matched) {
                    remainingById.delete(matched.id);
                    if (!bucket.length) existingByKey.delete(key);
                    else existingByKey.set(key, bucket.filter(item => item.id !== matched.id));
                  }

                  remainingById.set(entry.id, entry);
                });

                persist(Array.from(remainingById.values()));
              }

              focusImportedPeriod(newEntries);
              setDateFrom("");
              setDateTo("");
              setCurrentPage(1);
              toast.success("Importação concluída e período ajustado para exibir os lançamentos importados.");
            } catch (err: any) {
              console.error("Erro na importação:", err);
              toast.error(err?.message || "A importação foi interrompida antes de concluir todos os lançamentos.");
              throw err;
            }
          }}
        />
      </div>

      {/* ── Period Navigator Bar — always visible, prominent ── */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <div className="flex items-center bg-primary/5 rounded-xl border-2 border-primary/30 p-1 gap-0.5">
          {!customRangeMode && (
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="p-2.5 rounded-lg text-primary hover:bg-primary/10 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <button onClick={() => { if (customRangeMode) { setCustomRangeMode(false); } else { setCurrentMonth(new Date()); } }}
            className="px-6 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground capitalize min-w-[160px] text-center">
            {monthLabel}
          </button>
          {!customRangeMode && (
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="p-2.5 rounded-lg text-primary hover:bg-primary/10 transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          {customRangeMode && (
            <button onClick={() => { setCustomRangeMode(false); setCustomFrom(undefined); setCustomTo(undefined); }}
              className="p-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors" title="Voltar para mês">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <Popover open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default" className="gap-2 h-10 text-sm">
              <Calendar className="h-4 w-4" /> Período
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 shadow-lg" align="end">
            <div className="flex divide-x divide-border">
              {/* Left: presets */}
              <div className="py-3 px-2 w-[150px] space-y-0.5">
                {[
                  { label: "Hoje", days: 0 },
                  { label: "Ontem", days: 1 },
                  { label: "Últimos 7 dias", days: 7 },
                  { label: "Últimos 14 dias", days: 14 },
                  { label: "Esta semana", days: -3 },
                  { label: "Semana passada", days: -4 },
                  { label: "Este mês", days: -1 },
                  { label: "Mês passado", days: -2 },
                  { label: "Este trimestre", days: -5 },
                  { label: "Trimestre passado", days: -6 },
                  { label: "Este semestre", days: -7 },
                  { label: "Este ano", days: -8 },
                  { label: "Ano passado", days: -9 },
                  { label: "Máximo", days: -10 },
                ].map(p => (
                  <button
                    key={p.label}
                    className="w-full text-left text-[13px] px-3 py-1.5 rounded-md transition-colors text-foreground hover:bg-accent"
                    onClick={() => {
                      const today = new Date();
                      let from: Date, to: Date;
                      if (p.days === 0) { from = today; to = today; }
                      else if (p.days === 1) { from = subDays(today, 1); to = subDays(today, 1); }
                      else if (p.days === -1) { from = startOfMonth(today); to = endOfMonth(today); }
                      else if (p.days === -2) { from = startOfMonth(subMonths(today, 1)); to = endOfMonth(subMonths(today, 1)); }
                      else if (p.days === -3) { const d = today.getDay(); from = subDays(today, d); to = today; }
                      else if (p.days === -4) { const d = today.getDay(); from = subDays(today, d + 7); to = subDays(today, d + 1); }
                      else if (p.days === -5) { const q = Math.floor(today.getMonth() / 3) * 3; from = new Date(today.getFullYear(), q, 1); to = today; }
                      else if (p.days === -6) { const q = Math.floor(today.getMonth() / 3) * 3; from = new Date(today.getFullYear(), q - 3, 1); to = new Date(today.getFullYear(), q, 0); }
                      else if (p.days === -7) { const s = today.getMonth() < 6 ? 0 : 6; from = new Date(today.getFullYear(), s, 1); to = today; }
                      else if (p.days === -8) { from = new Date(today.getFullYear(), 0, 1); to = today; }
                      else if (p.days === -9) { from = new Date(today.getFullYear() - 1, 0, 1); to = new Date(today.getFullYear() - 1, 11, 31); }
                      else if (p.days === -10) { from = new Date(2020, 0, 1); to = today; }
                      else { from = subDays(today, p.days); to = today; }
                      setCustomFrom(from);
                      setCustomTo(to);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Right: calendars */}
              <div className="p-3 space-y-2">
                <div className="flex gap-6 text-xs text-muted-foreground px-1">
                  <span>De: <span className="font-medium text-foreground">{customFrom ? format(customFrom, "dd/MM/yyyy") : "—"}</span></span>
                  <span>Até: <span className="font-medium text-foreground">{customTo ? format(customTo, "dd/MM/yyyy") : "—"}</span></span>
                </div>
                <CalendarComponent
                  mode="range"
                  selected={customFrom && customTo ? { from: customFrom, to: customTo } : customFrom ? { from: customFrom, to: undefined } : undefined}
                  onSelect={(range: any) => {
                    setCustomFrom(range?.from);
                    setCustomTo(range?.to);
                  }}
                  numberOfMonths={2}
                  className="p-0 pointer-events-auto"
                />
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} className="rounded border-border" />
                    Comparar com período anterior
                  </label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setCustomRangeMode(false); setCustomFrom(undefined); setCustomTo(undefined); setCustomRangeOpen(false); }}>
                      Limpar
                    </Button>
                    <Button size="sm" className="text-xs h-8" disabled={!customFrom || !customTo} onClick={() => { setCustomRangeMode(true); setCustomRangeOpen(false); }}>
                      Aplicar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {canCreate && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" className="h-10 w-10 rounded-full shadow-lg">
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => { setForm({ ...emptyEntry(), tipo: "despesa" }); setMode("add"); setDialogOpen(true); }} className="gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" /> Despesa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setForm({ ...emptyEntry(), tipo: "receita" }); setMode("add"); setDialogOpen(true); }} className="gap-2">
              <TrendingUp className="h-4 w-4 text-success" /> Receita
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTransferOpen(true)} className="gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Transferência
            </DropdownMenuItem>
            {creditCards.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1 flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" /> Cartão de crédito
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setForm({ ...emptyEntry(), tipo: "despesa" });
                    setParcelas(1);
                    setMode("add");
                    setDialogOpen(true);
                  }}
                  className="gap-2"
                >
                  <CreditCard className="h-4 w-4 text-primary" /> Despesa no cartão
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setAdvCardId(""); setAdvBank(""); setAdvOpen(true); }}
                  className="gap-2"
                >
                  <Banknote className="h-4 w-4 text-primary" /> Adiantar fatura
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      {/* ═══ BLOCO 1 — KPI Cards (prominent) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-success bg-success/[0.03]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Receitas</span>
              <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </div>
            <p className={`text-2xl font-bold text-success ${mono}`}>
              R$ {totals.receitasPagas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            {compTotals && (
              <CompBadge current={totals.receitasPagas} previous={compTotals.receitas} label={compTotals.label} positiveIsGood />
            )}
            {(totals.receitas - totals.receitasPagas) > 0.005 && (
              <p className="text-xs text-muted-foreground mt-1">
                Projeção: <span className={`font-medium ${mono} text-warning`}>R$ {totals.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span className="ml-1">(+R$ {(totals.receitas - totals.receitasPagas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pendente)</span>
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" />{receitasRealizadas} recebida{receitasRealizadas !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1"><Circle className="h-3 w-3 text-warning" />{receitasPendentesCount} pendente{receitasPendentesCount !== 1 ? "s" : ""}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive bg-destructive/[0.03]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Despesas</span>
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
            </div>
            <p className={`text-2xl font-bold text-destructive ${mono}`}>
              R$ {totals.despesasPagas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            {compTotals && (
              <CompBadge current={totals.despesasPagas} previous={compTotals.despesas} label={compTotals.label} positiveIsGood={false} />
            )}
            {(totals.despesas - totals.despesasPagas) > 0.005 && (
              <p className="text-xs text-muted-foreground mt-1">
                Projeção: <span className={`font-medium ${mono} text-warning`}>R$ {totals.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span className="ml-1">(+R$ {(totals.despesas - totals.despesasPagas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pendente)</span>
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" />{despesasRealizadas} paga{despesasRealizadas !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1"><Circle className="h-3 w-3 text-warning" />{despesasPendentesCount} pendente{despesasPendentesCount !== 1 ? "s" : ""}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary bg-primary/[0.03]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Saldo do Período</span>
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            {(() => {
              const saldoRealizado = totals.saldoEfetuado; // receitasPagas - despesasPagas
              const saldoProjecao = totals.saldo; // receitas - despesas (se tudo pendente resolver)
              const temPendente = Math.abs(saldoProjecao - saldoRealizado) > 0.005;
              return (
                <>
                  <p className={`text-2xl font-bold ${saldoRealizado >= 0 ? "text-success" : "text-destructive"} ${mono}`}>
                    {saldoRealizado < 0 ? "– " : ""}R$ {Math.abs(saldoRealizado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  {compTotals && (
                    <CompBadge current={saldoRealizado} previous={compTotals.saldo} label={compTotals.label} positiveIsGood />
                  )}
                  {temPendente && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Projeção: <span className={`font-medium ${mono} ${saldoProjecao >= 0 ? "text-warning" : "text-destructive"}`}>
                        {saldoProjecao < 0 ? "– " : ""}R$ {Math.abs(saldoProjecao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span>{totalTransacoes} transaç{totalTransacoes !== 1 ? "ões" : "ão"} no período</span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ═══ BLOCO 2 — Bank Balances (compact) ═══ */}
      {(() => {
        const bankOnly = (bankAccountsList || []).filter((a: any) => a.tipo !== "cartao");
        const bankOnlyNames = new Set(bankOnly.map((a: any) => a.nome as string));
        return (
          <div className="space-y-3">
            {/* Contas bancárias */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {bankOnly.map((account: any) => {
                const banco = account.nome as string;
                const saldo = bankBalances[banco] || 0;
                const isSelected = contaFilter === banco;
                return (
                  <div
                    key={banco}
                    onClick={() => { setContaFilter(isSelected ? "all" : banco); setActiveTab("transacoes"); }}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-colors select-none ${
                      isSelected ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30" : "bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-border/70"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BankIcon conta={account.banco} size={22} />
                      <span className={`text-xs font-medium uppercase tracking-wider ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{banco}</span>
                    </span>
                    <span className={`text-sm font-semibold ${mono} ${saldo < 0 ? "text-destructive" : isSelected ? "text-primary" : "text-foreground"}`}>
                      {saldo < 0 ? "–" : ""}R$ {Math.abs(saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-success/5 border border-success/20">
                <span className="text-xs font-medium text-success uppercase tracking-wider">Total em Caixa</span>
                <span className={`text-sm font-bold ${mono} ${totalCaixa >= 0 ? "text-success" : "text-destructive"}`}>
                  {totalCaixa < 0 ? "–" : ""}R$ {Math.abs(totalCaixa).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Cartões de crédito */}
            {creditCards.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {creditCards.map((card: any) => {
                  const saldo = bankBalances[card.nome] || 0;
                  const limite = card.limite || 0;
                  const usado = Math.max(0, -saldo);
                  const disponivel = Math.max(0, limite - usado);
                  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
                  const isSelected = selectedCCCard?.nome === card.nome;
                  const isActive = selectedCCCard?.nome === card.nome;
                  return (
                    <div
                      key={card.nome}
                      onClick={() => {
                        if (isActive) {
                          setSelectedCCCard(null);
                          setCcViewYm("");
                        } else {
                          const invoices = getCardInvoicesList(card as any, entries || []);
                          const openInv = invoices.find(i => i.status === "Aberta") || invoices.find(i => i.total > 0) || invoices[0];
                          setSelectedCCCard(card);
                          setCcViewYm(openInv?.ymKey || "");
                        }
                      }}
                      className={`flex flex-col gap-2 px-4 py-3 rounded-lg border cursor-pointer transition-colors select-none ${
                        isActive ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30" : "bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-border/70"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-xs font-medium uppercase tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>{card.nome}</span>
                        </span>
                        <span className={`text-xs font-semibold ${mono} ${usado > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {usado > 0 ? `– R$ ${usado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00"}
                        </span>
                      </div>
                      {limite > 0 && (
                        <>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
                            <div className="h-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Disponível</span>
                            <span className={`font-mono font-medium ${isActive ? "text-primary" : "text-emerald-600"}`}>
                              R$ {disponivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ BLOCO CC — Vista dedicada de cartão de crédito ═══ */}
      {selectedCCCard && (() => {
        const card = selectedCCCard;
        const invoices = getCardInvoicesList(card as any, entries || []);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const currentInvoice = invoices.find(i => i.ymKey === ccViewYm) || invoices[0];
        const invId = `inv__${card.id}__${ccViewYm}`;
        const invEntry = entries.find(e => e.id === invId);
        // Compute ccEntries first so we can use allExpensesPaid in isPaid.
        // Uses computeCardInvoiceYm(e.data) to correctly place entries regardless
        // of whether dataPrevista was set (new entries) or not (old entries).
        const ccEntries = (entries || []).filter(e =>
          e.conta === card.nome &&
          e.categoria !== "fatura_cartao" &&
          !e.deletedAt &&
          computeCardInvoiceYm(e.data, card as any) === ccViewYm
        ).sort((a, b) => a.data.localeCompare(b.data));
        const allExpensesPaid = ccEntries.length > 0 && ccEntries.every(e => e.pago);
        const isPaid = !!(invEntry?.pago || currentInvoice?.status === "Paga" || allExpensesPaid);
        const totalFatura = currentInvoice?.total || 0;
        const saldoFatura = isPaid ? 0 : (invEntry?.valor ?? totalFatura);
        const pagoParcial = Math.max(0, totalFatura - saldoFatura);
        const dueDate = currentInvoice ? new Date(currentInvoice.dueDate + "T00:00:00") : null;
        const isFaturaOverdue = !isPaid && dueDate && dueDate < today && totalFatura > 0;
        const daysOverdueFatura = isFaturaOverdue ? Math.floor((today.getTime() - dueDate!.getTime()) / 86400000) : 0;
        const daysUntilDue = !isPaid && dueDate && !isFaturaOverdue && totalFatura > 0
          ? Math.floor((dueDate.getTime() - today.getTime()) / 86400000) : null;
        const fmtC = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        const invIdx = invoices.findIndex(i => i.ymKey === ccViewYm);
        const canPrev = invIdx > 0;
        const canNext = invIdx < invoices.length - 1;
        const mono = "font-mono";
        const getCatLabelCC = (cat: string, tipo: string) => {
          const cats = tipo === "receita" ? DEFAULT_CATEGORIAS.receita : DEFAULT_CATEGORIAS.despesa;
          return (cats as any[]).find((c: any) => c.value === cat)?.label || cat;
        };
        return (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { setSelectedCCCard(null); setCcViewYm(""); }}>
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <span className="font-bold text-lg">{card.nome}</span>
                {card.banco && <span className="text-sm text-muted-foreground">· {card.banco}</span>}
              </div>
              {card.limite > 0 && (
                <span className="ml-auto text-sm text-muted-foreground">Limite: <span className="font-semibold text-foreground">{fmtC(card.limite)}</span></span>
              )}
            </div>

            {/* Fatura chips — month navigator */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canPrev} onClick={() => canPrev && setCcViewYm(invoices[invIdx - 1].ymKey)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1.5 flex-wrap">
                {invoices.filter(i => i.status !== "Zerada" || i.ymKey === ccViewYm).map(inv => (
                  <button
                    key={inv.ymKey}
                    onClick={() => setCcViewYm(inv.ymKey)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                      inv.ymKey === ccViewYm
                        ? "bg-primary text-primary-foreground border-primary"
                        : inv.status === "Paga" ? "border-success/40 text-success bg-success/10 hover:bg-success/20"
                        : inv.status === "Aberta" ? "border-warning/40 text-warning bg-warning/10 hover:bg-warning/20"
                        : "border-border/40 text-muted-foreground hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    {new Date(inv.ymKey + "-15").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                    {inv.status === "Paga" && " ✓"}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canNext} onClick={() => canNext && setCcViewYm(invoices[invIdx + 1].ymKey)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Fatura summary */}
            {(() => {
              const handlePayFatura = () => {
                if (invEntry) { togglePago(invEntry.id); return; }
                if (!currentInvoice || totalFatura <= 0) return;
                const newInv = {
                  id: invId,
                  tipo: "despesa" as const,
                  categoria: "fatura_cartao",
                  descricao: `Fatura ${card.nome} • ${ccViewYm}`,
                  valor: totalFatura,
                  data: new Date().toISOString().split("T")[0],
                  dataPrevista: currentInvoice.dueDate,
                  pago: false,
                  conta: card.contaPagamento || "",
                  natureza: "administrativa" as const,
                  tags: ["Fatura cartão"],
                  observacao: `Pagamento automático da fatura do cartão ${card.nome}.`,
                  ignorada: true,
                  motoId: null, rentalId: null, clienteId: null, classificacaoManual: false,
                };
                const updated = entries.some(e => e.id === invId)
                  ? entries
                  : [...entries, newInv as any];
                persistWithFeedback(updated).then(() => {
                  setTimeout(() => togglePago(invId), 200);
                });
              };
              const handleUndoFatura = () => { if (invEntry) togglePago(invEntry.id); };
              return (
                <div className={`rounded-xl border px-5 py-4 ${isFaturaOverdue ? "border-destructive/30 bg-destructive/[0.03]" : isPaid ? "border-success/30 bg-success/[0.03]" : "border-border/50 bg-muted/10"}`}>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-end gap-2 shrink-0">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Fatura</span>
                        <span className="font-bold text-base capitalize">
                          {new Date(ccViewYm + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                        </span>
                      </div>
                      {dueDate && (
                        <span className="text-xs text-muted-foreground mb-0.5">vence {dueDate.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Total</span>
                        <span className={`font-bold ${mono} text-base`}>{fmtC(totalFatura)}</span>
                      </div>
                      {pagoParcial > 0 && (
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">Adiantado</span>
                          <span className={`font-bold ${mono} text-base text-success`}>{fmtC(pagoParcial)}</span>
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Pendente</span>
                        <span className={`font-bold ${mono} text-base ${isPaid ? "text-success" : saldoFatura > 0 ? "text-destructive" : "text-muted-foreground"}`}>{fmtC(saldoFatura)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap ml-auto">
                      {isFaturaOverdue && <span className="text-destructive font-semibold flex items-center gap-1 text-sm"><AlertTriangle className="h-4 w-4" /> Vencida há {daysOverdueFatura}d</span>}
                      {daysUntilDue !== null && <span className={`text-sm font-medium ${daysUntilDue <= 3 ? "text-amber-600" : "text-muted-foreground"}`}>Vence em {daysUntilDue === 0 ? "hoje" : `${daysUntilDue}d`}</span>}
                      {isPaid && <span className="text-success font-semibold flex items-center gap-1 text-sm"><CheckCircle2 className="h-4 w-4" /> Paga</span>}
                      {!isPaid && totalFatura > 0 && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setAdvCardId(card.id); const c = creditCards.find((x: any) => x.id === card.id); if (c?.contaPagamento) setAdvBank(c.contaPagamento); setAdvOpen(true); }}>
                          <Banknote className="h-3.5 w-3.5" /> Adiantar fatura
                        </Button>
                      )}
                      {!isPaid && totalFatura > 0 && (
                        <Button size="sm" className="h-8 gap-1.5" onClick={handlePayFatura}>
                          <CheckCheck className="h-3.5 w-3.5" /> Pagar fatura
                        </Button>
                      )}
                      {isPaid && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-muted-foreground" onClick={handleUndoFatura} disabled={!invEntry}>
                          <Circle className="h-3.5 w-3.5" /> Desfazer
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* CC transactions table — same row format as main transactions table */}
            <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/40">
                      <th className="w-[3px] p-0"></th>
                      <th className="text-center py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</span></th>
                      <th className="text-left py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</span></th>
                      <th className="text-left py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Placa</span></th>
                      <th className="text-left py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Categoria / Sub</span></th>
                      <th className="text-left py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Obs.</span></th>
                      <th className="text-left py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</span></th>
                      <th className="text-center py-2.5 px-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data Compra</span></th>
                      <th className="text-right py-2.5 px-2 w-[120px]"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Valor</span></th>
                      <th className="w-[36px] p-0"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ccEntries.length === 0 && (
                      <tr><td colSpan={10} className="py-16 text-center text-muted-foreground text-sm">Nenhuma despesa nesta fatura</td></tr>
                    )}
                    {ccEntries.map((e) => {
                      const motoPlaca = e.motoId ? (motos.find(m => m.id === e.motoId)?.placa || e.placa || null) : (e.placa || null);
                      const rawClientName = e.clienteId ? (clients.find(c => c.id === e.clienteId)?.nome || e.clienteNome || null) : (e.clienteNome || null);
                      const fmtClientName = rawClientName ? rawClientName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : null;
                      const catLabel = getCatLabelCC(e.categoria, e.tipo);
                      const entryOverdue = isOverdue(e);
                      const fmtDateCC = (d: string) => { try { return format(parseISO(d), "dd/MM"); } catch { return d; } };
                      const fmtValor = `R$ ${e.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
                      const isOperacional = e.natureza === "operacional" || (!e.natureza && !!motoPlaca);
                      const isInvestimento = e.natureza === "investimento";
                      return (
                        <tr key={e.id}
                          id={`entry-row-${e.id}`}
                          className={`border-b border-border/20 hover:bg-muted/30 transition-colors group cursor-pointer ${e.ignorada ? "opacity-40" : ""}`}
                          onClick={() => setDetailEntry(e)}
                        >
                          <td className="p-0"><div className="w-[3px] h-full min-h-[44px]" style={{ backgroundColor: e.pago ? "hsl(var(--success))" : entryOverdue ? "hsl(var(--destructive))" : "hsl(var(--warning))" }} /></td>
                          <td className="py-2 px-2 text-center">
                            <span className="cursor-default">
                              {e.pago ? <CheckCircle2 className="h-5 w-5 text-success" /> : entryOverdue ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Circle className="h-5 w-5 text-warning" />}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <span className={`text-xs font-semibold whitespace-nowrap ${isInvestimento ? "text-amber-600 dark:text-amber-400" : isOperacional ? "text-blue-600 dark:text-blue-400" : "text-purple-600 dark:text-purple-400"}`}>
                              {isInvestimento ? "Invest." : isOperacional ? "Oper." : "Admin."}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            {motoPlaca ? <span className={`${mono} text-sm font-bold text-foreground whitespace-nowrap`}>{motoPlaca}</span> : <span className="text-xs text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-2 px-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-foreground whitespace-nowrap">{catLabel}</span>
                                {e.subcategoria && <span className="text-xs text-muted-foreground whitespace-nowrap">› {e.subcategoria}</span>}
                              </div>
                              {fmtClientName && <span className="text-xs text-muted-foreground mt-0.5 block">{fmtClientName}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 max-w-[200px]">
                            {e.observacao ? (
                              <span className="text-xs font-medium text-foreground/80 italic truncate block" title={e.observacao}>{e.observacao}</span>
                            ) : <span className="text-xs text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(e.tags || []).map(t => (
                                <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">{t}</span>
                              ))}
                              {e.recorrente && <Repeat className="h-3.5 w-3.5 text-muted-foreground/60" />}
                              {!(e.tags || []).length && !e.recorrente && <span className="text-xs text-muted-foreground/40">—</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-sm ${mono} whitespace-nowrap text-muted-foreground`}>{fmtDateCC(e.data)}</span>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <span className={`text-sm font-bold ${mono} whitespace-nowrap text-destructive`}>– {fmtValor}</span>
                          </td>
                          <td className="py-2 pr-1" onClick={(ev) => ev.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => { setForm(resolveEntryAssociations({ ...e })); setMode("edit"); setDialogOpen(true); }} className="gap-2 text-xs">
                                    <Pencil className="h-3.5 w-3.5" /> Editar
                                  </DropdownMenuItem>
                                )}
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => handleDelete(e.id)} className="gap-2 text-xs text-destructive focus:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ BLOCO 3 — Tabs ═══ */}
      {!selectedCCCard && <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b border-border/50">
          <div className="flex gap-6">
            {[
              { value: "transacoes", label: "Transações" },
              { value: "categorias", label: "Categorias" },
              { value: "evolucao", label: "Evolução" },
            ].map(tab => (
              <button key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`pb-2.5 text-sm font-medium transition-colors relative ${
                  activeTab === tab.value
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}>
                {tab.label}
                {activeTab === tab.value && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* TAB: Transações */}
        <TabsContent value="transacoes" className="space-y-3 mt-4">

          {/* ═══ Compact Filters ═══ */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border/60 overflow-hidden bg-background">
                {([
                  { key: "all", label: "Todos" },
                  { key: "receita", label: "Receitas" },
                  { key: "despesa", label: "Despesas" },
                ] as const).map(chip => (
                  <button key={chip.key}
                    onClick={() => setTipoFilter(chip.key)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      tipoFilter === chip.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
                    }`}>
                    {chip.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                <Switch checked={onlyPagas} onCheckedChange={v => { setOnlyPagas(v); if (v) setOnlyPendentes(false); }} className="scale-75" />
                Pagas
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                <Switch checked={onlyPendentes} onCheckedChange={v => { setOnlyPendentes(v); if (v) setOnlyPagas(false); }} className="scale-75" />
                Pendentes
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                <Switch checked={onlyRecorrentes} onCheckedChange={v => setOnlyRecorrentes(v)} className="scale-75" />
                <Repeat className="h-3 w-3" /> Recorrentes
              </label>
              <div className="inline-flex rounded-lg border border-border/60 overflow-hidden bg-background">
                {([
                  { key: "all", label: "Todos vencimentos" },
                  { key: "atrasadas", label: "Em atraso" },
                  { key: "hoje", label: "Vence hoje" },
                  { key: "amanha", label: "Vence amanhã" },
                ] as const).map(chip => (
                  <button key={chip.key}
                    onClick={() => setDueFilter(chip.key)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      dueFilter === chip.key
                        ? (chip.key === "atrasadas" ? "bg-destructive text-destructive-foreground"
                          : chip.key === "hoje" ? "bg-warning text-warning-foreground"
                          : chip.key === "amanha" ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground")
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}>
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-lg border border-border/60 overflow-hidden bg-background" title="Transações ignoradas não entram nos totais">
                {([
                  { key: "incluir", label: "Com ignoradas" },
                  { key: "ocultar", label: "Sem ignoradas" },
                  { key: "somente", label: "Só ignoradas" },
                ] as const).map(chip => (
                  <button key={chip.key}
                    onClick={() => setIgnoradasFilter(chip.key)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      ignoradasFilter === chip.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                    }`}>
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full bg-background border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Buscar descrição, placa, locatário, valor…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {hasActiveFilters && (
                <button onClick={() => { setCategoriaFilter("all"); setContaFilter("all"); setDateFrom(""); setDateTo(""); setPlacaFilter(""); setLocatarioFilter(""); setOnlyPagas(false); setOnlyPendentes(false); setOnlyRecorrentes(false); setDueFilter("all"); setIgnoradasFilter("incluir"); setTipoFilter("all"); setSearch(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">Limpar</button>
              )}
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Inicial</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-7 text-xs mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Final</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-7 text-xs mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Locatário</Label>
                    <SearchableSelect
                      value={locatarioFilter}
                      onValueChange={setLocatarioFilter}
                      placeholder="Todos"
                      options={[
                        { value: "", label: "Todos" },
                        ...Array.from(new Set(filteredSource.map(e => {
                          const name = e.clienteId ? (clients.find(c => c.id === e.clienteId)?.nome || e.clienteNome || "") : (e.clienteNome || "");
                          return name;
                        }).filter(Boolean))).sort().map(n => ({ value: n, label: n.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") }))
                      ]}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Placa</Label>
                    <SearchableSelect
                      value={placaFilter}
                      onValueChange={setPlacaFilter}
                      placeholder="Todas"
                      options={[
                        { value: "", label: "Todas" },
                        ...(() => {
                          const validPlacas = new Set(
                            motos.filter(m => m.status !== "vendida" && m.status !== "inativa").map(m => m.placa).filter(Boolean)
                          );
                          return Array.from(new Set(filteredSource.map(e => {
                            const moto = e.motoId ? motos.find(m => m.id === e.motoId) : null;
                            const p = moto?.placa || e.placa || "";
                            return p;
                          }).filter(p => p && validPlacas.has(p)))).sort().map(p => ({ value: p, label: p }));
                        })()
                      ]}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Categoria</Label>
                    <SearchableSelect
                      value={categoriaFilter}
                      onValueChange={setCategoriaFilter}
                      placeholder="Todas"
                      options={[
                        { value: "all", label: "Todas" },
                        ...[...CATEGORIAS.receita, ...CATEGORIAS.despesa]
                          .filter((c, i, arr) => arr.findIndex(x => x.label === c.label) === i)
                          .flatMap(c => {
                            const subs = SUBCATEGORIAS[c.value] || [];
                            // Also include subcategories from sibling category values
                            const siblingValues = CATEGORY_SIBLINGS[c.value] || [c.value];
                            const allSubs = [...new Set([
                              ...subs,
                              ...siblingValues.flatMap(sv => SUBCATEGORIAS[sv] || [])
                            ])];
                            return [
                              { value: c.value, label: c.label },
                              ...allSubs.map(sub => ({ value: `${c.value}::${sub}`, label: `  ↳ ${sub}` }))
                            ];
                          })
                      ]}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Banco</Label>
                    <SearchableSelect
                      value={contaFilter}
                      onValueChange={setContaFilter}
                      placeholder="Todos"
                      options={[
                        { value: "all", label: "Todos" },
                        { value: "__cards__", label: "💳 Cartões de crédito" },
                        ...CONTAS.map(c => ({ value: c, label: c })),
                        { value: "__none__", label: "Sem conta" }
                      ]}
                    />
                  </div>
                </div>
              </div>
            {/* ── Totais do filtro ── */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {filteredNonCC.length} lançamento{filteredNonCC.length !== 1 ? "s" : ""}
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-success" />
                  Receitas: <span className={`ml-0.5 font-semibold text-success ${mono}`}>R$ {totals.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  Despesas: <span className={`ml-0.5 font-semibold text-destructive ${mono}`}>R$ {totals.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  Saldo: <span className={`ml-0.5 font-bold ${totals.saldo >= 0 ? "text-success" : "text-destructive"} ${mono}`}>
                    {totals.saldo < 0 ? "– " : ""}R$ {Math.abs(totals.saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </span>
                {filteredTotals.totalPendente > 0.005 && (
                  <span className="text-muted-foreground/80">Pendente: <span className={`font-medium text-warning ${mono}`}>R$ {filteredTotals.totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></span>
                )}
                {Math.abs(filteredTotals.totalAtrasado) > 0.005 && (
                  <span className="font-semibold text-destructive">Atrasado: <span className={mono}>R$ {Math.abs(filteredTotals.totalAtrasado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></span>
                )}
              </div>
            </div>
          </div>

          {/* ═══ Transaction Table ═══ */}
          <div ref={tableContainerRef} className="rounded-xl border border-border/50 overflow-hidden bg-card scroll-mt-24">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/40">
                    <th className="w-[3px] p-0"></th>
                    <th className="text-center py-2.5 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                        <HelpTip text="Efetuado: pagamento confirmado. Pendente: aguardando. Atrasado: vencimento ultrapassado." />
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</span>
                        <HelpTip text="Operacional: vinculado a uma moto/locação. Administrativo: despesa/receita geral da empresa." />
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Placa</span>
                        <HelpTip text="Placa da moto vinculada a esta transação." />
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Categoria / Sub</span>
                        <HelpTip text="Classificação da transação. Subcategoria detalha o tipo específico." />
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Obs.</span>
                        <HelpTip text="Observações e notas sobre a transação." />
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</span>
                        <HelpTip text="Etiquetas para organizar e filtrar transações." />
                      </div>
                    </th>
                    <th className="text-center py-2.5 px-2 w-[80px]">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Cobrança</span>
                    </th>
                    <th className="text-center py-2.5 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Conta</span>
                        <HelpTip text="Conta bancária ou forma de pagamento utilizada." />
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</span>
                        <HelpTip text="Data do pagamento (efetuado) ou vencimento (pendente)." />
                      </div>
                    </th>
                    <th className="text-right py-2.5 px-2 w-[120px]">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Valor</span>
                        <HelpTip text="Valor da transação. Verde = receita, Vermelho = despesa." />
                      </div>
                    </th>
                    <th className="w-[36px] p-0"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNonCC.length === 0 && (
                    <tr><td colSpan={12} className="py-16 text-center text-muted-foreground text-sm">Nenhum lançamento encontrado</td></tr>
                  )}
                  {(() => {
                    const totalPages = Math.ceil(filteredNonCC.length / rowsPerPage);
                    const safePage = Math.min(currentPage, totalPages || 1);
                    const startIdx = (safePage - 1) * rowsPerPage;
                    const paginated = filteredNonCC.slice(startIdx, startIdx + rowsPerPage);
                    return paginated;
                  })().map((e) => {
                    const motoPlaca = e.motoId ? (motos.find(m => m.id === e.motoId)?.placa || e.placa || null) : (e.placa || null);
                    const rawClientName = e.clienteId ? (clients.find(c => c.id === e.clienteId)?.nome || e.clienteNome || null) : (e.clienteNome || null);
                    const fmtClientName = rawClientName ? rawClientName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : null;
                    const catLabel = getCatLabel(e.categoria, e.tipo);
                    const overdue = isOverdue(e);
                    const fmtDate = (d: string) => { try { return format(parseISO(d), "dd/MM"); } catch { return d; } };
                    const effectiveDate = !e.pago && e.dataPrevista ? e.dataPrevista : e.data;
                    const fmtValor = `R$ ${e.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
                    const isOperacional = e.natureza === "operacional" || (!e.natureza && !!motoPlaca);
                    const isInvestimento = e.natureza === "investimento";
                    const bankBadge = e.conta ? getBankBadge(e.conta) : null;

                    // Parcela indicator for recurring entries
                    const parcelaLabel = (() => {
                      if (e.despesaFixa) return null;
                      let seriesMembers: typeof entries;
                      if (e.recurringGroupId) {
                        seriesMembers = entries.filter(s => s.recurringGroupId === e.recurringGroupId);
                      } else {
                        const seriesId = e.serieId || e.fixedOriginId;
                        if (!seriesId && !e.recorrente) return null;
                        const effectiveSeriesId = e.serieId || e.fixedOriginId || e.id;
                        seriesMembers = entries.filter(s =>
                          s.id === effectiveSeriesId ||
                          s.serieId === effectiveSeriesId ||
                          s.fixedOriginId === effectiveSeriesId
                        );
                      }
                      const sorted = [...seriesMembers].sort((a, b) => {
                        const dateA = a.dataPrevista || a.data;
                        const dateB = b.dataPrevista || b.data;
                        if (dateA !== dateB) return dateA.localeCompare(dateB);
                        // Transferências: saída (despesa) antes da entrada (receita)
                        if (a.tipo !== b.tipo) return a.tipo === "despesa" ? -1 : 1;
                        return 0;
                      });
                      if (sorted.length <= 1) return null;
                      const idx = sorted.findIndex(s => s.id === e.id);
                      return `(${idx + 1}/${sorted.length})`;
                    })();

                    return (
                      <tr key={e.id}
                        id={`entry-row-${e.id}`}
                        className={`border-b border-border/20 hover:bg-muted/30 transition-colors group cursor-pointer scroll-mt-32 ${e.ignorada ? "opacity-40" : ""}`}
                        onClick={() => setDetailEntry(e)}
                      >
                        <td className="p-0"><div className="w-[3px] h-full min-h-[44px]" style={{ backgroundColor: e.pago ? "hsl(var(--success))" : overdue ? "hsl(var(--destructive))" : "hsl(var(--warning))" }} /></td>
                        {/* Status */}
                        <td className="py-2 px-2 text-center">
                          <button onClick={(ev) => { ev.stopPropagation(); togglePago(e.id); }} className="cursor-pointer" aria-label={e.pago ? "Efetuado" : "Pendente"}>
                            {e.pago ? (
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            ) : overdue ? (
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                            ) : (
                              <Circle className="h-5 w-5 text-warning" />
                            )}
                          </button>
                        </td>
                        {/* Tipo */}
                        <td className="py-2 px-2">
                          <span className={`text-xs font-semibold whitespace-nowrap ${isInvestimento ? "text-amber-600 dark:text-amber-400" : isOperacional ? "text-blue-600 dark:text-blue-400" : "text-purple-600 dark:text-purple-400"}`}>
                            {isInvestimento ? "Invest." : isOperacional ? "Oper." : "Admin."}
                          </span>
                        </td>
                        {/* Placa */}
                        <td className="py-2 px-2">
                          {motoPlaca ? (
                            <span className={`${mono} text-sm font-bold text-foreground whitespace-nowrap`}>{motoPlaca}</span>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                        {/* Categoria + Sub + Cliente */}
                        <td className="py-2 px-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground whitespace-nowrap">{catLabel}</span>
                              {e.subcategoria && <span className="text-xs text-muted-foreground whitespace-nowrap">› {e.subcategoria}</span>}
                              {e.tags?.includes("OS") && (e.categoria === "manutencao_despesa" || e.categoria === "manutencao_receita") && (
                                <span className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">OS</span>
                              )}
                            </div>
                            {e.categoria !== "aluguel" && fmtClientName && (
                              <span className="text-xs text-muted-foreground mt-0.5 block">{fmtClientName}</span>
                            )}
                          </div>
                        </td>
                        {/* Observação — destaque maior, antes das tags */}
                        <td className="py-2 px-2 max-w-[200px]">
                          {(() => {
                            const obsText = e.categoria === "aluguel" && fmtClientName ? fmtClientName : (e.observacao || "");
                            const fullText = [obsText, parcelaLabel].filter(Boolean).join(" ");
                            return fullText ? (
                              <span className="text-xs font-medium text-foreground/80 italic truncate block" title={fullText}>
                                {obsText || ""}{parcelaLabel && <span className="text-muted-foreground/70 not-italic ml-1">{parcelaLabel}</span>}
                              </span>
                            ) : <span className="text-xs text-muted-foreground/40">—</span>;
                          })()}
                        </td>
                        {/* Tags — com badge leve */}
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(e.tags || []).filter(t => t !== "OS").map(t => (
                              <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">{t}</span>
                            ))}
                            {e.recorrente && <span className="inline-flex" aria-label="Recorrente"><Repeat className="h-3.5 w-3.5 text-muted-foreground/60" /></span>}
                            {e.despesaFixa && <span className="inline-flex" aria-label="Fixa"><Pin className="h-3.5 w-3.5 text-muted-foreground/60" /></span>}
                            {e.asaasPaymentId && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                                      (e.asaasStatus === "RECEIVED" || (e.pago && e.asaasStatus !== "DELETED")) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                      e.asaasStatus === "OVERDUE"  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                    }`}>
                                      {(e.asaasStatus === "RECEIVED" || (e.pago && e.asaasStatus !== "DELETED")) ? "Pago Asaas" :
                                       e.asaasStatus === "OVERDUE"  ? "Vencido Asaas" : "Asaas"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    {e.pago && e.asaasStatus !== "RECEIVED" ? "Boleto Asaas · Pago manualmente" : `Boleto Asaas · ${e.asaasStatus}`}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!(e.tags || []).length && !e.recorrente && !e.despesaFixa && !e.asaasPaymentId && <span className="text-xs text-muted-foreground/40">—</span>}
                          </div>
                        </td>
                        {/* Cobrança — boleto + WhatsApp */}
                        <td className="py-2 px-2" onClick={(ev) => ev.stopPropagation()}>
                          {e.tipo === "receita" && !e.pago && e.clienteId ? (
                            <div className="flex items-center gap-2">
                              {/* Ícone de boleto/link */}
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {(e.asaasInvoiceUrl || e.asaasBoletoUrl) ? (
                                      <button
                                        onClick={() => window.open(e.asaasInvoiceUrl || e.asaasBoletoUrl!, "_blank")}
                                        className="text-blue-500 hover:text-blue-700 transition-colors"
                                      >
                                        <Link2 className="h-4 w-4" />
                                      </button>
                                    ) : asaasLoadingId === e.id || (e.asaasPaymentId && !e.asaasBoletoUrl && !e.asaasInvoiceUrl) ? (
                                      <span className="text-muted-foreground/50">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleGenerateAsaasBoleto(e)}
                                        disabled={asaasLoadingId === e.id}
                                        className="text-muted-foreground/40 hover:text-blue-500 transition-colors"
                                      >
                                        <Link2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    {(e.asaasInvoiceUrl || e.asaasBoletoUrl) ? "Ver boleto" : e.asaasPaymentId ? "Aguardando URL..." : "Gerar boleto"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/20">—</span>
                          )}
                        </td>
                        {/* Conta — ícone circular colorido */}
                        <td className="py-2 px-2 text-center">
                          {(() => {
                            if (!e.conta) return <span className="text-xs text-muted-foreground/40">—</span>;
                            const card = creditCards.find(c => c.nome === e.conta);
                            const payBank = card?.contaPagamento || null;
                            const tipText = card
                              ? `Cartão ${e.conta}${payBank ? ` • Pago via ${payBank}` : ""}`
                              : e.conta;
                            return (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 justify-center">
                                      <BankIcon conta={e.conta} size={28} />
                                      {card && (
                                        <span className="inline-flex items-center gap-0.5">
                                          <CreditCard className="h-3 w-3 text-primary" />
                                          {payBank && e.pago && <BankIcon conta={payBank} size={20} />}
                                        </span>
                                      )}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">{tipText}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </td>
                        {/* Data */}
                        <td className="py-2 px-2">
                          <div className="flex flex-col">
                            {e.pago ? (
                              <>
                                <span className={`text-sm ${mono} whitespace-nowrap text-muted-foreground`}>{fmtDate(e.data)}</span>
                                {e.dataPrevista && e.dataPrevista !== e.data && (
                                  <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">prev. {fmtDate(e.dataPrevista)}</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className={`text-sm ${mono} whitespace-nowrap ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                                  {fmtDate(e.dataPrevista || e.data)}
                                </span>
                                {overdue && <span className="text-[10px] text-destructive font-medium">atrasado</span>}
                              </>
                            )}
                          </div>
                        </td>
                        {/* Valor */}
                        <td className="py-2 px-2 text-right">
                          <span className={`text-sm font-bold ${mono} whitespace-nowrap ${e.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                            {e.tipo === "receita" ? "+" : "–"} {fmtValor}
                          </span>
                        </td>
                        {/* Ações */}
                        <td className="py-2 pr-1" onClick={(ev) => ev.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity" onClick={(ev) => ev.stopPropagation()}><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => togglePago(e.id)} className="gap-2 text-xs">
                                {e.pago ? <><Circle className="h-3.5 w-3.5" /> Desfazer</> : <><CheckCheck className="h-3.5 w-3.5" /> {e.tipo === "receita" ? "Receber" : "Pagar"}</>}
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => { setForm(resolveEntryAssociations({ ...e })); setMode("edit"); setDialogOpen(true); }} className="gap-2 text-xs">
                                  <Pencil className="h-3.5 w-3.5" /> Editar
                                </DropdownMenuItem>
                              )}
                              {/* Asaas: gerar boleto */}
                              {!e.pago && e.clienteId && !e.asaasPaymentId && (
                                <DropdownMenuItem
                                  onClick={() => handleGenerateAsaasBoleto(e)}
                                  disabled={asaasLoadingId === e.id}
                                  className="gap-2 text-xs text-blue-600 focus:text-blue-600 dark:text-blue-400"
                                >
                                  {asaasLoadingId === e.id
                                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</>
                                    : <><Banknote className="h-3.5 w-3.5" /> Gerar Boleto</>}
                                </DropdownMenuItem>
                              )}
                              {/* Asaas: ver boleto já gerado */}
                              {e.asaasPaymentId && (e.asaasInvoiceUrl || e.asaasBoletoUrl) && (
                                <DropdownMenuItem
                                  onClick={() => window.open(e.asaasInvoiceUrl || e.asaasBoletoUrl!, "_blank")}
                                  className="gap-2 text-xs"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" /> Ver Boleto
                                </DropdownMenuItem>
                              )}
                              {/* Asaas: sincronizar taxas de pagamentos já recebidos */}
                              {e.asaasPaymentId && e.pago && e.asaasStatus === "RECEIVED" && (
                                <DropdownMenuItem
                                  onClick={() => handleSyncAsaasFees(e)}
                                  disabled={syncingFeesId === e.id}
                                  className="gap-2 text-xs"
                                >
                                  {syncingFeesId === e.id
                                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando taxas...</>
                                    : <><RefreshCw className="h-3.5 w-3.5" /> Sincronizar taxas</>}
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <DropdownMenuItem onClick={() => handleDelete(e.id)} className="gap-2 text-xs text-destructive focus:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination controls */}
            {filteredNonCC.length > 0 && (() => {
              const totalPages = Math.ceil(filteredNonCC.length / rowsPerPage);
              const safePage = Math.min(currentPage, totalPages || 1);
              const startIdx = (safePage - 1) * rowsPerPage + 1;
              const endIdx = Math.min(safePage * rowsPerPage, filteredNonCC.length);
              return (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Linhas por página:</span>
                    <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[5, 10, 25, 50, 100, 150, 200].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{startIdx}-{endIdx} de {filteredNonCC.length}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage(1)}>
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(totalPages)}>
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

        </TabsContent>

        {/* TAB: Categorias */}
        <TabsContent value="categorias" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Distribuição por Categoria</CardTitle>
                  <div className="flex gap-1">
                    <Button variant={tipoFilter !== "receita" ? "default" : "outline"} size="sm" onClick={() => setTipoFilter(t => t === "receita" ? "despesa" : "receita")}>
                      {tipoFilter === "receita" ? "Receitas" : "Despesas"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {categoryData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sem dados para este mês</p>
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                          {categoryData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                        </Pie>
                        <RechartsTooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Detalhamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {categoryBudget.length === 0 && <p className="text-center text-muted-foreground py-8">Sem despesas neste mês</p>}
                {categoryBudget.map((item, idx) => (
                  <div key={item.cat} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} />
                        <span className="font-medium text-foreground">{item.cat}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{item.pct.toFixed(1)}%</span>
                        <span className={`font-semibold ${mono}`}>R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    <Progress value={item.pct} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Evolução */}
        <TabsContent value="evolucao" className="mt-4">
          <Card className="border-border/50 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Evolução Mensal (últimos 6 meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyEvolution} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" className="text-xs capitalize" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <RechartsTooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                    <Bar dataKey="receitas" name="Receitas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4 border-border/50 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Resumo Mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Mês</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#16a34a" }}>Receitas</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#dc2626" }}>Despesas</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyEvolution.map(m => (
                      <tr key={m.mes} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 capitalize font-medium">{m.mes}</td>
                        <td className={`px-3 py-2 text-right ${mono}`} style={{ color: "#16a34a" }}>R$ {m.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className={`px-3 py-2 text-right ${mono}`} style={{ color: "#dc2626" }}>R$ {m.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${mono}`} style={{ color: m.saldo >= 0 ? "#16a34a" : "#dc2626" }}>
                          R$ {m.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>}

      {/* ═══════ Dialog for add/edit ═══════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Novo Lançamento" : "Editar Lançamento"}</DialogTitle>
          </DialogHeader>

          {/* ── Tipo toggle ── */}
          <div className="flex gap-2">
            <Button type="button" variant={form.tipo === "receita" ? "default" : "outline"}
              className={`flex-1 ${form.tipo === "receita" ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
              onClick={() => setForm({ ...form, tipo: "receita", categoria: "", subcategoria: "" })}>
              <TrendingUp className="h-4 w-4 mr-2" /> Receita
            </Button>
            <Button type="button" variant={form.tipo === "despesa" ? "default" : "outline"}
              className={`flex-1 ${form.tipo === "despesa" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
              onClick={() => setForm({ ...form, tipo: "despesa", categoria: "", subcategoria: "" })}>
              <TrendingDown className="h-4 w-4 mr-2" /> Despesa
            </Button>
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">

            {/* ═══ LEFT COLUMN ═══ */}
            <div className="space-y-4">
              {/* Valor */}
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">Valor (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={(() => {
                      if (!form.valor) return "";
                      const cents = Math.round(form.valor * 100).toString();
                      const padded = cents.padStart(3, "0");
                      const intPart = padded.slice(0, -2);
                      const decPart = padded.slice(-2);
                      const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                      return `${formatted},${decPart}`;
                    })()}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (!digits) { setForm({ ...form, valor: 0 }); return; }
                      const num = parseInt(digits, 10) / 100;
                      setForm({ ...form, valor: num });
                    }}
                    placeholder="0,00"
                    className="text-lg font-semibold h-11 pl-10"
                  />
                </div>
              </div>

              {/* Datas */}
              <div className="grid gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">
                    {selectedCard && form.tipo === "despesa"
                      ? "Data da compra"
                      : form.tipo === "despesa" ? "Data de Pagamento" : "Data de Recebimento"}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.data === new Date().toISOString().split("T")[0] ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                    onClick={() => setForm({ ...form, data: new Date().toISOString().split("T")[0], pago: true })}>Hoje</button>
                  <button type="button" className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${(() => { const d = new Date(); d.setDate(d.getDate()-1); return form.data === d.toISOString().split("T")[0]; })() ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                    onClick={() => { const d = new Date(); d.setDate(d.getDate()-1); setForm({ ...form, data: d.toISOString().split("T")[0], pago: true }); }}>Ontem</button>
                  <Input type="date" value={form.data} onChange={e => {
                    const selected = e.target.value;
                    const today = new Date().toISOString().split("T")[0];
                    const isFuture = selected > today;
                    setForm({ ...form, data: selected, pago: isFuture ? false : form.pago });
                  }} className="flex-1 h-8 text-sm" />
                </div>
              </div>

              {/* Status pago */}
              {(() => {
                const today = new Date().toISOString().split("T")[0];
                const isFuture = form.data > today;
                return (
                  <div className="flex items-center justify-between py-1">
                    <Label className={`text-sm ${isFuture ? "text-muted-foreground" : ""}`}>
                      {isFuture ? "⏳ Pendente (data futura)" : form.pago ? (form.tipo === "despesa" ? "✅ Pagamento efetuado" : "✅ Foi recebida") : "⏳ Pendente"}
                    </Label>
                    <Switch checked={form.pago} onCheckedChange={v => setForm({ ...form, pago: v })} disabled={isFuture} />
                  </div>
                );
              })()}

              {/* Data prevista is auto-set: when date is future, dataPrevista = data */}

              {/* Categoria + Subcategoria (unified) */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bookmark className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Categoria</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground gap-1"
                      onClick={() => setManagerOpen(form.tipo === "receita" ? "cat_receita" : "cat_despesa")}>
                      <Settings2 className="h-3 w-3" /> Gerenciar
                    </Button>
                  </div>
                </div>
                <GroupedCategorySelect
                  categorias={CATEGORIAS[form.tipo]}
                  subcategorias={SUBCATEGORIAS}
                  selectedCategoria={form.categoria}
                  selectedSubcategoria={form.subcategoria || ""}
                  onSelect={(cat, sub) => {
                    if (cat === "manutencao_despesa") {
                      toast.info("Despesas de manutenção são criadas pela Ordem de Serviço. Acesse o módulo Manutenções / OS.");
                      return;
                    }
                    const newCatTags = [
                      ...(TAGS[cat] || []),
                      ...Object.keys(TAGS).filter(k => k.startsWith(`${cat}:`)).flatMap(k => TAGS[k] || []),
                    ];
                    const filteredTags = (form.tags || []).filter(t => newCatTags.includes(t));
                    setForm({ ...form, categoria: cat, subcategoria: sub, tags: filteredTags });
                  }}
                />
              </div>

              {/* Conta */}
              <div className="grid gap-1.5">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Conta</Label>
                </div>
                <SearchableSelect
                  options={CONTAS.map(c => {
                    const card = creditCards.find(cc => cc.nome === c);
                    return { value: c, label: card ? `${c} (cartão)` : c };
                  })}
                  value={form.conta || "Caixa"}
                  onValueChange={v => { setForm({ ...form, conta: v }); setParcelas(1); }}
                />
                {selectedCard && form.tipo === "despesa" && mode === "add" && (
                  <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-2 space-y-1.5">
                    <Label className="text-xs">Parcelas no cartão</Label>
                    <Select value={String(parcelas)} onValueChange={v => setParcelas(Number(v))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>
                            {n}x de R$ {(form.valor / n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedCard.bandeira ? `${selectedCard.bandeira} • ` : ""}Fechamento dia {selectedCard.diaFechamento} • Vencimento dia {selectedCard.diaVencimento}.
                      {selectedCard.limite ? ` Limite R$ ${selectedCard.limite.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` : ""}
                      {" "}Cada parcela cai no vencimento da fatura correspondente. A "Data da compra" fica registrada na observação.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ═══ RIGHT COLUMN ═══ */}
            <div className="space-y-4 sm:border-l sm:border-border/50 sm:pl-6">
              {/* Tags */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TagIcon className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Tags</Label>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground gap-1"
                    onClick={() => setManagerOpen("tags")}>
                    <Settings2 className="h-3 w-3" /> Gerenciar
                  </Button>
                </div>
                {activeTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeTags.map(tag => {
                      const selected = (form.tags || []).includes(tag);
                      return (
                        <button key={tag} type="button"
                          onClick={() => {
                            const tags = form.tags || [];
                            setForm({ ...form, tags: selected ? tags.filter(t => t !== tag) : [...tags, tag] });
                          }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            selected ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                          }`}>
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {form.categoria ? 'Nenhuma tag para esta categoria. Clique em "Gerenciar" para criar.' : "Selecione uma categoria para ver as tags disponíveis."}
                  </p>
                )}
              </div>

              {/* Observação */}
              <div className="grid gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Observação</Label>
                  <HelpTip text="Anotação interna que não aparece nos relatórios." />
                </div>
                <Input value={form.observacao || ""} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Observação opcional..." />
              </div>

              {/* Veículo e Locatário */}
              <div className="grid gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm">Locatário</Label>
                  <HelpTip text="Ao selecionar um locatário com locação ativa, a placa será preenchida automaticamente." />
                </div>
                <SearchableSelect
                  options={clienteSelectOptions}
                  value={clienteSelectValue}
                  onValueChange={v => {
                    if (v === "none") {
                      setForm({ ...form, clienteId: null, clienteNome: "", rentalId: null });
                      return;
                    }
                    if (v.startsWith("legacy-cliente:")) return;
                    const selectedClient = clients.find(c => c.id === v);
                    const autoMotoId = getMotoForClient(v);
                    const autoMoto = autoMotoId ? motos.find(m => m.id === autoMotoId) : null;
                    setForm({
                      ...form,
                      clienteId: v,
                      clienteNome: selectedClient?.nome || form.clienteNome || "",
                      rentalId: null,
                      ...(autoMoto ? { motoId: autoMoto.id, placa: autoMoto.placa } : {}),
                    });
                  }}
                  placeholder="Selecione..."
                />
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Veículo (Placa)</Label>
                </div>
                <SearchableSelect
                  options={motoSelectOptions}
                  value={motoSelectValue}
                  onValueChange={v => {
                    if (v === "none") {
                      handleMotoChange(null);
                      return;
                    }
                    if (v.startsWith("legacy-placa:")) return;
                    handleMotoChange(v);
                  }}
                  placeholder="Selecione..."
                />
              </div>

              {/* Divider */}
              <div className="border-t border-border/50 pt-3 space-y-3">
                {/* Receita/Despesa fixa */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">{form.tipo === "receita" ? "Receita fixa" : "Despesa fixa"}</Label>
                  </div>
                  <Switch checked={form.despesaFixa || false} onCheckedChange={v => setForm({ ...form, despesaFixa: v, recorrente: v ? false : form.recorrente })} />
                </div>

                {/* Repetir */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Repetir</Label>
                    </div>
                    <Switch checked={form.recorrente || false} onCheckedChange={v => setForm({ ...form, recorrente: v, despesaFixa: v ? false : form.despesaFixa, recorrenciaVezes: v ? Math.max(form.recorrenciaVezes || 0, 1) : form.recorrenciaVezes })} />
                  </div>
                  {form.recorrente && (
                    <div className="flex flex-col gap-2 pl-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">A cada</span>
                        <Input type="number" min="1" className="w-14 h-8 text-center text-sm" value={form.recorrenciaPorPeriodo || 1}
                          onChange={e => setForm({ ...form, recorrenciaPorPeriodo: Math.max(Number(e.target.value) || 1, 1) })} />
                        <Select value={form.recorrenciaTipo || "mensal"} onValueChange={v => setForm({ ...form, recorrenciaTipo: v as any })}>
                          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="diario">{(form.recorrenciaPorPeriodo || 1) === 1 ? "dia" : "dias"}</SelectItem>
                            <SelectItem value="semanal">{(form.recorrenciaPorPeriodo || 1) === 1 ? "semana" : "semanas"}</SelectItem>
                            <SelectItem value="mensal">{(form.recorrenciaPorPeriodo || 1) === 1 ? "mês" : "meses"}</SelectItem>
                            <SelectItem value="anual">{(form.recorrenciaPorPeriodo || 1) === 1 ? "ano" : "anos"}</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">durante</span>
                        <Input type="number" min="1" className="w-16 h-8 text-center text-sm" value={form.recorrenciaVezes || 1}
                          onChange={e => setForm({ ...form, recorrenciaVezes: Math.max(Number(e.target.value) || 1, 1) })} />
                        <span className="text-xs text-muted-foreground">
                          {(form.recorrenciaVezes || 1) === 1 ? "ocorrência" : "ocorrências"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        As repetições caem sempre no mesmo dia (mesmo dia da semana, mesmo dia do mês). Total: {Math.max(1, form.recorrenciaVezes || 1)} repetição(ões) além do lançamento atual.
                      </span>
                    </div>
                  )}
                </div>

                {/* Natureza */}
                <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3 flex-wrap">
                  <div className="flex items-center gap-2 shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Natureza</Label>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <button type="button"
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${form.natureza === "operacional" ? "bg-blue-500/10 text-blue-600 border-blue-500/30 font-medium" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                      onClick={() => setForm({ ...form, natureza: "operacional" })}>
                      Operacional
                    </button>
                    <button type="button"
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${form.natureza === "administrativa" ? "bg-purple-500/10 text-purple-600 border-purple-500/30 font-medium" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                      onClick={() => setForm({ ...form, natureza: "administrativa" })}>
                      Administrativa
                    </button>
                    <button type="button"
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${form.natureza === "investimento" ? "bg-amber-500/10 text-amber-600 border-amber-500/30 font-medium" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                      onClick={() => setForm({ ...form, natureza: "investimento" })}>
                      Investimento
                    </button>
                  </div>
                </div>
              </div>

              {/* Ignorar transação */}
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Ignorar transação</Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">Transações ignoradas não são contabilizadas nos totais de receitas e despesas</p>
                </div>
                <Switch checked={form.ignorada || false} onCheckedChange={v => setForm({ ...form, ignorada: v })} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50 flex-wrap">
            <div className="min-h-5 text-xs text-muted-foreground">
              {isSaving
                ? "Salvando lançamento..."
                : lastSaveAt
                  ? `Último salvamento às ${new Date(lastSaveAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
            </div>
            <div className="flex justify-end gap-2">
            {mode === "add" && (
              <Button variant="outline" disabled={isSaving} onClick={async () => {
                const prevTipo = form.tipo;
                const saved = await handleSave();
                if (!saved) return;
                setForm({ ...emptyEntry(), tipo: prevTipo });
                setDialogOpen(true);
              }}>
                Salvar e Criar Nova
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving || !form.categoria || form.valor <= 0 || !form.data || !form.conta || !form.natureza} variant={form.tipo === "despesa" ? "destructive" : "default"}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manager Dialogs */}
      <CategoryManagerDialog
        open={managerOpen === "cat_receita"}
        onOpenChange={() => setManagerOpen(null)}
        title="Gerenciar Categorias de Receita"
        tipo="receita"
        categorias={CATEGORIAS.receita.map(c => ({ value: c.value, label: c.label }))}
        subcategorias={SUBCATEGORIAS}
        onAddCat={v => addCategory("receita", v)}
        onRemoveCat={(label, catValue) => removeCategory("receita", label, catValue)}
        onRenameCat={(o, n) => renameCategory("receita", o, n)}
        onMigrateCat={(oldLabel, target, oldVal) => migrateCategory("receita", oldLabel, target, oldVal)}
        onAddSubcat={addSubcategoria}
        onRemoveSubcat={removeSubcategoria}
        onRenameSubcat={renameSubcategoria}
        onMigrateSubcat={migrateSubcategoria}
      />
      <CategoryManagerDialog
        open={managerOpen === "cat_despesa"}
        onOpenChange={() => setManagerOpen(null)}
        title="Gerenciar Categorias de Despesa"
        tipo="despesa"
        categorias={CATEGORIAS.despesa.map(c => ({ value: c.value, label: c.label }))}
        subcategorias={SUBCATEGORIAS}
        onAddCat={v => addCategory("despesa", v)}
        onRemoveCat={(label, catValue) => removeCategory("despesa", label, catValue)}
        onRenameCat={(o, n) => renameCategory("despesa", o, n)}
        onMigrateCat={(oldLabel, target, oldVal) => migrateCategory("despesa", oldLabel, target, oldVal)}
        onAddSubcat={addSubcategoria}
        onRemoveSubcat={removeSubcategoria}
        onRenameSubcat={renameSubcategoria}
        onMigrateSubcat={migrateSubcategoria}
      />
      <ListManagerDialog
        open={managerOpen === "tags"}
        onOpenChange={() => setManagerOpen(null)}
        title={`Tags de "${getCatLabel(form.categoria, form.tipo)}${form.subcategoria ? ` › ${form.subcategoria}` : ""}"`}
        items={activeTags}
        onAdd={addTag}
        onRemove={removeTag}
        onRename={renameTag}
      />

      {/* ═══ Delete target dialog ═══ */}
      {deleteTarget && (() => {
        const siblings = entries.filter(e => e.id !== deleteTarget.id && isSameSeries(e, deleteTarget));
        const hasSiblings = siblings.length > 0;
        const pendingFutures = hasSiblings
          ? siblings.filter(e => !e.pago && (e.data ?? "") >= (deleteTarget.data ?? ""))
          : [];
        return (
          <AlertDialog open onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover lançamento</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget.categoria === "transferencia" ? (
                    <span>Esta é uma transferência entre contas. Ao remover, o par correspondente também será removido automaticamente.</span>
                  ) : hasSiblings ? (
                    <>
                      <span>Este lançamento faz parte de uma série ({siblings.length + 1} no total). Escolha o que deseja remover:</span>
                      {pendingFutures.length > 0 && (
                        <span className="text-xs text-muted-foreground block mt-1">
                          "Esta e as futuras pendentes" removerá {pendingFutures.length + 1} lançamento(s).
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Deseja remover este lançamento?</span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
                <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteOnly} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Somente este
                </AlertDialogAction>
                {hasSiblings && pendingFutures.length > 0 && (
                  <AlertDialogAction onClick={handleDeleteFuturesInSeries} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Este e os próximos pendentes
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {/* ═══ Edit Scope Dialog ═══ */}
      <AlertDialog open={!!editScopeTarget} onOpenChange={(v) => { if (!v) setEditScopeTarget(null); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Aplicar alterações</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {"Deseja aplicar as alterações apenas a este lançamento, a todos os pendentes ou a toda a série?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="outline" className="w-full justify-start gap-2 h-10" onClick={handleEditScopeOnly}>
              <span className="text-sm font-medium">Somente este</span>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 h-10" onClick={handleEditScopePending}>
              <span className="text-sm font-medium">Este e os próximos pendentes</span>
            </Button>
            <Button variant="ghost" className="w-full h-9 text-muted-foreground" onClick={() => setEditScopeTarget(null)}>
              Cancelar
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ Confirm Toggle Dialog ═══ */}
      <Dialog open={!!confirmToggleEntry} onOpenChange={(v) => { if (!v) setConfirmToggleEntry(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmToggleEntry && !confirmToggleEntry.pago
                ? (confirmToggleEntry.tipo === "receita" ? "✅ Confirmar Recebimento" : "✅ Confirmar Pagamento")
                : "↩️ Desfazer Confirmação"}
            </DialogTitle>
          </DialogHeader>
          {confirmToggleEntry && !confirmToggleEntry.pago ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descrição:</span>
                  <span className="font-medium">{confirmToggleEntry.descricao || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoria:</span>
                  <span className="font-medium">{getCatLabel(confirmToggleEntry.categoria, confirmToggleEntry.tipo)}</span>
                </div>
                {confirmToggleEntry.rentalId && (() => {
                  const rental = rentals.find(r => r.id === confirmToggleEntry.rentalId);
                  const client = clients.find(c => c.id === confirmToggleEntry.clienteId);
                  const dueDateStr = confirmToggleEntry.dataPrevista || confirmToggleEntry.data;
                  const dueDate = dueDateStr ? new Date(dueDateStr + "T00:00:00") : null;
                  const startDate = rental ? new Date(rental.dataInicio + "T00:00:00") : null;
                  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  let periodoLabel = "—";
                  if (rental && dueDate && startDate) {
                    const freq = rental.frequenciaPagamento;
                    const periodDays = freq === "quinzenal" ? 14 : freq === "mensal" ? 30 : 7;
                    const diffDays = Math.round((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                    const periodNum = Math.max(1, Math.floor(diffDays / periodDays) + 1);
                    const periodEnd = new Date(dueDate.getTime() + (periodDays - 1) * 24 * 60 * 60 * 1000);
                    const labelTipo = freq === "quinzenal" ? "Quinzena" : freq === "mensal" ? "Mês" : "Semana";
                    periodoLabel = `${labelTipo} ${String(periodNum).padStart(2, "0")}: ${fmt(dueDate)} até ${fmt(periodEnd)}`;
                  }
                  return (
                    <>
                      <div className="border-t my-1" />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Locatário:</span>
                        <span className="font-medium">{client?.nome || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento:</span>
                        <span className="font-medium">
                          {dueDateStr ? new Date(dueDateStr + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pagamento:</span>
                        <span className="font-medium">
                          {confirmDate ? new Date(confirmDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Referência:</span>
                        <span className="font-semibold text-primary">{periodoLabel}</span>
                      </div>
                    </>
                  );
                })()}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Valor:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input
                      className="w-28 h-8 text-right text-sm font-semibold"
                      style={{ color: confirmToggleEntry.tipo === "receita" ? "#16a34a" : "#dc2626" }}
                      value={confirmValor}
                      onChange={e => {
                        let v = e.target.value.replace(/[^\d,]/g, "");
                        setConfirmValor(v);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Bloco de atraso — aparece quando há multa/juros configurados e a data de pagamento é posterior ao vencimento */}
              {confirmToggleEntry.rentalId && confirmDate && (() => {
                const rental = rentals.find(r => r.id === confirmToggleEntry.rentalId);
                const dueDateStr = confirmToggleEntry.dataPrevista || confirmToggleEntry.data;
                if (!rental || !dueDateStr) return null;
                const due = new Date(dueDateStr + "T00:00:00");
                const pay = new Date(confirmDate + "T00:00:00");
                const daysOverdue = Math.max(0, Math.floor((pay.getTime() - due.getTime()) / 86400000));
                if (daysOverdue === 0) return null;
                const multa = rental.multaAtraso || 0;
                const jurosDia = (confirmToggleEntry.valor * (rental.jurosAtrasoMes || 0) / 100) / 30;
                const totalJuros = jurosDia * daysOverdue;
                const total = confirmToggleEntry.valor + multa + totalJuros;
                const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> PAGAMENTO VENCIDO
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dias em atraso:</span>
                      <span className="font-semibold">{daysOverdue} dia{daysOverdue !== 1 ? "s" : ""}</span>
                    </div>
                    {multa > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Multa de atraso:</span>
                        <span>R$ {fmt(multa)}</span>
                      </div>
                    )}
                    {jurosDia > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Juros (R$ {fmt(jurosDia)}/dia):</span>
                        <span>R$ {fmt(totalJuros)}</span>
                      </div>
                    )}
                    {(multa > 0 || jurosDia > 0) && (
                      <div className="flex justify-between border-t pt-1.5 font-semibold">
                        <span>Total a pagar:</span>
                        <span className="text-red-600 dark:text-red-400">R$ {fmt(total)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Data de pagamento */}
              <div className="space-y-1.5">
                <Label className="text-sm">Data do {confirmToggleEntry.tipo === "receita" ? "recebimento" : "pagamento"}</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm"
                    variant={confirmDate === new Date().toISOString().split("T")[0] ? "default" : "outline"}
                    onClick={() => setConfirmDate(new Date().toISOString().split("T")[0])}>
                    Hoje
                  </Button>
                  <Button type="button" size="sm"
                    variant={confirmDate === new Date(Date.now() - 86400000).toISOString().split("T")[0] ? "default" : "outline"}
                    onClick={() => setConfirmDate(new Date(Date.now() - 86400000).toISOString().split("T")[0])}>
                    Ontem
                  </Button>
                  <Input type="date" className="h-9 w-[150px]" value={confirmDate} onChange={(ev) => setConfirmDate(ev.target.value)} />
                </div>
              </div>

              {/* Conta bancária */}
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-muted-foreground shrink-0" />
                <Select value={confirmConta} onValueChange={setConfirmConta}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {CONTAS.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Banco que pagou (quando a conta é um cartão) */}
              {creditCards.some(c => c.nome === confirmConta) && (
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Banco que pagou a fatura
                  </Label>
                  <Select value={confirmPayBank} onValueChange={setConfirmPayBank}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                    <SelectContent>
                      {(bankAccountsList || []).filter(a => a.tipo !== "cartao").map(a => (
                        <SelectItem key={a.id} value={a.nome}>{a.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Botões */}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setConfirmToggleEntry(null)}>Cancelar</Button>
                <Button
                  style={{ backgroundColor: confirmToggleEntry.tipo === "receita" ? "#16a34a" : "#dc2626", color: "white" }}
                  onClick={confirmTogglePago}
                  disabled={!confirmDate}
                >
                  {confirmToggleEntry.tipo === "receita" ? "Receber" : "Pagar"}
                </Button>
              </div>
            </div>
          ) : confirmToggleEntry ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao desfazer, o lançamento voltará para o status pendente com a data prevista.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descrição:</span>
                  <span className="font-medium">{confirmToggleEntry.descricao || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className={`font-semibold ${mono}`}>R$ {confirmToggleEntry.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voltará para:</span>
                  <span className="font-medium">
                    {confirmToggleEntry.dataPrevista
                      ? new Date(confirmToggleEntry.dataPrevista + "T12:00:00").toLocaleDateString("pt-BR")
                      : confirmToggleEntry.data
                        ? new Date(confirmToggleEntry.data + "T12:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                  </span>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setConfirmToggleEntry(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={confirmTogglePago}>Desfazer</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {/* ═══ Rental Payment Success Dialog ═══ */}
      <Dialog open={!!rentalPaySuccess} onOpenChange={(v) => { if (!v) setRentalPaySuccess(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recebimento Confirmado</DialogTitle>
          </DialogHeader>
          {rentalPaySuccess && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Locatário:</span>
                  <span className="font-medium">{rentalPaySuccess.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Referência:</span>
                  <span className="font-semibold text-primary">{rentalPaySuccess.periodoLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-medium">{rentalPaySuccess.vencimento}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pago em:</span>
                  <span className="font-medium">{rentalPaySuccess.pagamento}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-semibold text-green-600">R$ {rentalPaySuccess.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {rentalPaySuccess.telefone && (
                <div className="flex items-center gap-2 text-sm rounded-md border px-3 py-2">
                  <span className="text-muted-foreground shrink-0">Telefone:</span>
                  <span className="font-medium flex-1">{rentalPaySuccess.telefone}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">Mensagem para enviar</Label>
                <Textarea
                  value={rentalPaySuccess.mensagem}
                  readOnly
                  className="text-sm resize-none"
                  rows={7}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(rentalPaySuccess.mensagem);
                    toast.success("Mensagem copiada!");
                  }}
                >
                  Copiar mensagem
                </Button>
                {rentalPaySuccess.telefone && (
                  <Button variant="outline" className="flex-1" asChild>
                    <a
                      href={`https://wa.me/55${rentalPaySuccess.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(rentalPaySuccess.mensagem)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir WhatsApp
                    </a>
                  </Button>
                )}
              </div>

              <Button className="w-full" variant="outline" onClick={() => setRentalPaySuccess(null)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Detail Sheet ═══ */}
      <Sheet open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>Detalhes da Transação</span>
              {detailEntry && canEdit && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5"
                    onClick={() => { if (detailEntry) { setForm(resolveEntryAssociations({ ...detailEntry })); setMode("edit"); setDialogOpen(true); setDetailEntry(null); } }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
              )}
            </SheetTitle>
          </SheetHeader>
          {detailEntry && (() => {
            const de = detailEntry;
            const motoPlaca = de.motoId ? (motos.find(m => m.id === de.motoId)?.placa || de.placa || null) : (de.placa || null);
            const rawClientName = de.clienteId ? (clients.find(c => c.id === de.clienteId)?.nome || de.clienteNome || null) : (de.clienteNome || null);
            const fmtName = rawClientName ? rawClientName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : null;
            const catLabel = getCatLabel(de.categoria, de.tipo);
            const overdue = isOverdue(de);
            const bankBadge = de.conta ? getBankBadge(de.conta) : null;

            return (
              <div className="space-y-5 mt-4">
                {/* Valor destaque */}
                <div className="text-center py-4 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Valor</p>
                  <p className={`text-2xl font-bold ${mono} ${de.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                    {de.tipo === "receita" ? "+" : "–"} R$ {de.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between py-2 border-b border-border/30">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className={`text-sm font-semibold flex items-center gap-1.5 ${de.pago ? "text-success" : overdue ? "text-destructive" : "text-warning"}`}>
                    {de.pago ? <><CheckCircle2 className="h-4 w-4" /> Efetuado</> : overdue ? <><AlertTriangle className="h-4 w-4" /> Atrasado</> : <><Circle className="h-4 w-4" /> Pendente</>}
                  </span>
                </div>

                {/* Info rows */}
                {[
                  { label: "Tipo", value: de.tipo === "receita" ? "Receita" : "Despesa" },
                  { label: "Natureza", value: de.natureza === "investimento" ? "Investimento" : (de.natureza === "operacional" || (!de.natureza && motoPlaca)) ? "Operacional" : "Administrativo" },
                  { label: "Placa", value: motoPlaca || "—" },
                  { label: "Locatário", value: fmtName || "—" },
                  { label: "Categoria", value: catLabel + (de.subcategoria ? ` › ${de.subcategoria}` : "") },
                  { label: de.tipo === "despesa" ? "Data de Pagamento" : "Data de Recebimento", value: (() => { try { return format(parseISO(de.data), "dd/MM/yyyy"); } catch { return de.data; } })() },
                  { label: "Data Prevista", value: de.dataPrevista ? (() => { try { return format(parseISO(de.dataPrevista), "dd/MM/yyyy"); } catch { return de.dataPrevista; } })() : "—" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/20">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className="text-sm font-medium text-foreground">{row.value}</span>
                  </div>
                ))}

                {/* Conta com ícone */}
                <div className="flex items-center justify-between py-1.5 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">Conta</span>
                  {de.conta ? (
                    <span className="flex items-center gap-2">
                      <BankIcon conta={de.conta} size={24} />
                      <span className="text-sm font-medium">{de.conta}</span>
                    </span>
                  ) : <span className="text-sm text-muted-foreground">—</span>}
                </div>

                {/* Observação */}
                <div className="py-1.5 border-b border-border/20">
                  <span className="text-sm text-muted-foreground block mb-1">Observação</span>
                  <p className="text-sm font-medium text-foreground/80 italic">{de.observacao || "—"}</p>
                </div>

                {/* Tags */}
                <div className="py-1.5 border-b border-border/20">
                  <span className="text-sm text-muted-foreground block mb-1.5">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(de.tags || []).length > 0
                      ? (de.tags || []).map(t => <span key={t} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)
                      : <span className="text-xs text-muted-foreground/40">—</span>
                    }
                    {de.recorrente && <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1"><Repeat className="h-3 w-3" /> Recorrente</span>}
                    {de.despesaFixa && <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1"><Pin className="h-3 w-3" /> Fixa</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {!creditCards.some(c => c.nome === de.conta) && (
                    <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { togglePago(de.id); setDetailEntry(null); }}>
                      {de.pago ? <><Circle className="h-4 w-4" /> Desfazer</> : <><CheckCheck className="h-4 w-4" /> {de.tipo === "receita" ? "Receber" : "Pagar"}</>}
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="destructive" size="icon" className="shrink-0" onClick={() => handleDelete(de.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ═══════ Transfer Dialog ═══════ */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5" /> Transferência entre Contas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Conta de origem</Label>
              <Select value={transferFrom} onValueChange={setTransferFrom}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CONTAS.filter(c => c !== transferTo).map(c => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2"><BankIcon conta={c} size={16} /> {c}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conta de destino</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CONTAS.filter(c => c !== transferFrom).map(c => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2"><BankIcon conta={c} size={16} /> {c}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input className="pl-9" value={transferValor} onChange={e => {
                  const raw = e.target.value.replace(/[^\d]/g, "");
                  if (!raw) { setTransferValor(""); return; }
                  const num = parseInt(raw, 10);
                  const formatted = (num / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                  setTransferValor(formatted);
                }} placeholder="0,00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={transferData} onChange={e => setTransferData(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Observação <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input value={transferObs} onChange={e => setTransferObs(e.target.value)} placeholder="Ex: Saque para caixa" />
            </div>
            <Button onClick={handleTransfer} className="w-full gap-2" disabled={!transferFrom || !transferTo || !transferValor || transferFrom === transferTo}>
              <ArrowLeftRight className="h-4 w-4" /> Confirmar Transferência
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog: Adiantamento de Fatura ═══ */}
      <Dialog open={advOpen} onOpenChange={setAdvOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Adiantamento de Fatura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Cartão */}
            <div className="space-y-1.5">
              <Label>Cartão</Label>
              <Select value={advCardId} onValueChange={id => {
                setAdvCardId(id);
                const c = creditCards.find(x => x.id === id);
                if (c?.contaPagamento) setAdvBank(c.contaPagamento);
              }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {creditCards.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> {c.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const card = creditCards.find(c => c.id === advCardId);
                if (!card) return null;
                const invKey = `inv__${card.id}__`;
                const openInvoice = entries
                  .filter(e => e.categoria === "fatura_cartao" && e.id.startsWith(invKey) && !e.pago)
                  .sort((a, b) => (a.dataPrevista || a.data).localeCompare(b.dataPrevista || b.data))[0];
                if (!openInvoice) return <p className="text-xs text-muted-foreground mt-1">Nenhuma fatura aberta encontrada.</p>;
                return (
                  <p className="text-xs text-muted-foreground mt-1">
                    Fatura em aberto: <span className="font-semibold text-foreground">R$ {openInvoice.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    {" "}— vence {new Date(openInvoice.dataPrevista! + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                );
              })()}
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <Label>Valor do adiantamento</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input className="pl-9" value={advAmount} onChange={e => {
                  const raw = e.target.value.replace(/[^\d]/g, "");
                  if (!raw) { setAdvAmount(""); return; }
                  setAdvAmount((parseInt(raw, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
                }} placeholder="0,00" />
              </div>
            </div>

            {/* Data */}
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAdvDate(new Date().toISOString().split("T")[0])}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${advDate === new Date().toISOString().split("T")[0] ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}>Hoje</button>
                <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setAdvDate(d.toISOString().split("T")[0]); }}
                  className="text-xs px-3 py-1.5 rounded-full border bg-muted/50 text-muted-foreground border-border hover:bg-muted transition-colors">Ontem</button>
                <Input type="date" value={advDate} onChange={e => setAdvDate(e.target.value)} className="flex-1 h-8 text-sm" />
              </div>
            </div>

            {/* Banco pagador */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-muted-foreground" /> Banco que está pagando a fatura
              </Label>
              <Select value={advBank} onValueChange={setAdvBank}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o banco" />
                </SelectTrigger>
                <SelectContent>
                  {(bankAccountsList || []).filter(a => a.tipo !== "cartao").map(a => (
                    <SelectItem key={a.id} value={a.nome}>
                      <span className="flex items-center gap-2"><BankIcon conta={a.nome} size={16} /> {a.nome}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Observação */}
            <div className="space-y-1.5">
              <Label className="text-sm">Observação <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input value={advNote} onChange={e => setAdvNote(e.target.value)} placeholder="Ex: Pagamento parcial fevereiro" />
            </div>

            <Button
              onClick={handleSaveAdiantamento}
              className="w-full gap-2"
              disabled={!advCardId || !advAmount || !advDate || !advBank}
            >
              <Banknote className="h-4 w-4" /> Registrar Adiantamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
