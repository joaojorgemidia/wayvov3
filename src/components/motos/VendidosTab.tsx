import { useMemo, useState } from "react";
import { Motorcycle, FinancialEntry } from "@/lib/types";
import { loadFinancial } from "@/lib/store";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp, TrendingDown, Route } from "lucide-react";

function fmt(v: number | null) {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtKm(v: number | null) {
  if (v == null) return "—";
  return `${v.toLocaleString("pt-BR")} km`;
}

interface VendidosTabProps {
  motos: Motorcycle[];
  onUpdate?: (id: string, updates: Partial<Motorcycle>) => void;
  vehicleLabel?: "todos" | "moto" | "carro";
}

type EditingCell = { id: string; field: "valorVenda" | "dataVenda" } | null;

export function VendidosTab({ motos, onUpdate, vehicleLabel = "moto" }: VendidosTabProps) {
  const plural = vehicleLabel === "carro" ? "carros" : vehicleLabel === "todos" ? "veículos" : "motos";
  const soldMotos = useMemo(() => motos.filter(m => m.status === "vendida"), [motos]);
  const financial = useMemo(() => loadFinancial(), []);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (id: string, field: "valorVenda" | "dataVenda", current: string) => {
    if (!onUpdate) return;
    setEditing({ id, field });
    setEditValue(current);
  };

  const commitEdit = () => {
    if (!editing || !onUpdate) return;
    const { id, field } = editing;
    if (field === "valorVenda") {
      const num = editValue === "" ? null : Number(editValue);
      onUpdate(id, { valorVenda: num != null && !isNaN(num) ? num : null });
    } else {
      onUpdate(id, { dataVenda: editValue || null });
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const enriched = useMemo(() => soldMotos.map(m => {
    const motoEntries = financial.filter(f => f.motoId === m.id);
    const faturamento = motoEntries.filter(f => f.tipo === "receita").reduce((s, f) => s + f.valor, 0);
    const despesas = motoEntries.filter(f => f.tipo === "despesa").reduce((s, f) => s + f.valor, 0);
    const lucroOperacional = faturamento - despesas;
    const resultadoVenda = (m.valorVenda || 0) - (m.valorCompra || 0);
    const lucroLiquido = lucroOperacional + resultadoVenda;
    const kmRodados = (m.kmVenda != null && m.kmCompra != null) ? m.kmVenda - m.kmCompra : null;
    return { ...m, faturamento, despesas, lucroOperacional, resultadoVenda, lucroLiquido, kmRodados };
  }), [soldMotos, financial]);

  const totals = useMemo(() => ({
    faturamento: enriched.reduce((s, m) => s + m.faturamento, 0),
    despesas: enriched.reduce((s, m) => s + m.despesas, 0),
    lucroLiquido: enriched.reduce((s, m) => s + m.lucroLiquido, 0),
    kmTotal: enriched.reduce((s, m) => s + (m.kmRodados || 0), 0),
  }), [enriched]);

  if (soldMotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <DollarSign className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhum{vehicleLabel === "moto" ? "a" : ""} {vehicleLabel === "todos" ? "veículo" : vehicleLabel} vendid{vehicleLabel === "moto" ? "a" : "o"} registrad{vehicleLabel === "moto" ? "a" : "o"}</p>
        <p className="text-xs mt-1">Use o botão "Vender" na aba Frota para registrar uma venda</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground">Faturamento Total <InfoTooltip text={`Soma de todas as receitas vinculadas ${vehicleLabel === "moto" ? "às motos vendidas" : vehicleLabel === "carro" ? "aos carros vendidos" : "aos veículos vendidos"} durante o período em que estiveram na frota`} /></span>
          </div>
          <p className="text-lg font-bold text-foreground">{fmt(totals.faturamento)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Despesas Total <InfoTooltip text={`Soma de todas as despesas vinculadas ${vehicleLabel === "moto" ? "às motos vendidas" : vehicleLabel === "carro" ? "aos carros vendidos" : "aos veículos vendidos"} (manutenções, peças, etc.)`} /></span>
          </div>
          <p className="text-lg font-bold text-foreground">{fmt(totals.despesas)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Lucro Líquido <InfoTooltip text="Resultado final: faturamento operacional − despesas + resultado da venda (valor venda − valor compra)" /></span>
          </div>
          <p className={`text-lg font-bold ${totals.lucroLiquido >= 0 ? "text-success" : "text-destructive"}`}>{fmt(totals.lucroLiquido)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Route className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">KM Total Rodados <InfoTooltip text={`Total de quilômetros percorridos por tod${vehicleLabel === "moto" ? "as as" : "os os"} ${plural} vendid${vehicleLabel === "moto" ? "as" : "os"} enquanto estiveram na frota`} /></span>
          </div>
          <p className="text-lg font-bold text-foreground">{fmtKm(totals.kmTotal)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Modelo</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Placa</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">
                  Data Venda <InfoTooltip text={`Data em que ${vehicleLabel === "moto" ? "a moto foi vendida" : vehicleLabel === "carro" ? "o carro foi vendido" : "o veículo foi vendido"}`} />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Compra <InfoTooltip text="Valor pago na aquisição" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Venda <InfoTooltip text="Valor recebido na venda" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Faturamento <InfoTooltip text="Total de receitas operacionais enquanto esteve na frota" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Despesas <InfoTooltip text="Total de despesas operacionais" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Lucro Líquido <InfoTooltip text="Resultado final = (receitas − despesas) + (venda − compra)" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  KM Rodados <InfoTooltip text="Diferença entre KM final (venda) e KM inicial (compra)" />
                </th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(m => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3 text-muted-foreground">{m.modelo || "—"}</td>
                  <td className="px-3 py-3 font-mono font-bold text-foreground">{m.placa}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {editing?.id === m.id && editing.field === "dataVenda" ? (
                      <Input
                        type="date"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        className="h-7 w-36 text-sm"
                      />
                    ) : (
                      <span
                        className={onUpdate ? "cursor-pointer rounded px-1 -mx-1 hover:bg-muted" : ""}
                        onClick={() => startEdit(m.id, "dataVenda", m.dataVenda || "")}
                      >
                        {m.dataVenda ? new Date(m.dataVenda + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(m.valorCompra)}</td>
                  <td className="px-3 py-3 text-right font-mono">
                    {editing?.id === m.id && editing.field === "valorVenda" ? (
                      <Input
                        type="number" step="0.01" min="0"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        className="h-7 w-28 text-right ml-auto"
                      />
                    ) : (
                      <span
                        className={onUpdate ? "cursor-pointer rounded px-1 -mx-1 hover:bg-muted" : ""}
                        onClick={() => startEdit(m.id, "valorVenda", m.valorVenda != null ? String(m.valorVenda) : "")}
                      >
                        {fmt(m.valorVenda)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-success">{fmt(m.faturamento)}</td>
                  <td className="px-3 py-3 text-right font-mono text-destructive">{fmt(m.despesas)}</td>
                  <td className={`px-3 py-3 text-right font-mono font-semibold ${m.lucroLiquido >= 0 ? "text-success" : "text-destructive"}`}>
                    {fmt(m.lucroLiquido)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKm(m.kmRodados)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
