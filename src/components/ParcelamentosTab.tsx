import { useMemo, useState } from "react";
import { format, addDays, differenceInDays } from "date-fns";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { saveFinancial as storeFinancialAll, loadFinancial } from "@/lib/store";
import { FinancialEntry, Rental, Motorcycle, Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown, ChevronRight, CheckCircle2, Clock, Plus,
  Wrench, Bike, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

// ─── Detecção de parcelas em FinancialEntries ─────────────────────────────────

function parseParcela(descricao: string): { index: number; total: number } | null {
  const m = descricao.match(/Parcela (\d+)\/(\d+)/i);
  if (!m) return null;
  return { index: parseInt(m[1]), total: parseInt(m[2]) };
}

function isEntrada(descricao: string): boolean {
  return /Entrada\s*\(Parcela 0\/\d+\)/i.test(descricao);
}

interface ParcelamentoEntry {
  entry: FinancialEntry;
  index: number;   // 0 = entrada, 1+ = parcelas
  total: number;
}

interface ParcelamentoGroup {
  groupId: string;
  tipo: "manutencao" | "aluguel" | "outro";
  titulo: string;
  clienteNome: string;
  placa: string;
  motoId: string | null;
  rentalId: string | null;
  items: ParcelamentoEntry[];
  totalParcelas: number;
  pagas: number;
  valorTotal: number;
  proximaData: string | null;
  concluido: boolean;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ParcelamentosTab() {
  const { financial, rentals, motos, clients, maintenance } = useDataCacheSnapshot();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showConcluidos, setShowConcluidos] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  const motoMap = useMemo(
    () => Object.fromEntries(motos.map(m => [m.id, m])),
    [motos],
  );
  const clientMap = useMemo(
    () => Object.fromEntries(clients.map(c => [c.id, c])),
    [clients],
  );
  const rentalMap = useMemo(
    () => Object.fromEntries(rentals.map(r => [r.id, r])),
    [rentals],
  );
  const maintenanceMap = useMemo(
    () => Object.fromEntries(maintenance.map(m => [m.id, m])),
    [maintenance],
  );

  // Agrupa FinancialEntries de parcelamento
  const groups = useMemo<ParcelamentoGroup[]>(() => {
    const map = new Map<string, FinancialEntry[]>();

    for (const e of financial) {
      if (!e.recurringGroupId) continue;
      const parsed = parseParcela(e.descricao);
      const entrada = isEntrada(e.descricao);
      if (!parsed && !entrada) continue;

      const key = e.recurringGroupId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }

    const result: ParcelamentoGroup[] = [];

    for (const [groupId, entries] of map.entries()) {
      if (entries.length === 0) continue;

      const sample = entries[0];
      const rental = sample.rentalId ? rentalMap[sample.rentalId] : null;
      const moto = sample.motoId ? motoMap[sample.motoId] : null;
      const client = sample.clienteId ? clientMap[sample.clienteId] : null;

      // Detecta tipo: se fixedOriginId aponta para manutenção → manutencao
      // Se category = aluguel → aluguel, senão outro
      const os = sample.fixedOriginId ? maintenanceMap[sample.fixedOriginId] : null;
      const tipo: "manutencao" | "aluguel" | "outro" =
        os ? "manutencao"
        : sample.categoria === "aluguel" ? "aluguel"
        : "outro";

      // Título: pega da descrição antes do "– Parcela" ou "– Entrada"
      const titulo = entries[0].descricao
        .replace(/\s*–\s*Entrada\s*\(Parcela 0\/\d+\)/i, "")
        .replace(/\s*–\s*Parcela \d+\/\d+/i, "")
        .trim();

      // Ordena: entrada (index 0) primeiro, depois por index
      const items: ParcelamentoEntry[] = entries.map(e => {
        const parsed = parseParcela(e.descricao);
        const entrada = isEntrada(e.descricao);
        return {
          entry: e,
          index: entrada ? 0 : (parsed?.index ?? 999),
          total: parsed?.total ?? (entrada ? parseInt(e.descricao.match(/Parcela 0\/(\d+)/)?.[1] ?? "0") : 0),
        };
      }).sort((a, b) => a.index - b.index);

      const totalParcelas = items.reduce((max, i) => Math.max(max, i.total), 0);
      const pagas = items.filter(i => i.entry.pago).length;
      const valorTotal = items.reduce((s, i) => s + i.entry.valor, 0);
      const pendentes = items.filter(i => !i.entry.pago);
      const proximaData = pendentes.length > 0
        ? (pendentes[0].entry.dataPrevista || pendentes[0].entry.data)
        : null;

      result.push({
        groupId,
        tipo,
        titulo,
        clienteNome: client?.nome ?? sample.clienteNome ?? "—",
        placa: moto?.placa ?? sample.placa ?? "—",
        motoId: sample.motoId,
        rentalId: sample.rentalId,
        items,
        totalParcelas,
        pagas,
        valorTotal,
        proximaData,
        concluido: pagas === items.length,
      });
    }

    return result.sort((a, b) => {
      if (a.concluido !== b.concluido) return a.concluido ? 1 : -1;
      if (!a.proximaData && !b.proximaData) return 0;
      if (!a.proximaData) return 1;
      if (!b.proximaData) return -1;
      return a.proximaData.localeCompare(b.proximaData);
    });
  }, [financial, rentalMap, motoMap, clientMap, maintenanceMap]);

  const visible = useMemo(
    () => showConcluidos ? groups : groups.filter(g => !g.concluido),
    [groups, showConcluidos],
  );

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function marcarPago(entry: FinancialEntry) {
    const all = loadFinancial();
    const updated = all.map(e => e.id === entry.id ? { ...e, pago: true, data: new Date().toISOString().slice(0, 10) } : e);
    await storeFinancialAll(updated);
    toast.success("Parcela marcada como paga");
  }

  async function marcarPendente(entry: FinancialEntry) {
    const all = loadFinancial();
    const updated = all.map(e => e.id === entry.id ? { ...e, pago: false } : e);
    await storeFinancialAll(updated);
    toast.success("Parcela revertida para pendente");
  }

  const totalPendente = visible
    .filter(g => !g.concluido)
    .reduce((s, g) => s + g.items.filter(i => !i.entry.pago).reduce((a, i) => a + i.entry.valor, 0), 0);

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {visible.filter(g => !g.concluido).length} parcelamento(s) ativo(s) ·{" "}
            <span className="text-destructive font-semibold">{fmtBRL(totalPendente)}</span> pendente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowConcluidos(v => !v)}
          >
            {showConcluidos ? "Ocultar concluídos" : "Mostrar concluídos"}
          </button>
          <Button size="sm" onClick={() => setNovoOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo Parcelamento
          </Button>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Nenhum parcelamento ativo</p>
          <p className="text-sm mt-1">
            Crie um parcelamento de semana ou acompanhe os gerados pelas ordens de serviço.
          </p>
        </div>
      )}

      {visible.map(g => {
        const isOpen = expanded.has(g.groupId);
        const today = new Date().toISOString().slice(0, 10);
        const diasProxima = g.proximaData
          ? differenceInDays(new Date(g.proximaData + "T00:00:00"), new Date(today + "T00:00:00"))
          : null;
        const atrasada = diasProxima !== null && diasProxima < 0;
        const urgente = diasProxima !== null && diasProxima >= 0 && diasProxima <= 3;

        return (
          <div
            key={g.groupId}
            className={cn(
              "border rounded-lg overflow-hidden",
              g.concluido ? "opacity-60" : atrasada ? "border-destructive/50" : "",
            )}
          >
            {/* Card header */}
            <button
              className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
              onClick={() => toggleExpand(g.groupId)}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 text-muted-foreground">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {g.tipo === "manutencao" && <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    {g.tipo === "aluguel" && <Bike className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="font-medium text-sm truncate">{g.titulo}</span>
                    {g.concluido && (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                        Quitado
                      </Badge>
                    )}
                    {atrasada && !g.concluido && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Atrasado
                      </Badge>
                    )}
                    {urgente && !g.concluido && !atrasada && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Vence em breve
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {g.clienteNome} · {g.placa}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 space-y-1">
                {/* Dots: ● pago, ○ pendente */}
                <div className="flex gap-1 justify-end">
                  {g.items.map((item, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        "h-2 w-2 rounded-full",
                        item.entry.pago ? "bg-emerald-500" : "bg-muted-foreground/30",
                      )}
                      title={item.entry.pago ? "Pago" : "Pendente"}
                    />
                  ))}
                </div>
                <div className="text-xs font-semibold">{g.pagas}/{g.items.length} pagas</div>
                <div className="text-xs text-muted-foreground">{fmtBRL(g.valorTotal)}</div>
              </div>
            </button>

            {/* Expandido: lista de parcelas */}
            {isOpen && (
              <div className="border-t bg-muted/10 divide-y">
                {g.items.map((item) => {
                  const dueDate = item.entry.dataPrevista || item.entry.data;
                  const dias = differenceInDays(
                    new Date(dueDate + "T00:00:00"),
                    new Date(today + "T00:00:00"),
                  );
                  const late = !item.entry.pago && dias < 0;
                  const label = item.index === 0
                    ? `Entrada · Parcela 0/${item.total}`
                    : `Parcela ${item.index}/${item.total}`;

                  return (
                    <div
                      key={item.entry.id}
                      className={cn(
                        "px-4 py-2.5 flex items-center justify-between gap-3",
                        item.entry.pago ? "opacity-60" : "",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.entry.pago
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <Clock className={cn("h-4 w-4 shrink-0", late ? "text-destructive" : "text-muted-foreground")} />
                        }
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{label}</div>
                          <div className={cn(
                            "text-xs",
                            item.entry.pago ? "text-muted-foreground"
                            : late ? "text-destructive font-medium"
                            : "text-muted-foreground",
                          )}>
                            {item.entry.pago
                              ? `Pago em ${fmtDate(item.entry.data)}`
                              : late
                                ? `Venceu em ${fmtDate(dueDate)} (${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? "s" : ""} atrás)`
                                : dias === 0
                                  ? "Vence hoje"
                                  : `Vence em ${fmtDate(dueDate)} (${dias} dia${dias !== 1 ? "s" : ""})`
                            }
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">{fmtBRL(item.entry.valor)}</span>
                        {!item.entry.pago
                          ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => marcarPago(item.entry)}
                            >
                              Marcar pago
                            </Button>
                          )
                          : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => marcarPendente(item.entry)}
                            >
                              Reverter
                            </Button>
                          )
                        }
                      </div>
                    </div>
                  );
                })}

                {/* Totais */}
                <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
                  <span>
                    {g.pagas === g.items.length
                      ? "Todas as parcelas pagas ✓"
                      : `${g.items.length - g.pagas} parcela(s) pendente(s)`}
                  </span>
                  <span className="font-semibold text-foreground">{fmtBRL(g.valorTotal)} total</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <NovoParcelamentoDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        rentals={rentals}
        motos={motos}
        clients={clients}
      />
    </div>
  );
}

