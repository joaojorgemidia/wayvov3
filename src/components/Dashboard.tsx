import { useState, useMemo, useCallback, memo } from "react";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, DollarSign, Bike, Percent,
  AlertTriangle, CalendarIcon, ChevronUp, ChevronDown,
} from "lucide-react";
import { format, isWithinInterval, parseISO, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, Line } from "recharts";
import { InfoTooltip } from "@/components/InfoTooltip";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (v: number) => {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmt(v);
};

type MotoPerf = {
  id: string; modelo: string; placa: string; status: string;
  receita: number; custos: number; ebitda: number; margem: number;
  diasLocada: number; diasOciosa: number; diasManutencao: number; diasPeriodoMoto: number;
};

export const Dashboard = memo(function Dashboard() {
  const { motos, rentals, financial, maintenance, fines } = useDataCacheSnapshot();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [calOpen, setCalOpen] = useState(false);
  const [motoSort, setMotoSort] = useState<{ col: keyof MotoPerf; dir: "asc" | "desc" }>({ col: "receita", dir: "desc" });

  const inRange = useCallback((dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      return isWithinInterval(d, { start: dateRange.from, end: dateRange.to });
    } catch { return false; }
  }, [dateRange.from, dateRange.to]);

  const diasPeriodo = useMemo(() =>
    Math.max(1, Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / 86400000)),
    [dateRange]
  );

  const stats = useMemo(() => {
    const receitasPeriodo = financial.filter(e => !e.ignorada && e.tipo === "receita" && e.pago && inRange(e.data));
    const despesasPeriodo = financial.filter(e => !e.ignorada && e.tipo === "despesa" && e.pago && inRange(e.data));
    const entradas = receitasPeriodo.reduce((s, e) => s + e.valor, 0);
    const saidas = despesasPeriodo.reduce((s, e) => s + e.valor, 0);
    const lucro = entradas - saidas;

    const previsaoReceita = financial
      .filter(e => !e.ignorada && e.tipo === "receita")
      .filter(e => {
        const efetiva = e.pago ? e.data : (e.dataPrevista || e.data);
        return inRange(efetiva);
      })
      .reduce((s, e) => s + e.valor, 0);

    const receitasAluguelPeriodo = receitasPeriodo.filter(e =>
      (e.categoria || "").toLowerCase().includes("aluguel")
    );
    const contratosUnicosPeriodo = new Set(
      receitasAluguelPeriodo
        .map(e => e.rentalId || e.clienteId || e.placa || e.clienteNome)
        .filter(Boolean)
    );
    const totalAluguelPeriodo = receitasAluguelPeriodo.reduce((s, e) => s + e.valor, 0);
    const ticketMedio = contratosUnicosPeriodo.size > 0
      ? totalAluguelPeriodo / contratosUnicosPeriodo.size
      : 0;

    const custoTotal = maintenance.reduce((s, m) => s + m.custo, 0);
    const investimento = custoTotal > 0 ? custoTotal : 1;
    const roi = entradas > 0 ? ((lucro / investimento) * 100) : 0;

    const multasPendentes = fines.filter(f => f.status === "pendente" && inRange(f.dataMulta)).reduce((s, f) => s + f.valor, 0);
    const inadimplencia = entradas > 0 ? (multasPendentes / entradas) * 100 : 0;

    const motosAtivas = motos.filter(m => m.status !== "inativa" && m.status !== "vendida").length;

    const alugadas = motos.filter(m => m.status === "alugada").length;
    const disponiveis = motos.filter(m => m.status === "disponivel").length;
    const emManutencao = motos.filter(m => m.status === "manutencao").length;
    const inativas = motos.filter(m => m.status === "inativa").length;
    const vendidas = motos.filter(m => m.status === "vendida").length;
    const frotaAtual = motos.filter(m => m.status !== "vendida").length;
    const taxaUtilizacao = frotaAtual > 0 ? (alugadas / frotaAtual) * 100 : 0;

    const mesesPeriodo = Math.max(1, Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const receitaPorMotoPorMes = motosAtivas > 0 ? entradas / motosAtivas / mesesPeriodo : 0;
    const custoMedioPorMotoPorMes = motosAtivas > 0 ? saidas / motosAtivas / mesesPeriodo : 0;

    // RevPAVD — receita por ativo disponível por dia
    const revpavd = motosAtivas > 0 ? entradas / (motosAtivas * diasPeriodo) : 0;

    // Tempo Médio de Locação
    const locacoesFinalizadas = rentals.filter(r =>
      r.status === "finalizada" && r.dataInicio && r.dataFim && inRange(r.dataFim)
    );
    const tempoMedioLocacao: number | null = locacoesFinalizadas.length > 0
      ? locacoesFinalizadas.reduce((s, r) => {
          const dias = Math.max(0, Math.floor(
            (new Date(r.dataFim! + "T00:00:00").getTime() - new Date(r.dataInicio + "T00:00:00").getTime()) / 86400000
          ));
          return s + dias;
        }, 0) / locacoesFinalizadas.length
      : null;

    // Concentração Top 3 Clientes
    const receitaPorCliente: Record<string, number> = {};
    receitasPeriodo.forEach(e => {
      const key = e.clienteId || e.clienteNome || "desconhecido";
      receitaPorCliente[key] = (receitaPorCliente[key] || 0) + e.valor;
    });
    const top3soma = Object.values(receitaPorCliente).sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
    const concentracaoTop3 = entradas > 0 ? (top3soma / entradas) * 100 : 0;

    // Inadimplência por Faixa
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const pendentes = financial.filter(e => !e.ignorada && e.tipo === "receita" && !e.pago && e.dataPrevista);
    const diffDias = (iso: string) => Math.floor((hoje.getTime() - new Date(iso + "T00:00:00").getTime()) / 86400000);
    const inadFaixa1 = pendentes.filter(e => { const d = diffDias(e.dataPrevista!); return d >= 0 && d <= 15; }).reduce((s, e) => s + e.valor, 0);
    const inadFaixa2 = pendentes.filter(e => { const d = diffDias(e.dataPrevista!); return d > 15 && d <= 30; }).reduce((s, e) => s + e.valor, 0);
    const inadFaixa3 = pendentes.filter(e => diffDias(e.dataPrevista!) > 30).reduce((s, e) => s + e.valor, 0);

    return {
      entradas, saidas, lucro, previsaoReceita, ticketMedio, roi, inadimplencia,
      alugadas, disponiveis, emManutencao, inativas, vendidas, frotaAtual, taxaUtilizacao,
      receitaPorMotoPorMes, custoMedioPorMotoPorMes,
      revpavd, tempoMedioLocacao, concentracaoTop3,
      inadFaixa1, inadFaixa2, inadFaixa3, diasPeriodo,
    };
  }, [financial, maintenance, fines, motos, rentals, dateRange, inRange, diasPeriodo]);

  const growth = useMemo(() => {
    const ms = dateRange.to.getTime() - dateRange.from.getTime();
    const prevTo = new Date(dateRange.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - ms);
    const inPrev = (s: string) => {
      try { const d = parseISO(s); return d >= prevFrom && d <= prevTo; } catch { return false; }
    };

    const receitaPrev = financial.filter(e => !e.ignorada && e.tipo === "receita" && e.pago && inPrev(e.data)).reduce((s, e) => s + e.valor, 0);
    const despesaPrev = financial.filter(e => !e.ignorada && e.tipo === "despesa" && e.pago && inPrev(e.data)).reduce((s, e) => s + e.valor, 0);
    const lucroPrev = receitaPrev - despesaPrev;

    const frotaAtual = motos.filter(m => m.status !== "vendida" && m.status !== "inativa").length;
    const frotaPrev = motos.filter(m => {
      const created = (m as any).createdAt || (m as any).created_at;
      if (!created) return true;
      try { return parseISO(created) <= prevTo; } catch { return true; }
    }).filter(() => true).length;

    const margemAtual = stats.entradas > 0 ? (stats.lucro / stats.entradas) * 100 : 0;
    const margemPrev = receitaPrev > 0 ? (lucroPrev / receitaPrev) * 100 : 0;

    const pct = (cur: number, prev: number) => {
      if (prev === 0) return cur === 0 ? 0 : 100;
      return ((cur - prev) / Math.abs(prev)) * 100;
    };

    return {
      receitaPrev, lucroPrev, frotaAtual, frotaPrev, margemAtual, margemPrev,
      receitaDelta: pct(stats.entradas, receitaPrev),
      lucroDelta: pct(stats.lucro, lucroPrev),
      frotaDelta: pct(frotaAtual, frotaPrev),
      margemDelta: margemAtual - margemPrev,
    };
  }, [financial, motos, dateRange, stats.entradas, stats.lucro]);

  const motoPerformance = useMemo((): MotoPerf[] => {
    return motos
      .filter(m => m.status !== "vendida")
      .map(moto => {
        // Período efetivo da moto começa na data de compra (se posterior ao início do filtro)
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

        // Dias em manutenção: apenas registros com dataFim preenchido
        const diasManutencao = maintenance
          .filter(mt => mt.motoId === moto.id && mt.dataFim)
          .reduce((total, mt) => {
            const start = new Date(Math.max(new Date(mt.data + "T00:00:00").getTime(), motoStart.getTime()));
            const end = new Date(Math.min(new Date(mt.dataFim! + "T00:00:00").getTime(), dateRange.to.getTime()));
            return total + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
          }, 0);

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

        const diasOciosa = Math.max(0, diasPeriodoMoto - diasLocada - diasManutencao);
        const ebitda = receita - custos;
        const margem = receita > 0 ? (ebitda / receita) * 100 : 0;

        return { id: moto.id, modelo: moto.modelo, placa: moto.placa, status: moto.status, receita, custos, ebitda, margem, diasLocada, diasOciosa, diasManutencao, diasPeriodoMoto };
      })
      .sort((a, b) => b.receita - a.receita);
  }, [motos, financial, maintenance, rentals, dateRange, inRange]);

  const motosSorted = useMemo(() =>
    [...motoPerformance].sort((a, b) => {
      const getVal = (m: MotoPerf) => {
        const v = m[motoSort.col];
        return typeof v === "number" ? v : 0;
      };
      return motoSort.dir === "desc" ? getVal(b) - getVal(a) : getVal(a) - getVal(b);
    }), [motoPerformance, motoSort]);

  const toggleSort = (col: keyof MotoPerf) =>
    setMotoSort(p => ({ col, dir: p.col === col && p.dir === "desc" ? "asc" : "desc" }));

  const idMaiorReceita = motoPerformance[0]?.id;
  const motosComReceita = motoPerformance.filter(m => m.receita > 0);
  const idMenorMargem = motosComReceita.length > 0
    ? [...motosComReceita].sort((a, b) => a.margem - b.margem)[0].id
    : null;
  const motoMaxOciosa = motoPerformance.reduce<MotoPerf | null>((acc, m) =>
    m.diasOciosa > (acc?.diasOciosa ?? 0) ? m : acc, null
  );
  const idMaxOciosa = (motoMaxOciosa && motoMaxOciosa.diasOciosa > 10) ? motoMaxOciosa.id : null;

  const totalReceita = motoPerformance.reduce((s, m) => s + m.receita, 0);
  const totalCusto = motoPerformance.reduce((s, m) => s + m.custos, 0);
  const totalEbitda = totalReceita - totalCusto;
  const margemMedia = totalReceita > 0 ? (totalEbitda / totalReceita) * 100 : 0;

  const chartData = useMemo(() => {
    const motosAtivas = motos.filter(m => m.status !== "inativa" && m.status !== "vendida").length || 1;
    const alugadasCount = motos.filter(m => m.status === "alugada").length;
    const utilizacaoBase = motos.length > 0 ? (alugadasCount / motos.length) * 100 : 0;
    const months: Record<string, { entradas: number; saidas: number; lucro: number; month: string; utilizacao: number; receitaPorMoto: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = { entradas: 0, saidas: 0, lucro: 0, month: format(d, "MMM", { locale: ptBR }), utilizacao: utilizacaoBase, receitaPorMoto: 0 };
    }
    financial.filter(e => !e.ignorada && e.pago).forEach(e => {
      const key = e.data.substring(0, 7);
      if (months[key]) {
        if (e.tipo === "receita") months[key].entradas += e.valor;
        else months[key].saidas += e.valor;
      }
    });
    Object.values(months).forEach(m => {
      m.lucro = m.entradas - m.saidas;
      m.receitaPorMoto = m.entradas / motosAtivas;
    });
    return Object.values(months);
  }, [financial, motos]);

  const statusMap: Record<string, { label: string; cls: string }> = {
    alugada: { label: "alugada", cls: "bg-primary/10 text-primary" },
    disponivel: { label: "disponível", cls: "bg-success/10 text-success" },
    manutencao: { label: "manutenção", cls: "bg-warning/10 text-warning" },
    inativa: { label: "inativa", cls: "bg-muted text-muted-foreground" },
  };

  const SortTh = ({ col, label }: { col: keyof MotoPerf; label: string }) => (
    <th
      className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
      <span className={`flex items-center gap-0.5 ${motoSort.col === col ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
        {motoSort.col === col
          ? (motoSort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: "Este Mês", days: -1 },
            { label: "30 dias", days: 30 },
            { label: "60 dias", days: 60 },
            { label: "90 dias", days: 90 },
            { label: "Último ano", days: -9 },
            { label: "Máximo", days: -10 },
          ].map(p => {
            const today = new Date();
            let pFrom: Date;
            if (p.days === -1) pFrom = startOfMonth(today);
            else if (p.days === -9) pFrom = new Date(today.getFullYear() - 1, 0, 1);
            else if (p.days === -10) pFrom = new Date(2020, 0, 1);
            else pFrom = subDays(today, p.days);
            const isActive = dateRange.from.toDateString() === pFrom.toDateString();
            return (
              <Button key={p.label} variant="ghost" size="sm"
                className={`h-8 px-3 text-xs font-medium rounded-full ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDateRange({
                  from: pFrom,
                  to: p.days === -9 ? new Date(new Date().getFullYear() - 1, 11, 31) : new Date(),
                })}>
                {p.label}
              </Button>
            );
          })}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-full">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(dateRange.from, "dd/MM/yy")} — {format(dateRange.to, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 shadow-lg" align="end">
              <div className="flex divide-x divide-border">
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
                        setDateRange({ from, to });
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex gap-6 text-xs text-muted-foreground px-1">
                    <span>De: <span className="font-medium text-foreground">{format(dateRange.from, "dd/MM/yyyy")}</span></span>
                    <span>Até: <span className="font-medium text-foreground">{format(dateRange.to, "dd/MM/yyyy")}</span></span>
                  </div>
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range: any) => {
                      if (range?.from) setDateRange(prev => ({ ...prev, from: range.from }));
                      if (range?.to) setDateRange(prev => ({ ...prev, to: range.to }));
                    }}
                    numberOfMonths={2}
                    locale={ptBR}
                    className="p-0 pointer-events-auto"
                  />
                  <div className="flex gap-2 justify-end pt-1 border-t border-border">
                    <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setDateRange({ from: subMonths(new Date(), 12), to: new Date() }); setCalOpen(false); }}>
                      Limpar
                    </Button>
                    <Button size="sm" className="text-xs h-8" onClick={() => setCalOpen(false)}>
                      Aplicar
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* SEÇÃO 1 — Highlight Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <HighlightCard
          label="Crescimento da Frota"
          value={String(growth.frotaAtual)}
          unit="motos ativas"
          delta={growth.frotaDelta}
          deltaSuffix="vs período anterior"
          icon={<Bike className="h-5 w-5" />}
          accent="primary"
          info="Número atual de motos ativas (não vendidas/inativas) e variação percentual em relação ao período anterior equivalente."
        />
        <HighlightCard
          label="Faturamento"
          value={fmt(stats.entradas)}
          unit={`anterior: ${fmtShort(growth.receitaPrev)}`}
          delta={growth.receitaDelta}
          deltaSuffix="vs período anterior"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
          info="Receitas pagas no período selecionado e comparação com o mesmo intervalo imediatamente anterior."
        />
        <HighlightCard
          label="Rentabilidade Líquida"
          value={fmt(stats.lucro)}
          unit={`margem ${growth.margemAtual.toFixed(1)}%`}
          delta={growth.lucroDelta}
          deltaSuffix="vs período anterior"
          icon={<DollarSign className="h-5 w-5" />}
          accent={stats.lucro >= 0 ? "success" : "destructive"}
          info="Lucro líquido (Entradas − Saídas) e margem líquida (Lucro ÷ Entradas). Comparação com o período anterior equivalente."
        />
      </div>

      {/* SEÇÃO 2 — 4 KPI Cards estratégicos */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {/* RevPAVD */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center font-medium">
              REVPAVD
              <InfoTooltip text="Receita total ÷ (motos ativas × dias do período). KPI padrão da indústria de rental — equivalente ao RevPAR hoteleiro." />
            </p>
            <p className="text-xl font-bold text-foreground mt-1">
              {fmt(stats.revpavd)}/moto·dia
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">receita por moto disponível por dia</p>
          </CardContent>
        </Card>

        {/* Tempo Médio de Locação */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center font-medium">
              TEMPO MÉDIO DE LOCAÇÃO
              <InfoTooltip text="Média de dias de duração dos contratos encerrados (data de devolução) no período selecionado." />
            </p>
            {stats.tempoMedioLocacao === null ? (
              <p className="text-xl font-bold text-muted-foreground mt-1">— sem dados</p>
            ) : (
              <p className="text-xl font-bold text-foreground mt-1">
                {Math.round(stats.tempoMedioLocacao)} dias
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">duração média dos contratos</p>
          </CardContent>
        </Card>

        {/* Concentração Top 3 */}
        <Card className={stats.concentracaoTop3 > 40 ? "bg-destructive/5" : ""}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center font-medium">
              CONCENTRAÇÃO TOP 3
              <InfoTooltip text="Quando 3 clientes concentram >40% da receita, a saída de um pode impactar significativamente o faturamento." />
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-xl font-bold ${stats.concentracaoTop3 > 40 ? "text-destructive" : "text-foreground"}`}>
                {stats.concentracaoTop3.toFixed(1)}%
              </p>
              {stats.concentracaoTop3 > 40 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Risco</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">% da receita nos 3 maiores clientes</p>
          </CardContent>
        </Card>

        {/* Inadimplência por Faixa */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center font-medium">
              INADIMPLÊNCIA
              <InfoTooltip text="Receitas pendentes agrupadas por dias em atraso. Valores acima de 30 dias exigem ação imediata." />
            </p>
            <div className="mt-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">0–15 dias</span>
                <span className={stats.inadFaixa1 > 0 ? "text-warning font-medium" : "text-muted-foreground"}>{fmt(stats.inadFaixa1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">16–30 dias</span>
                <span className={stats.inadFaixa2 > 0 ? "text-warning font-medium" : "text-muted-foreground"}>{fmt(stats.inadFaixa2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">+30 dias</span>
                <span className={stats.inadFaixa3 > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>{fmt(stats.inadFaixa3)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO 3 — Linha resumo */}
      <p className="text-sm text-muted-foreground">
        Frota: {stats.frotaAtual} motos · {stats.alugadas} alugadas · {stats.disponiveis} disponíveis · Utilização: {stats.taxaUtilizacao.toFixed(0)}% · Ticket médio: {fmtShort(stats.ticketMedio)} · ROI: {stats.roi.toFixed(1)}%
      </p>

      {/* SEÇÃO 4 — Tabela Performance por Ativo */}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">PERFORMANCE POR ATIVO</p>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">MOTO</th>
                  <SortTh col="diasLocada" label="DIAS LOCADA" />
                  <SortTh col="diasOciosa" label="DIAS OCIOSO" />
                  <SortTh col="receita" label="RECEITA" />
                  <SortTh col="custos" label="CUSTOS" />
                  <SortTh col="ebitda" label="EBITDA" />
                  <SortTh col="margem" label="MARGEM" />
                </tr>
              </thead>
              <tbody>
                {motosSorted.map(m => {
                  const isMenorMargem = m.id === idMenorMargem;
                  const isMaiorReceita = m.id === idMaiorReceita && !isMenorMargem;
                  const isMaxOciosa = m.id === idMaxOciosa && !isMenorMargem;
                  const rowCls = [
                    "border-b border-border transition-colors",
                    isMenorMargem ? "border-l-2 border-destructive bg-destructive/5" : "",
                    isMaiorReceita ? "border-l-2 border-success bg-success/5" : "",
                    isMaxOciosa ? "bg-warning/5" : "",
                  ].filter(Boolean).join(" ");

                  const badge = statusMap[m.status] || { label: m.status, cls: "bg-muted text-muted-foreground" };
                  const progressPct = m.diasPeriodoMoto > 0 ? Math.min(100, (m.diasLocada / m.diasPeriodoMoto) * 100) : 0;

                  return (
                    <tr key={m.id} className={rowCls}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{m.modelo}</div>
                        <div className="text-xs text-muted-foreground">{m.placa}</div>
                        <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{m.diasLocada}</div>
                        <div className="mt-1 h-1 w-16 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${m.diasOciosa > 15 ? "text-destructive font-medium" : "text-foreground"}`}>{m.diasOciosa}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{fmt(m.receita)}</td>
                      <td className="px-4 py-3 text-foreground">{fmt(m.custos)}</td>
                      <td className={`px-4 py-3 font-medium ${m.ebitda >= 0 ? "text-success" : "text-destructive"}`}>{fmt(m.ebitda)}</td>
                      <td className={`px-4 py-3 font-medium ${m.margem >= 25 ? "text-success" : m.margem >= 10 ? "text-warning" : "text-destructive"}`}>
                        {m.margem.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t border-border font-semibold">
                  <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={3}>TOTAIS</td>
                  <td className="px-4 py-3 text-foreground">{fmt(totalReceita)}</td>
                  <td className="px-4 py-3 text-foreground">{fmt(totalCusto)}</td>
                  <td className={`px-4 py-3 ${totalEbitda >= 0 ? "text-success" : "text-destructive"}`}>{fmt(totalEbitda)}</td>
                  <td className={`px-4 py-3 ${margemMedia >= 25 ? "text-success" : margemMedia >= 10 ? "text-warning" : "text-destructive"}`}>
                    {margemMedia.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {/* SEÇÃO 5 — Charts com tabs */}
      <Tabs defaultValue="financeiro" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="financeiro" className="text-xs">Financeiro</TabsTrigger>
          <TabsTrigger value="frota" className="text-xs">Frota</TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground mb-1">Entradas vs Saídas</p>
                <p className="text-xs text-muted-foreground mb-4">Últimos 12 meses</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gEnt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gSai" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Area type="monotone" dataKey="entradas" stroke="hsl(var(--primary))" fill="url(#gEnt)" strokeWidth={2} name="Entradas" />
                    <Area type="monotone" dataKey="saidas" stroke="hsl(var(--destructive))" fill="url(#gSai)" strokeWidth={2} name="Saídas" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground mb-1">Lucro Líquido</p>
                <p className="text-xs text-muted-foreground mb-4">Evolução mensal</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gLucro" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Area type="monotone" dataKey="lucro" stroke="hsl(var(--primary))" fill="url(#gLucro)" strokeWidth={2} name="Lucro" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frota">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground mb-1">Utilização & Receita/Moto</p>
                <p className="text-xs text-muted-foreground mb-4">Últimos 12 meses</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} className="fill-muted-foreground" unit="%" />
                    <Tooltip formatter={(v: number, name: string) => name === "Utilização" ? `${v.toFixed(1)}%` : fmt(v)} />
                    <Bar yAxisId="left" dataKey="receitaPorMoto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Receita/Moto" opacity={0.8} />
                    <Line yAxisId="right" type="monotone" dataKey="utilizacao" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} name="Utilização" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground mb-1">Distribuição da Frota</p>
                <p className="text-xs text-muted-foreground mb-4">Status atual</p>
                <div className="space-y-3 pt-2">
                  <FleetBar label="Alugadas" count={stats.alugadas} total={motos.length} color="bg-primary" />
                  <FleetBar label="Disponíveis" count={stats.disponiveis} total={motos.length} color="bg-success" />
                  <FleetBar label="Manutenção" count={stats.emManutencao} total={motos.length} color="bg-warning" />
                  <FleetBar label="Inativas" count={stats.inativas} total={motos.length} color="bg-muted-foreground" />
                  <FleetBar label="Vendidas" count={stats.vendidas} total={motos.length} color="bg-violet-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
});

const SummaryCard = memo(function SummaryCard({ label, value, icon, color, borderColor, info }: { label: string; value: string; icon: React.ReactNode; color: string; borderColor: string; info?: string; }) {
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center">
            {label}
            {info && <InfoTooltip text={info} />}
          </p>
          <p className={`text-xl font-bold ${color} mt-1`}>{value}</p>
        </div>
        <div className={`${color} opacity-30`}>{icon}</div>
      </CardContent>
    </Card>
  );
});

const MiniKPI = memo(function MiniKPI({ label, value, sub, icon, info }: { label: string; value: string; sub: string; icon: React.ReactNode; info?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          {info && <InfoTooltip text={info} className="ml-0" />}
        </div>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
});

const FleetBar = memo(function FleetBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{count} <span className="text-muted-foreground text-xs">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
});

const HighlightCard = memo(function HighlightCard({
  label, value, unit, delta, deltaSuffix, icon, accent, info,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: number;
  deltaSuffix?: string;
  icon: React.ReactNode;
  accent: "primary" | "success" | "destructive";
  info?: string;
}) {
  const positive = delta >= 0;
  const accentText =
    accent === "success" ? "text-success" :
    accent === "destructive" ? "text-destructive" :
    "text-primary";
  const accentBg =
    accent === "success" ? "bg-success/10" :
    accent === "destructive" ? "bg-destructive/10" :
    "bg-primary/10";
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent === "success" ? "bg-success" : accent === "destructive" ? "bg-destructive" : "bg-primary"}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center font-medium">
              {label}
              {info && <InfoTooltip text={info} />}
            </p>
            <p className={`text-2xl font-bold mt-1 ${accentText}`}>{value}</p>
            {unit && <p className="text-xs text-muted-foreground mt-0.5">{unit}</p>}
          </div>
          <div className={`shrink-0 rounded-lg p-2 ${accentBg} ${accentText}`}>{icon}</div>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5 ${positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {positive ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          {deltaSuffix && <span className="text-[11px] text-muted-foreground">{deltaSuffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
});

// Suppress unused-variable warnings for preserved components
void SummaryCard;
void MiniKPI;
