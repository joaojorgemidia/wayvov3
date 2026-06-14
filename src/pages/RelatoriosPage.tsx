import { useState, useMemo, useCallback } from "react";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DEFAULT_CATEGORIAS } from "@/lib/financeiro-constants";

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PERIODS = [
  { label: "Este mês", getFrom: () => startOfMonth(new Date()), getTo: () => new Date() },
  { label: "Mês passado", getFrom: () => startOfMonth(subMonths(new Date(), 1)), getTo: () => endOfMonth(subMonths(new Date(), 1)) },
  { label: "90 dias", getFrom: () => subDays(new Date(), 90), getTo: () => new Date() },
  { label: "Este ano", getFrom: () => new Date(new Date().getFullYear(), 0, 1), getTo: () => new Date() },
];

// Categorias de despesa que são custo operacional direto
const CUSTOS_OP = new Set(["manutencao_despesa", "lava_jato", "rastreador", "seguro", "multa_transito"]);
// Categorias que são capex/investimento
const CAPEX = new Set(["compra_moto"]);
// Pass-through que não entram no P&L
const PASS_THROUGH = new Set(["transferencia", "ajuste_saldo", "fatura_cartao"]);

function dreClassificarDespesa(cat: string): "operacional" | "admin" | "capex" | "passthrough" {
  if (PASS_THROUGH.has(cat)) return "passthrough";
  if (CUSTOS_OP.has(cat)) return "operacional";
  if (CAPEX.has(cat)) return "capex";
  return "admin";
}

// Label de categoria (padrão ou custom)
function catLabel(value: string): string {
  for (const list of [DEFAULT_CATEGORIAS.receita, DEFAULT_CATEGORIAS.despesa]) {
    const found = list.find(c => c.value === value);
    if (found) return found.label;
  }
  if (value.startsWith("custom_")) {
    return value.slice(7).replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  }
  return value;
}

