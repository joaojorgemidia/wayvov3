import { useMemo } from "react";
import { Motorcycle } from "@/lib/types";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pencil, TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const decisaoLabels: Record<string, string> = {
  manter: "Manter",
  monitorar: "Monitorar",
  avaliar_venda: "Avaliar Venda",
};

const decisaoColors: Record<string, string> = {
  manter: "bg-success/10 text-success",
  monitorar: "bg-warning/10 text-warning",
  avaliar_venda: "bg-destructive/10 text-destructive",
};

function formatCurrency(v: number | null) {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface PatrimonioTabProps {
  motos: Motorcycle[];
  onEdit: (moto: Motorcycle) => void;
}

export function PatrimonioTab({ motos, onEdit }: PatrimonioTabProps) {
  const patrimonyMotos = useMemo(() => motos.filter(m => m.tipo === "propria" && m.valorCompra != null), [motos]);
  const totalCompra = patrimonyMotos.reduce((s, m) => s + (m.valorCompra || 0), 0);
  const totalFipe = patrimonyMotos.reduce((s, m) => s + (m.valorFipe || 0), 0);
  const valorizacao = totalFipe - totalCompra;
  const totalLucroOp = patrimonyMotos.reduce((s, m) => s + (m.lucroOperacional || 0), 0);
  const retornoTotal = valorizacao + totalLucroOp;

  // Chart data
  const receitaData = useMemo(() => patrimonyMotos.map(m => ({
    placa: m.placa,
    receita: m.lucroOperacional || 0,
  })).sort((a, b) => b.receita - a.receita), [patrimonyMotos]);

  const margemData = useMemo(() => patrimonyMotos.map(m => {
    const compra = m.valorCompra || 0;
    const lucro = m.lucroOperacional || 0;
    const margem = compra > 0 ? (lucro / compra) * 100 : 0;
    return { placa: m.placa, margem: parseFloat(margem.toFixed(1)) };
  }).sort((a, b) => b.margem - a.margem), [patrimonyMotos]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <DollarSign className="h-4 w-4" />
            Valor de Compra Total
            <InfoTooltip text="Soma dos valores de compra de todas as motos próprias cadastradas" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalCompra)}</p>
          <p className="text-xs text-muted-foreground">{patrimonyMotos.length} motos · média {formatCurrency(patrimonyMotos.length > 0 ? totalCompra / patrimonyMotos.length : 0)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <BarChart3 className="h-4 w-4" />
            Valor FIPE Atual
            <InfoTooltip text="Valor de mercado atual das motos conforme tabela FIPE" />
          </div>
          <p className="text-2xl font-bold text-primary">{formatCurrency(totalFipe)}</p>
          <p className="text-xs text-muted-foreground">média {formatCurrency(patrimonyMotos.length > 0 ? totalFipe / patrimonyMotos.length : 0)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            {valorizacao >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            Valorização Patrimonial
            <InfoTooltip text="Diferença entre o valor FIPE atual e o valor de compra. Positivo = valorização, negativo = depreciação" />
          </div>
          <p className={`text-2xl font-bold ${valorizacao >= 0 ? "text-success" : "text-destructive"}`}>
            {valorizacao >= 0 ? "+" : ""}{formatCurrency(valorizacao)}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalCompra > 0 ? `${valorizacao >= 0 ? "+" : ""}${((valorizacao / totalCompra) * 100).toFixed(1)}% vs compra` : "—"}
          </p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <TrendingUp className="h-4 w-4" />
            Retorno Total
            <InfoTooltip text="Lucro operacional acumulado + valorização/depreciação patrimonial" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(retornoTotal)}</p>
          <p className="text-xs text-muted-foreground">lucro op. + valorização</p>
        </Card>
      </div>

      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Controle Patrimonial por Moto — FIPE Real
        </h3>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Modelo</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Placa</th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Compra <InfoTooltip text="Valor pago na aquisição do veículo" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  FIPE Atual <InfoTooltip text="Valor de mercado atual pela tabela FIPE" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Var. FIPE <InfoTooltip text="Variação percentual entre valor de compra e FIPE atual" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Lucro Op. <InfoTooltip text="Lucro operacional acumulado com aluguéis deste veículo" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">
                  Retorno Total <InfoTooltip text="Soma da variação FIPE + lucro operacional. O % indica o ROA (retorno sobre o ativo)" />
                </th>
                <th className="px-3 py-3 text-center font-semibold text-muted-foreground">
                  Decisão <InfoTooltip text="Recomendação: Manter, Monitorar ou Avaliar Venda" />
                </th>
                <th className="px-3 py-3 text-right font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {patrimonyMotos.map((m) => {
                const compra = m.valorCompra || 0;
                const fipe = m.valorFipe || 0;
                const varFipe = compra > 0 ? ((fipe - compra) / compra) * 100 : 0;
                const lucroOp = m.lucroOperacional || 0;
                const retorno = (fipe - compra) + lucroOp;
                const roaPct = compra > 0 ? ((retorno / compra) * 100) : 0;
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 text-muted-foreground text-xs">{m.modelo || "—"}{m.anoFabricacao && m.anoModelo ? ` ${m.anoFabricacao}/${m.anoModelo}` : m.anoModelo ? ` ${m.anoModelo}` : ""}</td>
                    <td className="px-3 py-3 font-mono font-bold text-foreground">{m.placa}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatCurrency(compra)}</td>
                    <td className="px-3 py-3 text-right font-mono text-primary font-semibold">{fipe > 0 ? formatCurrency(fipe) : "—"}</td>
                    <td className="px-3 py-3 text-right">
                      {fipe > 0 ? (
                        <span className={`font-semibold ${varFipe >= 0 ? "text-success" : "text-destructive"}`}>
                          {varFipe >= 0 ? "+" : ""}{varFipe.toFixed(1)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{formatCurrency(lucroOp)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-semibold ${retorno >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(retorno)}
                      </span>
                      {compra > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">({roaPct.toFixed(0)}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {m.decisao ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${decisaoColors[m.decisao]}`}>
                          {decisaoLabels[m.decisao]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {patrimonyMotos.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="space-y-2">
                      <BarChart3 className="h-8 w-8 mx-auto opacity-40" />
                      <p className="font-medium">Nenhuma moto com dados patrimoniais</p>
                      <p className="text-xs">Edite uma moto e preencha a aba "Patrimônio" para ver os dados aqui.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts */}
      {patrimonyMotos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receita acumulada por moto */}
          <Card className="p-5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1">
                Receita Acumulada por Moto
                <InfoTooltip text="Lucro operacional acumulado de cada moto com aluguéis, ordenado do maior para o menor" />
              </h4>
              <p className="text-xs text-muted-foreground">Lucro operacional individual</p>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receitaData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="placa" type="category" width={80} className="text-xs fill-muted-foreground font-mono" />
                  <Tooltip
                    formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR")}`, "Receita"]}
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--popover-foreground))" }}
                  />
                  <Bar dataKey="receita" radius={[0, 4, 4, 0]}>
                    {receitaData.map((entry, index) => (
                      <Cell key={index} fill={entry.receita >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Margem operacional por moto */}
          <Card className="p-5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1">
                Margem Operacional por Moto (%)
                <InfoTooltip text="Percentual do lucro operacional em relação ao valor de compra. Quanto maior, melhor o retorno do investimento" />
              </h4>
              <p className="text-xs text-muted-foreground">Lucro operacional ÷ valor de compra</p>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={margemData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={(v) => `${v}%`} className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="placa" type="category" width={80} className="text-xs fill-muted-foreground font-mono" />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, "Margem"]}
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--popover-foreground))" }}
                  />
                  <Bar dataKey="margem" radius={[0, 4, 4, 0]}>
                    {margemData.map((entry, index) => (
                      <Cell key={index} fill={entry.margem >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Info box */}
      <Card className="p-4 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">
          <strong>💡 Dica:</strong> Janela ótima de venda: entre 18–30 meses de uso. Antes disso, a valorização ainda está em curso. 
          Depois de 36 meses, a depreciação acelera e o custo de manutenção corretiva aumenta.
        </p>
      </Card>
    </div>
  );
}
