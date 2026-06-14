import { useState, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import {
  AlertTriangle, ChevronRight, Clock, Droplets, FileText, Wrench, ClipboardList,
  TrendingUp, TrendingDown,
} from "lucide-react";
import { format, isWithinInterval, parseISO, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getOilStatus, loadBrandConfig, loadGlobalConfig } from "@/lib/oil-kpis";

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PERIODS = [
  { label: "Este mês", getFrom: () => startOfMonth(new Date()) },
  { label: "30d", getFrom: () => subDays(new Date(), 30) },
  { label: "60d", getFrom: () => subDays(new Date(), 60) },
  { label: "90d", getFrom: () => subDays(new Date(), 90) },
  { label: "1 ano", getFrom: () => subDays(new Date(), 365) },
];

export const Dashboard = memo(function Dashboard() {
  const { motos, rentals, financial, maintenance, fines } = useDataCacheSnapshot();
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });

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

    const frotaTotal = motos.filter(m => m.status !== "vendida").length;
    const alugadas = motos.filter(m => m.status === "alugada").length;
    const disponiveis = motos.filter(m => m.status === "disponivel").length;
    const revpavd = frotaTotal > 0 ? entradas / (frotaTotal * diasPeriodo) : 0;
    const taxaUtilizacao = frotaTotal > 0 ? (alugadas / frotaTotal) * 100 : 0;

    const contratosAtivos = rentals.filter(r => r.status === "ativa");
    // Ticket médio: só receitas vinculadas a contratos (exclui empréstimos, aportes, etc.)
    const receitasLocacao = receitasPeriodo.filter(e => e.rentalId);
    const entradasLocacao = receitasLocacao.reduce((s, e) => s + e.valor, 0);
    const contratosComReceita = new Set(receitasLocacao.map(e => e.rentalId)).size;
    const ticketMedio = contratosComReceita > 0 ? entradasLocacao / contratosComReceita : 0;

    const despesaOperacional = despesasPeriodo.filter(e => e.natureza === "operacional").reduce((s, e) => s + e.valor, 0);
    const despesaAdministrativa = despesasPeriodo.filter(e => e.natureza === "administrativa").reduce((s, e) => s + e.valor, 0);
    const despesaInvestimento = despesasPeriodo.filter(e => e.natureza === "investimento").reduce((s, e) => s + e.valor, 0);

    const marketingSpend = despesasPeriodo
      .filter(e => (e.categoria || "").startsWith("marketing"))
      .reduce((s, e) => s + e.valor, 0);
    const novosContratos = rentals.filter(r => inRange(r.dataInicio)).length;
    const cac = novosContratos > 0 ? marketingSpend / novosContratos : (contratosAtivos.length > 0 ? marketingSpend / contratosAtivos.length : 0);

    // Duração média das locações que iniciaram no período
    const locacoesPeriodo = rentals.filter(r => inRange(r.dataInicio));
    const duracaoMedia = locacoesPeriodo.length > 0
      ? locacoesPeriodo.reduce((sum, r) => {
          const fim = r.dataFim ? new Date(r.dataFim + "T00:00:00") : new Date();
          const inicio = new Date(r.dataInicio + "T00:00:00");
          return sum + Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 86400000));
        }, 0) / locacoesPeriodo.length
      : 0;

    return {
      entradas, saidas, lucro,
      revpavd, ticketMedio, taxaUtilizacao,
      frotaTotal, alugadas, disponiveis,
      contratosAtivosCount: contratosAtivos.length,
      contratosComReceita,
      entradasLocacao,
      despesaOperacional, despesaAdministrativa, despesaInvestimento,
      marketingSpend, cac, novosContratos,
      duracaoMedia, locacoesPeriodoCount: locacoesPeriodo.length,
    };
  }, [financial, motos, rentals, inRange, diasPeriodo]);

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
    const pct = (cur: number, prev: number) => prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / Math.abs(prev)) * 100;
    return { lucroDelta: pct(stats.lucro, lucroPrev) };
  }, [financial, dateRange, stats.lucro]);

  const motoPerf = useMemo(() => {
    return motos
      .filter(m => m.status !== "vendida")
      .map(moto => {
        const rec = financial
          .filter(e => !e.ignorada && e.tipo === "receita" && e.pago && e.motoId === moto.id && inRange(e.data))
          .reduce((s, e) => s + e.valor, 0);
        const desp = financial
          .filter(e => !e.ignorada && e.tipo === "despesa" && e.pago && e.motoId === moto.id && inRange(e.data))
          .reduce((s, e) => s + e.valor, 0);
        const resultado = rec - desp;
        const margem = rec > 0 ? (resultado / rec) * 100 : 0;
        return { moto, receita: rec, despesa: desp, resultado, margem };
      })
      .filter(p => p.receita > 0 || p.despesa > 0)
      .sort((a, b) => b.receita - a.receita);
  }, [financial, motos, inRange]);

  const weekBounds = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const start = new Date(t); start.setDate(t.getDate() - t.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return { start, end };
  }, []);

  const cobrancasSemana = useMemo(() => {
    const inWeek = (d: string) => {
      try { const dt = new Date(d + "T00:00:00"); return dt >= weekBounds.start && dt <= weekBounds.end; }
      catch { return false; }
    };
    const contratosAtivos = rentals.filter(r => r.status === "ativa").length;
    const weekEntries = financial.filter(e => e.tipo === "receita" && !e.ignorada && e.dataPrevista && inWeek(e.dataPrevista));
    const aluguelsGerados = weekEntries.filter(e => e.categoria === "aluguel").length;
    const naoGeradas = Math.max(0, contratosAtivos - aluguelsGerados);
    const emAberto = weekEntries.filter(e => !e.pago).length;
    const geradas = weekEntries.length;
    const esperadas = geradas + naoGeradas;
    const parcelamentos = weekEntries.filter(e => e.serieId && e.categoria !== "aluguel").length;
    const multas = weekEntries.filter(e => e.categoria === "multa_transito_receita").length;
    const manutencoes = weekEntries.filter(e => e.categoria === "manutencao_receita").length;
    return { esperadas, geradas, emAberto, naoGeradas, contratosAtivos, aluguelsGerados, parcelamentos, multas, manutencoes };
  }, [financial, rentals, weekBounds]);

  const operacional = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const hoje_ts = hoje.getTime();
    const em7d = new Date(hoje); em7d.setDate(hoje.getDate() + 7);
    const em48h = new Date(hoje); em48h.setDate(hoje.getDate() + 2);
    const diffDias = (iso: string) => Math.floor((hoje_ts - new Date(iso + "T00:00:00").getTime()) / 86400000);

    const pendentes = financial.filter(e => !e.ignorada && e.tipo === "receita" && !e.pago && e.dataPrevista);
    const faixa2 = pendentes.filter(e => { const d = diffDias(e.dataPrevista!); return d > 15 && d <= 30; });
    const faixa3 = pendentes.filter(e => diffDias(e.dataPrevista!) > 30);
    const inadTotal =
      pendentes.filter(e => { const d = diffDias(e.dataPrevista!); return d >= 0 && d <= 15; }).reduce((s, e) => s + e.valor, 0) +
      faixa2.reduce((s, e) => s + e.valor, 0) +
      faixa3.reduce((s, e) => s + e.valor, 0);
    const clientesInad = new Set(
      pendentes.filter(e => diffDias(e.dataPrevista!) > 0).map(e => e.clienteId || e.clienteNome).filter(Boolean)
    ).size;

    const multasPend = fines.filter(f => f.status === "pendente");
    const multasHoje = multasPend.filter(f => new Date(f.dataMulta + "T00:00:00") <= hoje);
    const multas48hList = multasPend.filter(f => { const d = new Date(f.dataMulta + "T00:00:00"); return d > hoje && d <= em48h; });
    const multasValor = multasPend.reduce((s, f) => s + f.valor, 0);
    const multas48hValor = [...multasHoje, ...multas48hList].reduce((s, f) => s + f.valor, 0);

    const manPend = maintenance.filter(m => m.status === "agendada" || m.status === "em_andamento");
    const manParadas = manPend.filter(m =>
      Math.floor((hoje_ts - new Date(m.data + "T00:00:00").getTime()) / 86400000) > 5
    );

    const brandCfg = loadBrandConfig();
    const globalCfg = loadGlobalConfig();
    const motosOp = motos.filter(m => m.status === "alugada" || m.status === "disponivel");
    let oilVencidas = 0;
    let oilAtencao = 0;
    for (const m of motosOp) {
      const sit = getOilStatus(m, brandCfg, globalCfg, rentals).situation;
      if (sit === "vencida") oilVencidas++;
      else if (sit === "atencao") oilAtencao++;
    }

    const motosDisp = motos.filter(m => m.status === "disponivel");
    const ociosaDias = motosDisp.map(moto => {
      const fins = rentals.filter(r => r.motoId === moto.id && r.status === "finalizada" && r.dataFim);
      if (fins.length === 0) return 999;
      const ultiTs = fins.reduce((max, r) => Math.max(max, new Date(r.dataFim! + "T00:00:00").getTime()), 0);
      return Math.floor((hoje_ts - ultiTs) / 86400000);
    });
    const ociosas7 = ociosaDias.filter(d => d >= 7).length;
    const ociosas15 = ociosaDias.filter(d => d >= 15).length;

    const contratosAtivos = rentals.filter(r => r.status === "ativa");
    const vencidos = contratosAtivos.filter(r =>
      r.dataFimContrato && new Date(r.dataFimContrato + "T00:00:00") < hoje
    ).length;
    const renovar = contratosAtivos.filter(r => {
      if (!r.dataFimContrato) return false;
      const d = new Date(r.dataFimContrato + "T00:00:00");
      return d >= hoje && d <= em7d;
    }).length;

    return {
      inad: {
        total: inadTotal, clientes: clientesInad,
        acima30: faixa3.length, entre16e30: faixa2.length,
        faixa3val: faixa3.reduce((s, e) => s + e.valor, 0),
        faixa2val: faixa2.reduce((s, e) => s + e.valor, 0),
      },
      multas: { valor: multasValor, count: multasPend.length, hojeCount: multasHoje.length, valor48h: multas48hValor },
      oil: { vencidas: oilVencidas, atencao: oilAtencao, total: motosOp.length },
      man: { pendentes: manPend.length, paradas: manParadas.length },
      ociosas: { ociosas7, ociosas15, total: motosDisp.length },
      contratos: { ativos: contratosAtivos.length, vencidos, renovar },
    };
  }, [financial, fines, maintenance, motos, rentals]);

  const margemAtual = stats.entradas > 0 ? (stats.lucro / stats.entradas) * 100 : 0;
  const totalNatureza = stats.despesaOperacional + stats.despesaAdministrativa + stats.despesaInvestimento;

  const inadGravity: "danger" | "warn" | "ok" = operacional.inad.faixa3val > 0 ? "danger" : operacional.inad.faixa2val > 0 ? "warn" : "ok";
  const multasGravity: "danger" | "warn" | "ok" = operacional.multas.hojeCount > 0 ? "danger" : operacional.multas.valor48h > 0 ? "warn" : "ok";
  const oilGravity: "danger" | "warn" | "ok" = operacional.oil.vencidas > 0 ? "danger" : operacional.oil.atencao > 0 ? "warn" : "ok";
  const manGravity: "danger" | "warn" | "ok" = operacional.man.paradas > 0 ? "danger" : operacional.man.pendentes > 0 ? "warn" : "ok";
  const ociosaGravity: "danger" | "warn" | "ok" = operacional.ociosas.ociosas15 > 0 ? "danger" : operacional.ociosas.ociosas7 > 0 ? "warn" : "ok";
  const contratoGravity: "danger" | "warn" | "ok" = operacional.contratos.vencidos > 0 ? "danger" : operacional.contratos.renovar > 0 ? "warn" : "ok";

  const isPositive = stats.lucro >= 0;
  const deltaPositive = growth.lucroDelta >= 0;

  return (
    <div className="p-6 space-y-4 bg-slate-50 min-h-screen">

      {/* TOPBAR */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Visão Geral</span>
        <div className="flex items-center gap-0.5 bg-white border border-border rounded-xl p-1 shadow-sm">
          {PERIODS.map(p => {
            const pFrom = p.getFrom();
            const isActive = dateRange.from.toDateString() === pFrom.toDateString();
            return (
              <button
                key={p.label}
                onClick={() => setDateRange({ from: pFrom, to: new Date() })}
                className={`px-3.5 py-1.5 text-xs rounded-lg transition-all font-semibold ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* HERO FINANCEIRO */}
      <div
        className="rounded-2xl border border-border shadow-sm overflow-hidden relative"
        style={{
          background: isPositive
            ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 55%)"
            : "linear-gradient(135deg, #fef2f2 0%, #ffffff 55%)",
        }}
      >
        {/* Barra vertical de acento */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
          style={{ background: isPositive ? "#00C86A" : "#ef4444" }}
        />
        <div className="p-6 pl-8">
          <div className="flex items-start justify-between gap-6">

            {/* Esquerda: número principal */}
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Resultado Líquido</p>
              <p
                className="text-6xl font-bold tracking-tight leading-none font-mono"
                style={{ color: isPositive ? "#00C86A" : "#ef4444" }}
              >
                {fmt(stats.lucro)}
              </p>
              <div className="flex items-center gap-2.5 pt-2">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-black font-mono ${
                  margemAtual < 0
                    ? "bg-red-100 text-red-700"
                    : margemAtual < 15
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-green-100 text-green-700"
                }`}>
                  {margemAtual.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-400">margem líquida</span>
              </div>
            </div>

            {/* Direita: delta + breakdown */}
            <div className="shrink-0 flex flex-col items-end gap-3">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${
                deltaPositive
                  ? "bg-green-500/10 text-green-700 border-green-200"
                  : "bg-red-500/10 text-red-700 border-red-200"
              }`}>
                {deltaPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {deltaPositive ? "+" : ""}{growth.lucroDelta.toFixed(1)}% vs anterior
              </div>

              <div className="bg-white border border-border rounded-xl p-4 space-y-2.5 w-64 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs text-muted-foreground">Receitas</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-green-600 tabular-nums">+ {fmt(stats.entradas)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-xs text-muted-foreground">Despesas</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500 tabular-nums">− {fmt(stats.saidas)}</span>
                </div>
                <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Resultado</span>
                  <span className={`text-sm font-mono font-black tabular-nums ${isPositive ? "text-green-600" : "text-destructive"}`}>
                    {fmt(stats.lucro)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-400 rounded-full transition-all"
                    style={{ width: `${stats.entradas > 0 ? Math.min(100, (stats.saidas / stats.entradas) * 100) : 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Todas as entradas e saídas pagas no período
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MÉTRICAS SECUNDÁRIAS */}
      <div className="grid grid-cols-3 gap-4">

        {/* RevPAVD */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="h-[3px]" style={{ background: "#00C86A" }} />
          <div className="p-5 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">RevPAVD</p>
            <div>
              <p className="text-3xl font-bold tracking-tight tabular-nums font-mono text-slate-900">{fmt(stats.revpavd)}</p>
              <p className="text-xs text-muted-foreground mt-1">receita por moto por dia</p>
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Receita total</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{fmt(stats.entradas)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">÷ frota × dias</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{stats.frotaTotal} motos × {diasPeriodo}d</span>
              </div>
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Ocupação da frota</span>
                  <span className={`text-[11px] font-bold ${
                    stats.taxaUtilizacao >= 80 ? "text-green-600" :
                    stats.taxaUtilizacao >= 60 ? "text-yellow-600" : "text-red-500"
                  }`}>{stats.taxaUtilizacao.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      stats.taxaUtilizacao >= 80 ? "bg-green-500" :
                      stats.taxaUtilizacao >= 60 ? "bg-yellow-400" : "bg-red-400"
                    }`}
                    style={{ width: `${stats.taxaUtilizacao}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">Motos ociosas penalizam o indicador</p>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket Médio */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="h-[3px] bg-indigo-500" />
          <div className="p-5 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Ticket Médio</p>
            <div>
              <p className="text-3xl font-bold tracking-tight tabular-nums font-mono text-slate-900">{fmt(stats.ticketMedio)}</p>
              <p className="text-xs text-muted-foreground mt-1">receita média por contrato</p>
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Receita de locações</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{fmt(stats.entradasLocacao)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">÷ contratos únicos</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{stats.contratosComReceita}</span>
              </div>
              <p className="text-[10px] text-slate-400 pt-1">
                Exclui receitas sem contrato (empréstimos, aportes)
              </p>
            </div>
          </div>
        </div>

        {/* Frota & Locações */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="h-[3px] bg-violet-500" />
          <div className="p-5 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Frota & Locações</p>
            {/* Dois números principais lado a lado */}
            <div className="grid grid-cols-2 gap-0 divide-x divide-slate-100">
              <div className="pr-4">
                <p className="text-3xl font-bold tracking-tight tabular-nums font-mono text-slate-900">{stats.frotaTotal}</p>
                <p className="text-xs text-muted-foreground mt-1">motos em operação</p>
              </div>
              <div className="pl-4">
                <p className="text-3xl font-bold tracking-tight tabular-nums font-mono text-violet-600">
                  {Math.round(stats.duracaoMedia)}<span className="text-xl">d</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">duração média</p>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Alugadas agora</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{stats.alugadas} de {stats.frotaTotal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Locações no período</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{stats.locacoesPeriodoCount}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* MARKETING + DESPESAS */}
      <div className="grid grid-cols-5 gap-4">

        {/* Marketing */}
        <div className="col-span-2 bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="h-[3px] bg-rose-500" />
          <div className="p-5 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Marketing</p>
            {/* CAC como métrica principal */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">CAC — Custo por contrato</p>
              <p className="text-3xl font-bold tabular-nums font-mono text-slate-900">{fmt(stats.cac)}</p>
              <p className="text-xs text-slate-400 mt-1">
                {stats.novosContratos > 0
                  ? `${stats.novosContratos} novos contratos no período`
                  : "calculado sobre contratos ativos"}
              </p>
            </div>
            {/* Gasto como secundário */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Gasto com marketing</span>
              <span className="text-[11px] font-mono font-bold text-slate-600 tabular-nums">{fmt(stats.marketingSpend)}</span>
            </div>
          </div>
        </div>

        {/* Composição das Despesas */}
        <div className="col-span-3 bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="h-[3px] bg-slate-400" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Composição das Despesas</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums font-mono">{fmt(stats.saidas)}</p>
            </div>
            {totalNatureza === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                Nenhuma despesa classificada por natureza.
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "Operacional", value: stats.despesaOperacional, bar: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-100" },
                  { label: "Administrativo", value: stats.despesaAdministrativa, bar: "bg-violet-500", badge: "bg-violet-50 text-violet-700 border-violet-100" },
                  { label: "Investimento", value: stats.despesaInvestimento, bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-100" },
                ].map(({ label, value, bar, badge }) => {
                  const pct = totalNatureza > 0 ? (value / totalNatureza) * 100 : 0;
                  return (
                    <div key={label} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${bar}`} />
                          <span className="text-sm text-slate-700 font-medium">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 tabular-nums font-mono">{fmt(value)}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* COBRANÇAS DA SEMANA */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="h-[3px] bg-cyan-500" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Cobranças da Semana</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {format(weekBounds.start, "dd/MM", { locale: ptBR })} a {format(weekBounds.end, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <button
              onClick={() => navigate("/cobrancas/semana")}
              className="text-xs text-primary hover:underline font-semibold"
            >
              Ver todas →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black tabular-nums font-mono text-green-600">{cobrancasSemana.geradas}</p>
              <p className="text-[11px] text-green-600/70 mt-1 font-semibold uppercase tracking-wider">geradas</p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${
              cobrancasSemana.emAberto > 0 ? "bg-yellow-50 border-yellow-100" : "bg-slate-50 border-slate-100"
            }`}>
              <p className={`text-3xl font-black tabular-nums font-mono ${cobrancasSemana.emAberto > 0 ? "text-yellow-600" : "text-slate-300"}`}>
                {cobrancasSemana.emAberto}
              </p>
              <p className={`text-[11px] mt-1 font-semibold uppercase tracking-wider ${cobrancasSemana.emAberto > 0 ? "text-yellow-600/70" : "text-slate-400"}`}>
                em aberto
              </p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${
              cobrancasSemana.naoGeradas > 0 ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
            }`}>
              <p className={`text-3xl font-black tabular-nums font-mono ${cobrancasSemana.naoGeradas > 0 ? "text-red-600" : "text-green-600"}`}>
                {cobrancasSemana.naoGeradas > 0 ? cobrancasSemana.naoGeradas : "✓"}
              </p>
              <p className={`text-[11px] mt-1 font-semibold uppercase tracking-wider ${cobrancasSemana.naoGeradas > 0 ? "text-red-600/70" : "text-green-600/70"}`}>
                {cobrancasSemana.naoGeradas > 0 ? "não geradas" : "tudo gerado"}
              </p>
            </div>
          </div>

          {cobrancasSemana.esperadas > 0 && (
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex gap-px">
              <div className="h-full bg-green-500 rounded-l-full transition-all duration-700"
                style={{ width: `${((cobrancasSemana.geradas - cobrancasSemana.emAberto) / cobrancasSemana.esperadas) * 100}%` }} />
              <div className="h-full bg-yellow-400 transition-all duration-700"
                style={{ width: `${(cobrancasSemana.emAberto / cobrancasSemana.esperadas) * 100}%` }} />
              <div className="h-full bg-red-500 rounded-r-full transition-all duration-700"
                style={{ width: `${(cobrancasSemana.naoGeradas / cobrancasSemana.esperadas) * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* PERFORMANCE POR MOTO */}
      {motoPerf.length > 0 && (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="h-[3px] bg-orange-500" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Performance por Moto</p>
                <p className="text-xs text-slate-400 mt-0.5">Receita, despesa e margem por ativo no período</p>
              </div>
              <button onClick={() => navigate("/motos")} className="text-xs text-primary hover:underline font-semibold">
                Ver frota →
              </button>
            </div>

            <div className="grid grid-cols-[1fr_96px_64px] gap-3 px-2 pb-2 border-b border-slate-100">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Moto</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold text-right">Receita</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold text-center">Margem</span>
            </div>

            <div className="divide-y divide-slate-50">
              {motoPerf.map(({ moto, receita, resultado, margem }, i) => {
                const maxReceita = motoPerf[0].receita;
                const pct = maxReceita > 0 ? (receita / maxReceita) * 100 : 0;
                const margemBadge = margem >= 30
                  ? "bg-green-50 text-green-700 border border-green-100"
                  : margem >= 10
                  ? "bg-yellow-50 text-yellow-700 border border-yellow-100"
                  : "bg-red-50 text-red-700 border border-red-100";
                return (
                  <div
                    key={moto.id}
                    className={`grid grid-cols-[1fr_96px_64px] gap-3 items-center px-2 py-3 hover:bg-slate-50 transition-colors rounded-lg ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-bold text-slate-800">{moto.placa}</span>
                        <span className="text-xs text-slate-400 truncate">{moto.modelo}</span>
                        {resultado < 0 && (
                          <span className="text-[10px] font-bold text-red-500 shrink-0">{fmt(resultado)}</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${resultado >= 0 ? "bg-orange-400" : "bg-red-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-800 text-right tabular-nums">{fmt(receita)}</span>
                    <div className="flex justify-center">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${margemBadge}`}>
                        {margem.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* OPERACIONAL */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="h-[3px] bg-slate-300" />
        <div className="p-5 pb-3">
        <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-4">Operacional</p>
        <div className="space-y-1.5">

          <OperacionalRow
            gravity={inadGravity}
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Inadimplência"
            detail={`${operacional.inad.clientes} cliente${operacional.inad.clientes !== 1 ? "s" : ""} com saldo vencido`}
            tags={[
              operacional.inad.acima30 > 0 ? { label: `${operacional.inad.acima30} +30d`, color: "text-destructive bg-red-50" } : null,
              operacional.inad.entre16e30 > 0 ? { label: `${operacional.inad.entre16e30} 16–30d`, color: "text-yellow-700 bg-yellow-50" } : null,
            ].filter(Boolean) as Tag[]}
            value={fmt(operacional.inad.total)}
            valueColor={inadGravity === "ok" ? "text-green-600" : inadGravity === "warn" ? "text-yellow-600" : "text-destructive"}
            onClick={() => navigate("/financeiro")}
          />

          <OperacionalRow
            gravity={multasGravity}
            icon={<FileText className="h-4 w-4" />}
            title="Multas de Trânsito"
            detail={`${operacional.multas.count} pendente${operacional.multas.count !== 1 ? "s" : ""}${operacional.multas.hojeCount > 0 ? ` · ${operacional.multas.hojeCount} vencem hoje` : ""}`}
            tags={operacional.multas.valor48h > 0 ? [{ label: `${fmt(operacional.multas.valor48h)} em 48h`, color: "text-yellow-700 bg-yellow-50" }] : []}
            value={fmt(operacional.multas.valor)}
            valueColor={multasGravity === "ok" ? "text-green-600" : multasGravity === "warn" ? "text-yellow-600" : "text-destructive"}
            onClick={() => navigate("/multas")}
          />

          <OperacionalRow
            gravity={oilGravity}
            icon={<Droplets className="h-4 w-4" />}
            title="Troca de Óleo"
            detail={`${operacional.oil.total} moto${operacional.oil.total !== 1 ? "s" : ""} operacionais`}
            tags={[
              operacional.oil.vencidas > 0 ? { label: `${operacional.oil.vencidas} vencida${operacional.oil.vencidas !== 1 ? "s" : ""}`, color: "text-destructive bg-red-50" } : null,
              operacional.oil.atencao > 0 ? { label: `${operacional.oil.atencao} próxima${operacional.oil.atencao !== 1 ? "s" : ""}`, color: "text-yellow-700 bg-yellow-50" } : null,
            ].filter(Boolean) as Tag[]}
            value={String(operacional.oil.vencidas + operacional.oil.atencao)}
            valueColor={oilGravity === "ok" ? "text-green-600" : oilGravity === "warn" ? "text-yellow-600" : "text-destructive"}
            onClick={() => navigate("/troca-oleo")}
          />

          <OperacionalRow
            gravity={manGravity}
            icon={<Wrench className="h-4 w-4" />}
            title="Manutenções"
            detail={`${operacional.man.pendentes} em andamento ou agendada${operacional.man.pendentes !== 1 ? "s" : ""}`}
            tags={operacional.man.paradas > 0 ? [{ label: `${operacional.man.paradas} parada${operacional.man.paradas !== 1 ? "s" : ""} +5d`, color: "text-destructive bg-red-50" }] : []}
            value={String(operacional.man.pendentes)}
            valueColor={manGravity === "ok" ? "text-green-600" : manGravity === "warn" ? "text-yellow-600" : "text-destructive"}
            onClick={() => navigate("/manutencoes")}
          />

          <OperacionalRow
            gravity={ociosaGravity}
            icon={<Clock className="h-4 w-4" />}
            title="Motos Ociosas"
            detail={`${operacional.ociosas.total} disponíve${operacional.ociosas.total !== 1 ? "is" : "l"}`}
            tags={[
              operacional.ociosas.ociosas15 > 0 ? { label: `${operacional.ociosas.ociosas15} +15d`, color: "text-destructive bg-red-50" } : null,
              (operacional.ociosas.ociosas7 - operacional.ociosas.ociosas15) > 0
                ? { label: `${operacional.ociosas.ociosas7 - operacional.ociosas.ociosas15} 7–15d`, color: "text-yellow-700 bg-yellow-50" }
                : null,
            ].filter(Boolean) as Tag[]}
            value={String(operacional.ociosas.ociosas7)}
            valueColor={ociosaGravity === "ok" ? "text-green-600" : ociosaGravity === "warn" ? "text-yellow-600" : "text-destructive"}
            onClick={() => navigate("/motos")}
          />

          <OperacionalRow
            gravity={contratoGravity}
            icon={<ClipboardList className="h-4 w-4" />}
            title="Contratos"
            detail={`${operacional.contratos.ativos} ativo${operacional.contratos.ativos !== 1 ? "s" : ""} · ${operacional.contratos.renovar} vencem em 7 dias`}
            tags={[
              operacional.contratos.vencidos > 0 ? { label: `${operacional.contratos.vencidos} vencido${operacional.contratos.vencidos !== 1 ? "s" : ""}`, color: "text-destructive bg-red-50" } : null,
              operacional.contratos.renovar > 0 ? { label: `${operacional.contratos.renovar} renovar`, color: "text-yellow-700 bg-yellow-50" } : null,
            ].filter(Boolean) as Tag[]}
            value={String(operacional.contratos.ativos)}
            valueColor="text-green-600"
            onClick={() => navigate("/locacoes")}
          />

        </div>
        </div>
      </div>

    </div>
  );
});

type Tag = { label: string; color: string };

interface OperacionalRowProps {
  gravity: "danger" | "warn" | "ok";
  icon: React.ReactNode;
  title: string;
  detail: string;
  tags: Tag[];
  value: string;
  valueColor: string;
  onClick: () => void;
}

const OperacionalRow = memo(function OperacionalRow({
  gravity, icon, title, detail, tags, value, valueColor, onClick,
}: OperacionalRowProps) {
  const styles = {
    danger: { border: "border-l-[3px] border-red-500", bg: "bg-red-50/50 hover:bg-red-50", icon: "text-red-500" },
    warn:   { border: "border-l-[3px] border-yellow-400", bg: "bg-yellow-50/40 hover:bg-yellow-50", icon: "text-yellow-500" },
    ok:     { border: "border-l-[3px] border-green-500", bg: "bg-green-50/20 hover:bg-green-50/40", icon: "text-green-500" },
  }[gravity];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === "Enter" && onClick()}
      className={`${styles.border} ${styles.bg} rounded-r-xl pl-4 pr-3 py-3 cursor-pointer flex items-center justify-between gap-4 transition-colors`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 ${styles.icon}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 leading-tight">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          {tags.length > 0 && (
            <div className="flex gap-1 justify-end mb-1.5 flex-wrap">
              {tags.map(t => (
                <span key={t.label} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.color}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
          <p className={`text-lg font-black font-mono ${valueColor}`}>{value}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
    </div>
  );
});
