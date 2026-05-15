import { useMemo } from "react";
import { Motorcycle, FinancialEntry } from "@/lib/types";
import { loadFinancial } from "@/lib/store";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Card } from "@/components/ui/card";
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
}

export function VendidosTab({ motos }: VendidosTabProps) {
  const soldMotos = useMemo(() => motos.filter(m => m.status === "vendida"), [motos]);
  const financial = useMemo(() => loadFinancial(), []);

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
        <p className="text-sm">Nenhuma moto vendida registrada</p>
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
            <span className="text-xs text-muted-foreground">Faturamento Total <InfoTooltip text="Soma de todas as receitas vinculadas às motos vendidas durante o período em que estiveram na frota" /></span>
          </div>
          <p className="text-lg font-bold text-foreground">{fmt(totals.faturamento)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Despesas Total <InfoTooltip text="Soma de todas as despesas vinculadas às motos vendidas (manutenções, peças, etc.)" /></span>
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
            <span className="text-xs text-muted-foreground">KM Total Rodados <InfoTooltip text="Total de quilômetros percorridos por todas as motos vendidas enquanto estiveram na frota" /></span>
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
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Placa</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Modelo</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">
                  Data Venda <InfoTooltip text="Data em que a moto foi vendida" />
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
                  <td className="px-3 py-3 font-mono font-bold text-foreground">{m.placa}</td>
                  <td className="px-3 py-3 text-muted-foreground">{m.modelo || "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{m.dataVenda ? new Date(m.dataVenda + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(m.valorCompra)}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(m.valorVenda)}</td>
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
