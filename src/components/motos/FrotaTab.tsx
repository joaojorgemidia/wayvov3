import { Motorcycle } from "@/lib/types";
import { Tag } from "lucide-react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Pencil, Trash2, Download } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadStoredFile } from "@/lib/file-data";
import { downloadDocument } from "@/lib/document-storage";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { computeFinancingPaidExtra } from "@/lib/moto-financing";

const statusLabels: Record<string, string> = {
  disponivel: "Disponível",
  alugada: "Alugada",
  manutencao: "Manutenção",
  inativa: "Inativa",
  vendida: "Vendida",
};

// Status com destaque: dot colorido + fundo saturado
const statusStyles: Record<string, string> = {
  disponivel: "bg-success/12 text-success ring-success/25",
  alugada: "bg-primary/12 text-primary ring-primary/25",
  manutencao: "bg-warning/15 text-warning ring-warning/30",
  inativa: "bg-muted text-muted-foreground ring-muted-foreground/20",
  vendida: "bg-violet-500/12 text-violet-600 ring-violet-500/25",
};

const statusDot: Record<string, string> = {
  disponivel: "bg-success",
  alugada: "bg-primary",
  manutencao: "bg-warning",
  inativa: "bg-muted-foreground",
  vendida: "bg-violet-500",
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface FrotaTabProps {
  motos: Motorcycle[];
  onEdit: (moto: Motorcycle) => void;
  onDelete: (id: string) => void;
  onSell: (moto: Motorcycle) => void;
}

export function FrotaTab({ motos, onEdit, onDelete, onSell }: FrotaTabProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [infoMoto, setInfoMoto] = useState<Motorcycle | null>(null);
  const { canEdit, canDelete } = usePermissions();
  const cache = useDataCacheSnapshot();
  const rentals = cache.rentals;
  const financial = cache.financial;

  const filtered = useMemo(() => motos.filter((m) => {
    const matchSearch = m.placa.toLowerCase().includes(search.toLowerCase()) || m.aplicativo.toLowerCase().includes(search.toLowerCase()) || (m.modelo || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  }), [motos, search, statusFilter]);

  // Métricas por moto: aluguéis, faturamento bruto, despesas, líquido
  const metricsByMoto = useMemo(() => {
    const map: Record<string, { rentalsCount: number; faturado: number; despesas: number }> = {};
    motos.forEach((m) => {
      // Despesas iniciais: parcelas pagas do financiamento/parcelamento + entrada,
      // descontando o que já está lançado no financeiro para evitar duplicação.
      const financingPaid = computeFinancingPaidExtra(m, financial);
      map[m.id] = { rentalsCount: 0, faturado: 0, despesas: financingPaid };
    });
    rentals.forEach((r) => {
      const entry = map[r.motoId];
      if (entry) entry.rentalsCount += 1;
    });
    financial.forEach((e) => {
      const id = e.motoId;
      if (!id || !map[id]) return;
      // Considera apenas lançamentos efetivamente pagos e não ignorados
      if (e.ignorada || !e.pago) return;
      if (e.tipo === "receita") map[id].faturado += e.valor;
      else if (e.tipo === "despesa") map[id].despesas += e.valor;
    });
    return map;
  }, [motos, rentals, financial]);

  // Totais do rodapé baseados na lista filtrada
  const totals = useMemo(() => {
    let valorFipe = 0;
    let rentalsCount = 0;
    let faturado = 0;
    let despesas = 0;
    filtered.forEach((m) => {
      valorFipe += m.valorFipe || 0;
      const x = metricsByMoto[m.id];
      if (x) {
        rentalsCount += x.rentalsCount;
        faturado += x.faturado;
        despesas += x.despesas;
      }
    });
    return { valorFipe, rentalsCount, faturado, despesas, liquido: faturado - despesas };
  }, [filtered, metricsByMoto]);

  return (
    <div className="space-y-4">
      <Card className="p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar placa ou modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["all", "disponivel", "alugada", "manutencao", "inativa", "vendida"].map((s) => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {s !== "all" && <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary-foreground" : statusDot[s]}`} />}
                  {s === "all" ? "Todos" : statusLabels[s]}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ano Fab./Modelo
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelo</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Placa</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Aluguéis <InfoTooltip text="Quantidade total de locações registradas para esta moto" />
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Faturamento <InfoTooltip text="Soma de todas as receitas financeiras vinculadas a esta moto" />
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Despesas <InfoTooltip text="Soma de todas as despesas financeiras vinculadas a esta moto" />
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Faturamento líquido <InfoTooltip text="Total faturado − total de despesas desta moto" />
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const mt = metricsByMoto[m.id] || { rentalsCount: 0, faturado: 0, despesas: 0 };
                const liquido = mt.faturado - mt.despesas;
                return (
                  <tr key={m.id} className="border-b last:border-0 transition-colors hover:bg-primary/[0.03] cursor-pointer" onClick={() => setInfoMoto(m)}>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${statusStyles[m.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot[m.status]}`} />
                        {statusLabels[m.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-foreground/80">
                      {m.anoFabricacao && m.anoModelo ? `${m.anoFabricacao}/${m.anoModelo}` : m.anoModelo ?? "—"}
                      {m.cor && <span className="ml-2 text-xs text-muted-foreground font-sans">{m.cor}</span>}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{m.modelo || "—"}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 font-mono font-bold text-foreground">{m.placa}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">{mt.rentalsCount}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-foreground/80">{fmtBRL(mt.faturado)}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-foreground/80">{fmtBRL(mt.despesas)}</td>
                    <td className={`px-4 py-3.5 text-right font-mono tabular-nums font-semibold ${liquido >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtBRL(liquido)}</td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        {m.crlvStoragePath ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Baixar CRLV" onClick={async () => {
                            try {
                              await downloadDocument("crlv-documents", m.crlvStoragePath!, m.crlvPdfName || "crlv.pdf");
                            } catch (error) {
                              console.error("CRLV download error:", error);
                              toast.error("Não foi possível baixar o CRLV.");
                            }
                          }}><Download className="h-4 w-4" /></Button>
                        ) : m.crlvPdfData ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Baixar CRLV" onClick={() => {
                            try {
                              downloadStoredFile(m.crlvPdfData, m.crlvPdfName || "crlv.pdf", "application/pdf");
                            } catch (error) {
                              console.error("CRLV download error:", error);
                              toast.error("Não foi possível baixar o CRLV.");
                            }
                          }}><Download className="h-4 w-4" /></Button>
                        ) : m.crlvPdfName ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="CRLV precisa ser reanexado para download"
                            onClick={() => toast.warning("Esse CRLV é de um cadastro antigo e precisa ser reanexado para habilitar o download.")}
                          ><Download className="h-4 w-4 text-muted-foreground" /></Button>
                        ) : null}
                        {canEdit && <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" title="Editar" onClick={() => onEdit(m)}><Pencil className="h-4 w-4" /></Button>}
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-violet-500/10" title="Vender" onClick={() => onSell(m)}><Tag className="h-4 w-4 text-violet-600" /></Button>
                        {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10" title="Excluir" onClick={() => onDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Search className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium">Nenhuma moto encontrada</p>
                      <p className="text-xs">Ajuste os filtros ou cadastre uma nova moto</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="px-4 py-3.5 text-xs uppercase tracking-wider text-muted-foreground" colSpan={4}>
                    Totais ({filtered.length} {filtered.length === 1 ? "moto" : "motos"})
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{totals.rentalsCount}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums text-foreground">{fmtBRL(totals.faturado)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums text-foreground">{fmtBRL(totals.despesas)}</td>
                  <td className={`px-4 py-3.5 text-right font-mono tabular-nums ${totals.liquido >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtBRL(totals.liquido)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{fmtBRL(totals.valorFipe)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Dialog open={!!infoMoto} onOpenChange={open => !open && setInfoMoto(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{infoMoto?.modelo || infoMoto?.placa}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {[
              { label: "Placa",   value: infoMoto?.placa   || "—" },
              { label: "RENAVAM", value: infoMoto?.renavam  || "—" },
              { label: "Chassi",  value: infoMoto?.chassi  || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <span className="font-mono text-sm font-medium text-foreground select-all">{value}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