// ─── Dialog: Novo Parcelamento de Semana/Aluguel ──────────────────────────────

function NovoParcelamentoDialog({
  open, onOpenChange, rentals, motos, clients,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rentals: Rental[];
  motos: Motorcycle[];
  clients: Client[];
}) {
  const [rentalId, setRentalId] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [nParcelas, setNParcelas] = useState("2");
  const [primeiraData, setPrimeiraData] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [salvando, setSalvando] = useState(false);

  const motoMap = Object.fromEntries(motos.map(m => [m.id, m]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const activeRentals = rentals.filter(r => r.status === "ativa");

  const rental = rentalId ? rentals.find(r => r.id === rentalId) : null;
  const moto = rental ? motoMap[rental.motoId] : null;
  const client = rental ? clientMap[rental.clienteId] : null;

  const valorNum = parseFloat(valorTotal.replace(",", ".")) || 0;
  const nParcelasNum = parseInt(nParcelas) || 2;
  const valorParcela = nParcelasNum > 0 ? valorNum / nParcelasNum : 0;

  // Gera preview das parcelas
  const preview = useMemo(() => {
    if (!primeiraData || valorNum <= 0 || nParcelasNum < 2) return [];
    return Array.from({ length: nParcelasNum }, (_, i) => {
      const data = format(addDays(new Date(primeiraData + "T00:00:00"), i * 7), "yyyy-MM-dd");
      return { index: i + 1, data, valor: valorParcela };
    });
  }, [primeiraData, valorNum, nParcelasNum, valorParcela]);

  async function handleSalvar() {
    if (!rentalId) { toast.error("Selecione a locação"); return; }
    if (!periodo.trim()) { toast.error("Informe o período (ex: Semana 10-16/06)"); return; }
    if (valorNum <= 0) { toast.error("Informe o valor total"); return; }
    if (nParcelasNum < 2) { toast.error("Mínimo 2 parcelas"); return; }

    setSalvando(true);
    try {
      const groupId = crypto.randomUUID();
      const descBase = `Aluguel – ${periodo.trim()}`;
      const entries: FinancialEntry[] = preview.map(p => ({
        id: crypto.randomUUID(),
        tipo: "receita" as const,
        categoria: "aluguel",
        descricao: `${descBase} – Parcela ${p.index}/${nParcelasNum}`,
        valor: parseFloat(valorParcela.toFixed(2)),
        data: p.data,
        dataPrevista: p.data,
        motoId: rental?.motoId ?? null,
        rentalId,
        clienteId: rental?.clienteId ?? null,
        pago: false,
        conta: "",
        natureza: "operacional" as const,
        placa: moto?.placa,
        clienteNome: client?.nome,
        recurringGroupId: groupId,
        tags: ["parcelamento", "aluguel"],
      }));

      const all = loadFinancial();
      await storeFinancialAll([...all, ...entries]);

      toast.success(`${nParcelasNum} parcelas criadas para ${client?.nome ?? "locatário"}`);
      onOpenChange(false);
      setRentalId("");
      setPeriodo("");
      setValorTotal("");
      setNParcelas("2");
      setPrimeiraData(new Date().toISOString().slice(0, 10));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Parcelamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Locação */}
          <div className="space-y-1.5">
            <Label>Locação ativa</Label>
            <Select value={rentalId} onValueChange={setRentalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar locação…" />
              </SelectTrigger>
              <SelectContent>
                {activeRentals.map(r => {
                  const m = motoMap[r.motoId];
                  const c = clientMap[r.clienteId];
                  const num = !r.numero ? r.id.slice(0, 6) : r.createdAt >= "2026-06-01" ? `L${String(r.numero).padStart(5, "0")}MV` : `#${String(r.numero).padStart(5, "0")}`;
                  return (
                    <SelectItem key={r.id} value={r.id}>
                      {num} · {c?.nome ?? "?"} · {m?.placa ?? "?"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {rental && (
              <p className="text-xs text-muted-foreground">
                {client?.nome} · {moto?.placa} · {moto?.modelo}
              </p>
            )}
          </div>

          {/* Período */}
          <div className="space-y-1.5">
            <Label>Período / Referência</Label>
            <Input
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
              placeholder="ex: Semana 10-16/06 ou Semana 25/06"
            />
            <p className="text-xs text-muted-foreground">
              Aparecerá na descrição: "Aluguel – <em>{periodo || "Semana ..."}</em> – Parcela 1/N"
            </p>
          </div>

          {/* Valor e parcelas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor total (R$)</Label>
              <Input
                type="number"
                value={valorTotal}
                onChange={e => setValorTotal(e.target.value)}
                placeholder="300,00"
                min={0}
                step={0.01}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nº de parcelas</Label>
              <Input
                type="number"
                value={nParcelas}
                onChange={e => setNParcelas(e.target.value)}
                min={2}
                max={52}
              />
            </div>
          </div>

          {/* Data da 1ª parcela */}
          <div className="space-y-1.5">
            <Label>Data da 1ª parcela</Label>
            <Input
              type="date"
              value={primeiraData}
              onChange={e => setPrimeiraData(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              As demais parcelas serão geradas semanalmente (a cada 7 dias).
            </p>
          </div>

          {/* Preview */}
          {preview.length > 0 && valorNum > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Prévia das parcelas</Label>
              <div className="border rounded-md divide-y text-sm">
                {preview.map(p => (
                  <div key={p.index} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Parcela {p.index}/{nParcelasNum} · {fmtDate(p.data)}
                    </span>
                    <span className="font-semibold">{fmtBRL(p.valor)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/30">
                  <span>Total</span>
                  <span>{fmtBRL(valorNum)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || !rentalId || !periodo.trim() || valorNum <= 0 || nParcelasNum < 2}
          >
            {salvando ? "Salvando…" : `Criar ${nParcelasNum} parcelas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