export default function RelatoriosPage() {
  const { motos, clients, rentals, financial, maintenance, fines } = useDataCacheSnapshot();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });

  const inRange = useCallback((dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      return isWithinInterval(d, { start: dateRange.from, end: dateRange.to });
    } catch { return false; }
  }, [dateRange.from, dateRange.to]);

  // ─── DRE ────────────────────────────────────────────────────────────────────
  const dre = useMemo(() => {
    const paid = financial.filter(e => !e.ignorada && e.pago);

    const receitas = paid.filter(e => e.tipo === "receita" && inRange(e.data));
    const despesas = paid.filter(e => e.tipo === "despesa" && inRange(e.data));

    const receitaBruta = receitas.reduce((s, e) => s + e.valor, 0);
    const receitaByCategoria: Record<string, number> = {};
    receitas.forEach(e => { receitaByCategoria[e.categoria] = (receitaByCategoria[e.categoria] || 0) + e.valor; });

    const custosOp = despesas.filter(e => dreClassificarDespesa(e.categoria) === "operacional");
    const totalCustosOp = custosOp.reduce((s, e) => s + e.valor, 0);
    const custosByCategoria: Record<string, number> = {};
    custosOp.forEach(e => { custosByCategoria[e.categoria] = (custosByCategoria[e.categoria] || 0) + e.valor; });

    const lucroBruto = receitaBruta - totalCustosOp;

    const despAdmin = despesas.filter(e => dreClassificarDespesa(e.categoria) === "admin");
    const totalDespAdmin = despAdmin.reduce((s, e) => s + e.valor, 0);
    const despAdminByCategoria: Record<string, number> = {};
    despAdmin.forEach(e => { despAdminByCategoria[e.categoria] = (despAdminByCategoria[e.categoria] || 0) + e.valor; });

    const ebitda = lucroBruto - totalDespAdmin;

    const capex = despesas.filter(e => dreClassificarDespesa(e.categoria) === "capex");
    const totalCapex = capex.reduce((s, e) => s + e.valor, 0);
    const capexByCategoria: Record<string, number> = {};
    capex.forEach(e => { capexByCategoria[e.categoria] = (capexByCategoria[e.categoria] || 0) + e.valor; });

    const resultado = ebitda - totalCapex;
    const pct = (v: number) => receitaBruta > 0 ? (v / receitaBruta) * 100 : 0;

    return {
      receitaBruta, receitaByCategoria,
      totalCustosOp, custosByCategoria, lucroBruto, margemBruta: pct(lucroBruto),
      totalDespAdmin, despAdminByCategoria, ebitda, margemEbitda: pct(ebitda),
      totalCapex, capexByCategoria, resultado, margemLiquida: pct(resultado),
    };
  }, [financial, inRange]);

  // ─── FROTA ──────────────────────────────────────────────────────────────────
  const frotaReport = useMemo(() => {
    return motos
      .filter(m => m.status !== "vendida")
      .map(moto => {
        const motoStart = moto.dataCompra
          ? new Date(Math.max(new Date(moto.dataCompra + "T00:00:00").getTime(), dateRange.from.getTime()))
          : dateRange.from;
        const diasPeriodoMoto = Math.max(0, Math.floor((dateRange.to.getTime() - motoStart.getTime()) / 86400000));

        const receita = financial
          .filter(e => !e.ignorada && e.tipo === "receita" && e.pago && e.motoId === moto.id && inRange(e.data))
          .reduce((s, e) => s + e.valor, 0);
        const custos = financial
          .filter(e => !e.ignorada && e.tipo === "despesa" && e.pago && e.motoId === moto.id && inRange(e.data))
          .reduce((s, e) => s + e.valor, 0);

        const diasLocada = rentals
          .filter(r => r.motoId === moto.id && r.status !== "cancelada")
          .reduce((total, r) => {
            const ini = new Date(Math.max(new Date(r.dataInicio + "T00:00:00").getTime(), motoStart.getTime()));
            const fim = new Date(Math.min(
              r.dataFim ? new Date(r.dataFim + "T00:00:00").getTime() : dateRange.to.getTime(),
              dateRange.to.getTime()
            ));
            return total + Math.max(0, Math.floor((fim.getTime() - ini.getTime()) / 86400000));
          }, 0);

        const diasManutencao = maintenance
          .filter(mt => mt.motoId === moto.id && mt.dataFim)
          .reduce((total, mt) => {
            const s = new Date(Math.max(new Date(mt.data + "T00:00:00").getTime(), motoStart.getTime()));
            const e = new Date(Math.min(new Date(mt.dataFim! + "T00:00:00").getTime(), dateRange.to.getTime()));
            return total + Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86400000));
          }, 0);

        const ebitda = receita - custos;
        const margem = receita > 0 ? (ebitda / receita) * 100 : 0;
        const utilizacao = diasPeriodoMoto > 0 ? Math.min(100, (diasLocada / diasPeriodoMoto) * 100) : 0;
        const diasOciosa = Math.max(0, diasPeriodoMoto - diasLocada - diasManutencao);

        return { moto, receita, custos, ebitda, margem, diasLocada, diasManutencao, diasOciosa, utilizacao };
      })
      .sort((a, b) => b.receita - a.receita);
  }, [motos, financial, rentals, maintenance, dateRange, inRange]);

  // ─── CLIENTES ───────────────────────────────────────────────────────────────
  const clientesReport = useMemo(() => {
    const byCliente: Record<string, { nome: string; receita: number; contratos: Set<string> }> = {};

    financial.filter(e => !e.ignorada && e.tipo === "receita" && e.pago && inRange(e.data)).forEach(e => {
      const key = e.clienteId || e.clienteNome || "?";
      const nome = e.clienteNome || clients.find(c => c.id === e.clienteId)?.nome || key;
      if (!byCliente[key]) byCliente[key] = { nome, receita: 0, contratos: new Set() };
      byCliente[key].receita += e.valor;
      if (e.rentalId) byCliente[key].contratos.add(e.rentalId);
    });

    const ranking = Object.values(byCliente)
      .map(c => ({ ...c, contratos: c.contratos.size }))
      .sort((a, b) => b.receita - a.receita);

    const totalReceita = ranking.reduce((s, c) => s + c.receita, 0);
    return { ranking, totalReceita };
  }, [financial, clients, inRange]);

  // ─── INADIMPLÊNCIA ──────────────────────────────────────────────────────────
  const inadReport = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diff = (iso: string) => Math.floor((hoje.getTime() - new Date(iso + "T00:00:00").getTime()) / 86400000);

    const pendentes = financial.filter(e =>
      !e.ignorada && e.tipo === "receita" && !e.pago && e.dataPrevista && diff(e.dataPrevista) > 0
    );

    const byCliente: Record<string, { nome: string; f1: number; f2: number; f3: number }> = {};
    pendentes.forEach(e => {
      const key = e.clienteId || e.clienteNome || "?";
      const nome = e.clienteNome || clients.find(c => c.id === e.clienteId)?.nome || "Desconhecido";
      if (!byCliente[key]) byCliente[key] = { nome, f1: 0, f2: 0, f3: 0 };
      const d = diff(e.dataPrevista!);
      if (d <= 15) byCliente[key].f1 += e.valor;
      else if (d <= 30) byCliente[key].f2 += e.valor;
      else byCliente[key].f3 += e.valor;
    });

    return Object.values(byCliente)
      .map(c => ({ ...c, total: c.f1 + c.f2 + c.f3 }))
      .sort((a, b) => b.total - a.total);
  }, [financial, clients]);

  // ─── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-foreground">Relatórios</h2>
        <div className="flex items-center gap-1 flex-wrap">
          {PERIODS.map(p => {
            const pFrom = p.getFrom();
            const isActive = dateRange.from.toDateString() === pFrom.toDateString();
            return (
              <button
                key={p.label}
                onClick={() => setDateRange({ from: pFrom, to: p.getTo() })}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="text-xs text-muted-foreground px-1">
            {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} – {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
          </span>
        </div>
      </div>

      <Tabs defaultValue="dre">
        <TabsList className="h-9">
          <TabsTrigger value="dre" className="text-xs">DRE</TabsTrigger>
          <TabsTrigger value="frota" className="text-xs">Frota</TabsTrigger>
          <TabsTrigger value="clientes" className="text-xs">Clientes</TabsTrigger>
          <TabsTrigger value="inadimplencia" className="text-xs">Inadimplência</TabsTrigger>
        </TabsList>

        {/* ══════ DRE ══════════════════════════════════════════════════════════ */}
        <TabsContent value="dre" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-4">
                Demonstrativo de Resultado · {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} a {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
              </p>

              {/* RECEITAS */}
              <DreBlock label="Receita Bruta Operacional" value={dre.receitaBruta} sign="+" />
              {Object.entries(dre.receitaByCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} />)}

              <DreLineTotal label="= Receita Bruta" value={dre.receitaBruta} />

              {/* CUSTOS OPERACIONAIS */}
              {dre.totalCustosOp > 0 && (
                <>
                  <div className="mt-4" />
                  <DreBlock label="(−) Custos Operacionais Diretos" value={dre.totalCustosOp} sign="−" />
                  {Object.entries(dre.custosByCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} negative />)}
                </>
              )}

              <DreLineResult label="= Lucro Bruto" value={dre.lucroBruto} margem={dre.margemBruta} />

              {/* DESPESAS ADMINISTRATIVAS */}
              {dre.totalDespAdmin > 0 && (
                <>
                  <div className="mt-2" />
                  <DreBlock label="(−) Despesas Administrativas" value={dre.totalDespAdmin} sign="−" />
                  {Object.entries(dre.despAdminByCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} negative />)}
                </>
              )}

              <DreLineResult label="= EBITDA" value={dre.ebitda} margem={dre.margemEbitda} highlight />

              {/* CAPEX */}
              {dre.totalCapex > 0 && (
                <>
                  <div className="mt-2" />
                  <DreBlock label="(−) Investimentos / Capex" value={dre.totalCapex} sign="−" />
                  {Object.entries(dre.capexByCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} negative />)}
                  <DreLineResult label="= Resultado do Período" value={dre.resultado} margem={dre.margemLiquida} highlight />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════ FROTA ════════════════════════════════════════════════════════ */}
        <TabsContent value="frota" className="mt-6">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Moto", "Utilização", "Locada", "Ociosa", "Manut.", "Receita", "Custos", "EBITDA", "Margem"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {frotaReport.map(({ moto, receita, custos, ebitda, margem, diasLocada, diasOciosa, diasManutencao, utilizacao }) => (
                    <tr key={moto.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{moto.modelo}</p>
                        <p className="text-xs text-muted-foreground">{moto.placa}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${utilizacao}%` }} />
                          </div>
                          <span className="text-xs tabular-nums">{utilizacao.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{diasLocada}</td>
                      <td className={`px-4 py-3 tabular-nums ${diasOciosa > 15 ? "text-destructive font-medium" : "text-foreground"}`}>{diasOciosa}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{diasManutencao}</td>
                      <td className="px-4 py-3 tabular-nums font-medium text-foreground">{fmt(receita)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{fmt(custos)}</td>
                      <td className={`px-4 py-3 tabular-nums font-medium ${ebitda >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(ebitda)}</td>
                      <td className={`px-4 py-3 tabular-nums font-medium ${margem >= 25 ? "text-green-600" : margem >= 10 ? "text-yellow-600" : "text-destructive"}`}>{margem.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                {frotaReport.length > 0 && (() => {
                  const tR = frotaReport.reduce((s, m) => s + m.receita, 0);
                  const tC = frotaReport.reduce((s, m) => s + m.custos, 0);
                  const tE = tR - tC;
                  const tM = tR > 0 ? (tE / tR) * 100 : 0;
                  return (
                    <tfoot>
                      <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                        <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={5}>TOTAIS</td>
                        <td className="px-4 py-3 tabular-nums">{fmt(tR)}</td>
                        <td className="px-4 py-3 tabular-nums">{fmt(tC)}</td>
                        <td className={`px-4 py-3 tabular-nums ${tE >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(tE)}</td>
                        <td className={`px-4 py-3 tabular-nums ${tM >= 25 ? "text-green-600" : tM >= 10 ? "text-yellow-600" : "text-destructive"}`}>{tM.toFixed(1)}%</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
              {frotaReport.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Nenhum dado no período.</p>}
            </div>
          </Card>
        </TabsContent>

        {/* ══════ CLIENTES ═════════════════════════════════════════════════════ */}
        <TabsContent value="clientes" className="mt-6">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-8">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cliente</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Receita</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">% do total</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Contratos</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesReport.ranking.slice(0, 25).map((c, i) => {
                    const pct = clientesReport.totalReceita > 0 ? (c.receita / clientesReport.totalReceita) * 100 : 0;
                    return (
                      <tr key={i} className="border-b border-border hover:bg-muted/30">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{fmt(c.receita)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.contratos || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {clientesReport.ranking.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={2}>TOTAL ({clientesReport.ranking.length} clientes)</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(clientesReport.totalReceita)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
              {clientesReport.ranking.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Nenhuma receita no período.</p>}
            </div>
          </Card>
        </TabsContent>

        {/* ══════ INADIMPLÊNCIA ════════════════════════════════════════════════ */}
        <TabsContent value="inadimplencia" className="mt-6">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cliente</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">0 – 15 dias</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">16 – 30 dias</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">+ 30 dias</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inadReport.map((c, i) => (
                    <tr key={i} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.f1 > 0 ? fmt(c.f1) : "—"}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${c.f2 > 0 ? "text-yellow-600 font-medium" : "text-muted-foreground"}`}>
                        {c.f2 > 0 ? fmt(c.f2) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${c.f3 > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {c.f3 > 0 ? fmt(c.f3) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{fmt(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {inadReport.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-xs text-muted-foreground">TOTAL ({inadReport.length} clientes)</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(inadReport.reduce((s, c) => s + c.f1, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-yellow-600">{fmt(inadReport.reduce((s, c) => s + c.f2, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-destructive">{fmt(inadReport.reduce((s, c) => s + c.f3, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(inadReport.reduce((s, c) => s + c.total, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {inadReport.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Nenhuma inadimplência registrada.</p>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── DRE Sub-components ──────────────────────────────────────────────────────

function DreBlock({ label, value, sign }: { label: string; value: number; sign: "+" | "−" }) {
  return (
    <div className="flex items-center justify-between pt-3 pb-1">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-sm tabular-nums font-mono text-muted-foreground">
        {sign === "−" ? `(${fmt(value)})` : fmt(value)}
      </span>
    </div>
  );
}

function DreRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 pl-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums font-mono text-muted-foreground">
        {negative ? `(${fmt(value)})` : fmt(value)}
      </span>
    </div>
  );
}

function DreLineTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 mt-1 border-t border-border">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-sm tabular-nums font-mono font-semibold text-foreground">{fmt(value)}</span>
    </div>
  );
}

function DreLineResult({ label, value, margem, highlight = false }: {
  label: string; value: number; margem: number; highlight?: boolean;
}) {
  const color = value >= 0 ? "text-green-600" : "text-destructive";
  return (
    <div className={`flex items-center justify-between py-2.5 mt-1 border-t-2 border-border ${highlight ? "bg-muted/40 -mx-6 px-6" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className={`font-bold text-foreground ${highlight ? "text-base" : "text-sm"}`}>{label}</span>
        <span className={`text-xs font-mono ${color}`}>{margem.toFixed(1)}% margem</span>
      </div>
      <span className={`tabular-nums font-mono font-bold ${highlight ? "text-lg" : "text-sm"} ${color}`}>
        {fmt(value)}
      </span>
    </div>
  );
}
