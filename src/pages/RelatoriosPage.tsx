import { Fragment, useState, useMemo, useCallback } from "react";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/InfoTooltip";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DEFAULT_CATEGORIAS } from "@/lib/financeiro-constants";
import { classifyPlano } from "@/lib/rental-plano";

const planoLabel: Record<string, string> = { aluguel: "Só Aluguel", moto_no_final: "Moto no Final" };

// "quinzenal"/"mensal" convertidos pra base semanal usando os mesmos dias de
// período já usados em LocacoesPage.tsx (15/30) pra manter os números consistentes
// entre as telas.
function periodDaysOf(freq: string): number {
  if (freq === "quinzenal") return 15;
  if (freq === "mensal") return 30;
  return 7;
}
function weeklyValueOf(valorDiario: number, freq: string): number {
  return (valorDiario * 7) / periodDaysOf(freq);
}
function formatDuracao(dias: number): string {
  const semanas = dias / 7;
  if (semanas >= 8) return `${(dias / 30).toFixed(1)} meses`;
  return `${semanas.toFixed(1)} semanas`;
}
function motoModeloAno(m: { modelo: string; anoFabricacao?: number | null; anoModelo?: number | null }): string {
  if (m.anoFabricacao && m.anoModelo) return `${m.modelo} ${m.anoFabricacao}/${m.anoModelo}`;
  if (m.anoModelo) return `${m.modelo} ${m.anoModelo}`;
  return m.modelo;
}

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

  // ─── PREÇO SEMANAL POR MOTO ─────────────────────────────────────────────────
  const [expandedPreco, setExpandedPreco] = useState<Set<string>>(new Set());
  const togglePreco = (id: string) => setExpandedPreco(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const precoSemanalReport = useMemo(() => {
    return motos.map(moto => {
      const contratos = rentals
        .filter(r => r.motoId === moto.id && r.status !== "cancelada")
        .map(r => {
          const inicio = new Date(r.dataInicio + "T00:00:00");
          const fim = r.dataFim ? new Date(r.dataFim + "T00:00:00") : dateRange.to;
          const overlapStart = new Date(Math.max(inicio.getTime(), dateRange.from.getTime()));
          const overlapEnd = new Date(Math.min(fim.getTime(), dateRange.to.getTime()));
          const overlapDays = Math.max(0, Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000));
          const valorSemanal = weeklyValueOf(r.valorDiario, r.frequenciaPagamento);
          const cliente = clients.find(c => c.id === r.clienteId);
          // Duração do contrato inteiro (não limitada ao período selecionado) — contratos
          // ainda ativos contam até hoje, já que continuam rodando.
          const duracaoFim = r.dataFim ? new Date(r.dataFim + "T00:00:00") : new Date();
          const duracaoDias = Math.max(0, Math.floor((duracaoFim.getTime() - inicio.getTime()) / 86400000));
          return {
            rental: r,
            clienteNome: cliente?.nome || r.vendedor || "—",
            plano: r.plano,
            valorSemanal,
            overlapDays,
            duracaoDias,
          };
        })
        .sort((a, b) => a.rental.dataInicio.localeCompare(b.rental.dataInicio));

      const noPeriodo = contratos.filter(c => c.overlapDays > 0);
      const totalDias = noPeriodo.reduce((s, c) => s + c.overlapDays, 0);
      const mediaGeral = totalDias > 0
        ? noPeriodo.reduce((s, c) => s + c.valorSemanal * c.overlapDays, 0) / totalDias
        : null;
      const mediaPorPlano = (categoria: "aluguel" | "moto_no_final") => {
        const doPlano = noPeriodo.filter(c => classifyPlano(c.plano) === categoria);
        const dias = doPlano.reduce((s, c) => s + c.overlapDays, 0);
        return dias > 0 ? doPlano.reduce((s, c) => s + c.valorSemanal * c.overlapDays, 0) / dias : null;
      };
      const duracaoMedia = (list: typeof noPeriodo) =>
        list.length > 0 ? list.reduce((s, c) => s + c.duracaoDias, 0) / list.length : null;
      // Qualquer contrato cujo plano não deu pra classificar como aluguel nem moto no
      // final (ex: um contrato customizado com nome bem diferente) — sem isso ele
      // contaria em Média Geral mas desapareceria das outras colunas, como se nunca
      // tivesse existido.
      const outrosNoPeriodo = noPeriodo.filter(c => classifyPlano(c.plano) === "outro");
      const diasOutros = outrosNoPeriodo.reduce((s, c) => s + c.overlapDays, 0);
      const mediaOutros = diasOutros > 0
        ? outrosNoPeriodo.reduce((s, c) => s + c.valorSemanal * c.overlapDays, 0) / diasOutros
        : null;
      const outrosNomes = [...new Set(outrosNoPeriodo.map(c => c.plano || "(sem plano)"))];

      return {
        moto,
        contratos,
        contratosNoPeriodo: noPeriodo.length,
        totalDias,
        mediaGeral,
        mediaAluguel: mediaPorPlano("aluguel"),
        mediaMotoNoFinal: mediaPorPlano("moto_no_final"),
        mediaOutros,
        outrosNomes,
        duracaoMediaDias: duracaoMedia(noPeriodo),
      };
    })
    .filter(r => r.totalDias > 0)
    .sort((a, b) => (b.mediaGeral ?? 0) - (a.mediaGeral ?? 0));
  }, [motos, rentals, clients, dateRange]);

  // Resumo geral do período: maior/menor preço semanal cobrado (dentre os contratos
  // com alguma sobreposição no período) e médias ponderadas por dias, cruzando todas
  // as motos — igual às médias por moto, só que agregadas.
  const precoSemanalResumo = useMemo(() => {
    const all = precoSemanalReport.flatMap(r =>
      r.contratos.filter(c => c.overlapDays > 0).map(c => ({ ...c, moto: r.moto }))
    );
    if (all.length === 0) return null;
    const weighted = (list: typeof all) => {
      const dias = list.reduce((s, c) => s + c.overlapDays, 0);
      return dias > 0 ? list.reduce((s, c) => s + c.valorSemanal * c.overlapDays, 0) / dias : null;
    };
    const maxMin = (list: typeof all) => list.length === 0 ? { max: null, min: null } : {
      max: list.reduce((a, b) => (b.valorSemanal > a.valorSemanal ? b : a)),
      min: list.reduce((a, b) => (b.valorSemanal < a.valorSemanal ? b : a)),
    };
    const doAluguel = all.filter(c => classifyPlano(c.plano) === "aluguel");
    const doMotoNoFinal = all.filter(c => classifyPlano(c.plano) === "moto_no_final");
    const doOutros = all.filter(c => classifyPlano(c.plano) === "outro");
    const outrosNomes = [...new Set(doOutros.map(c => c.plano || "(sem plano)"))];
    // Duração média do contrato (dias corridos do início ao fim, ou até hoje se ainda
    // ativo) — média simples entre contratos, sem ponderar por dias no período, já que
    // aqui o que importa é "quanto tempo dura um contrato", não o peso dele no preço.
    const duracaoMedia = (list: typeof all) =>
      list.length > 0 ? list.reduce((s, c) => s + c.duracaoDias, 0) / list.length : null;
    return {
      geral: { media: weighted(all), duracaoDias: duracaoMedia(all), ...maxMin(all) },
      aluguel: { media: weighted(doAluguel), duracaoDias: duracaoMedia(doAluguel), ...maxMin(doAluguel) },
      motoNoFinal: { media: weighted(doMotoNoFinal), duracaoDias: duracaoMedia(doMotoNoFinal), ...maxMin(doMotoNoFinal) },
      outros: { media: weighted(doOutros), duracaoDias: duracaoMedia(doOutros), ...maxMin(doOutros), nomes: outrosNomes },
    };
  }, [precoSemanalReport]);

  const hasOutrosPlanos = precoSemanalReport.some(r => r.mediaOutros != null);

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
          <TabsTrigger value="preco-semanal" className="text-xs">Preço Semanal</TabsTrigger>
        </TabsList>

        {/* ══════ DRE ══════════════════════════════════════════════════════════ */}
        <TabsContent value="dre" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-4">
                Demonstrativo de Resultado · {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} a {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
              </p>

              {/* RECEITAS */}
              <DreBlock
                label="Receita Bruta Operacional" value={dre.receitaBruta} sign="+"
                tip="Soma de todas as receitas já recebidas (pagas), com data de pagamento dentro do período selecionado."
              />
              {Object.entries(dre.receitaByCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} />)}

              <DreLineTotal label="= Receita Bruta" value={dre.receitaBruta} />

              {/* CUSTOS OPERACIONAIS */}
              {dre.totalCustosOp > 0 && (
                <>
                  <div className="mt-4" />
                  <DreBlock
                    label="(−) Custos Operacionais Diretos" value={dre.totalCustosOp} sign="−"
                    tip="Despesas ligadas direto à operação da frota: manutenção, lava-jato, rastreador, seguro e multa de trânsito."
                  />
                  {Object.entries(dre.custosByCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} negative />)}
                </>
              )}

              <DreLineResult
                label="= Lucro Bruto" value={dre.lucroBruto} margem={dre.margemBruta}
                tip="Receita Bruta menos Custos Operacionais Diretos."
              />

              {/* DESPESAS ADMINISTRATIVAS */}
              {dre.totalDespAdmin > 0 && (
                <>
                  <div className="mt-2" />
                  <DreBlock
                    label="(−) Despesas Administrativas" value={dre.totalDespAdmin} sign="−"
                    tip="Despesas do período que não são custo direto de operação nem investimento (ex.: despesas administrativas, taxas, tarifas)."
                  />
                  {Object.entries(dre.despAdminByCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} negative />)}
                </>
              )}

              <DreLineResult
                label="= EBITDA" value={dre.ebitda} margem={dre.margemEbitda} highlight
                tip="Lucro Bruto menos Despesas Administrativas — resultado operacional do período, antes de investimentos."
              />

              {/* CAPEX */}
              {dre.totalCapex > 0 && (
                <>
                  <div className="mt-2" />
                  <DreBlock
                    label="(−) Investimentos / Capex" value={dre.totalCapex} sign="−"
                    tip="Compra de motos no período — capital investido na frota, não é despesa operacional."
                  />
                  {Object.entries(dre.capexByCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => <DreRow key={cat} label={catLabel(cat)} value={val} negative />)}
                  <DreLineResult
                    label="= Resultado do Período" value={dre.resultado} margem={dre.margemLiquida} highlight
                    tip="EBITDA menos Investimentos/Capex — resultado final do período."
                  />
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
                    {[
                      { h: "Moto" },
                      { h: "Utilização", tip: "% dos dias do período em que a moto esteve alugada (dias locada ÷ dias do período desde a compra)." },
                      { h: "Locada", tip: "Quantidade de dias, dentro do período, em que a moto esteve com contrato ativo." },
                      { h: "Ociosa", tip: "Dias do período em que a moto não estava alugada nem em manutenção." },
                      { h: "Manut.", tip: "Dias do período em que a moto ficou em manutenção (com data de conclusão registrada)." },
                      { h: "Receita", tip: "Soma das receitas já pagas, vinculadas a essa moto, com data de pagamento dentro do período." },
                      { h: "Custos", tip: "Soma das despesas já pagas, vinculadas a essa moto, com data de pagamento dentro do período." },
                      { h: "EBITDA", tip: "Receita menos custos do período (resultado operacional dessa moto, antes de depreciação)." },
                      { h: "Margem", tip: "EBITDA dividido pela receita do período, em %." },
                    ].map(({ h, tip }) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        {h}{tip && <InfoTooltip text={tip} />}
                      </th>
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
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Receita <InfoTooltip text="Soma de tudo que esse cliente pagou (receitas já recebidas) com data de pagamento dentro do período." />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      % do total <InfoTooltip text="Participação da receita desse cliente sobre a receita total de todos os clientes no período." />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Contratos <InfoTooltip text="Número de locações (contratos) distintos desse cliente com alguma cobrança paga no período." />
                    </th>
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
          <p className="text-xs text-muted-foreground mb-3">
            Esta aba mostra a situação de hoje ({format(new Date(), "dd/MM/yy", { locale: ptBR })}) — cobranças vencidas e
            ainda não pagas, agrupadas por quantos dias já passaram do vencimento. Não usa o período selecionado acima.
          </p>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cliente</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      0 – 15 dias <InfoTooltip text="Valor em aberto vencido há até 15 dias contados de hoje." />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      16 – 30 dias <InfoTooltip text="Valor em aberto vencido entre 16 e 30 dias contados de hoje." />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      + 30 dias <InfoTooltip text="Valor em aberto vencido há mais de 30 dias contados de hoje." />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Total <InfoTooltip text="Soma de tudo que esse cliente deve, vencido e ainda não pago, em qualquer faixa de atraso." />
                    </th>
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

        {/* ══════ PREÇO SEMANAL ════════════════════════════════════════════════ */}
        <TabsContent value="preco-semanal" className="mt-6">
          <p className="text-xs text-muted-foreground mb-3">
            Preço médio semanal cobrado de cada moto no período selecionado, considerando só os dias em que ela esteve
            realmente alugada (contratos parados não entram na média). Clique numa moto para ver o histórico de contratos.
          </p>

          {precoSemanalResumo && precoSemanalResumo.outros.media != null && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <strong>Atenção:</strong> existem contratos com plano diferente de "Só Aluguel"/"Moto no Final" no período
              ({precoSemanalResumo.outros.nomes.join(", ")}) — eles entram na Média Geral e no card "Outros Planos" abaixo,
              mas não nas colunas Só Aluguel / Moto no Final. Isso costuma acontecer quando a locação foi criada com um
              contrato customizado (tela Contratos) em vez do plano padrão.
            </div>
          )}

          {precoSemanalResumo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {([
                {
                  key: "geral", label: "Média Geral", data: precoSemanalResumo.geral, tone: "text-primary",
                  tip: "Média do preço semanal de todos os contratos (Só Aluguel + Moto no Final + Outros) de todas as motos, no período selecionado, ponderada pelos dias de cada contrato.",
                },
                {
                  key: "aluguel", label: "Só Aluguel", data: precoSemanalResumo.aluguel, tone: "text-foreground",
                  tip: "Média do preço semanal só dos contratos \"Só Aluguel\" de todas as motos, no período selecionado, ponderada pelos dias de cada contrato.",
                },
                {
                  key: "motoNoFinal", label: "Moto no Final", data: precoSemanalResumo.motoNoFinal, tone: "text-foreground",
                  tip: "Média do preço semanal só dos contratos \"Moto no Final\" de todas as motos, no período selecionado, ponderada pelos dias de cada contrato.",
                },
                ...(precoSemanalResumo.outros.media != null ? [{
                  key: "outros", label: "Outros Planos", data: precoSemanalResumo.outros, tone: "text-foreground",
                  tip: `Contratos com plano diferente de "Só Aluguel"/"Moto no Final": ${precoSemanalResumo.outros.nomes.join(", ")}.`,
                }] : []),
              ]).map(({ key, label, data, tone, tip }) => (
                <Card key={key} className="p-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Média {label} <InfoTooltip text={tip} /></p>
                    <p className={`text-2xl font-bold ${tone}`}>{data.media != null ? `${fmt(data.media)}/sem` : "—"}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
                    <span className="font-medium text-muted-foreground">
                      Duração média <InfoTooltip text={`Duração média dos contratos de "${label}" com sobreposição no período — do início ao fim (ou até hoje, se ainda ativo). Média simples entre os contratos, não ponderada por dias.`} />
                    </span>
                    <span className="font-semibold text-foreground">{data.duracaoDias != null ? formatDuracao(data.duracaoDias) : "—"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Maior <InfoTooltip text={`Maior preço semanal cobrado dentre os contratos de "${label}" com sobreposição no período.`} />
                      </p>
                      <p className="text-sm font-semibold text-foreground">{data.max ? fmt(data.max.valorSemanal) : "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{data.max ? motoModeloAno(data.max.moto) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Menor <InfoTooltip text={`Menor preço semanal cobrado dentre os contratos de "${label}" com sobreposição no período.`} />
                      </p>
                      <p className="text-sm font-semibold text-foreground">{data.min ? fmt(data.min.valorSemanal) : "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{data.min ? motoModeloAno(data.min.moto) : "—"}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-8"></th>
                    {[
                      { h: "Moto" },
                      { h: "Contratos", tip: "Quantidade de contratos dessa moto com alguma sobreposição de dias com o período selecionado." },
                      { h: "Só Aluguel", tip: "Preço semanal médio dos contratos do tipo \"Só Aluguel\" dessa moto no período, ponderado pelos dias que cada contrato ficou ativo dentro do período. \"—\" = nenhum contrato desse tipo no período." },
                      { h: "Moto no Final", tip: "Preço semanal médio dos contratos do tipo \"Moto no Final\" dessa moto no período, ponderado pelos dias que cada contrato ficou ativo dentro do período. \"—\" = nenhum contrato desse tipo no período." },
                      ...(hasOutrosPlanos ? [{ h: "Outros", tip: "Contratos com plano diferente de \"Só Aluguel\"/\"Moto no Final\" (ex: contrato customizado da tela Contratos). Passe o mouse na linha expandida pra ver o nome do plano." }] : []),
                      { h: "Média Geral", tip: "Preço semanal médio de todos os contratos dessa moto no período (todos os planos juntos), ponderado pelos dias de cada contrato." },
                    ].map(({ h, tip }) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        {h}{tip && <InfoTooltip text={tip} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {precoSemanalReport.map(({ moto, contratos, contratosNoPeriodo, mediaGeral, mediaAluguel, mediaMotoNoFinal, mediaOutros }) => {
                    const isOpen = expandedPreco.has(moto.id);
                    return (
                      <Fragment key={moto.id}>
                        <tr
                          className="border-b border-border hover:bg-muted/30 cursor-pointer"
                          onClick={() => togglePreco(moto.id)}
                        >
                          <td className="px-2 py-3 text-center text-muted-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4 inline" /> : <ChevronRight className="h-4 w-4 inline" />}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{moto.modelo}</p>
                            <p className="text-xs text-muted-foreground">{moto.placa}</p>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{contratosNoPeriodo}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{mediaAluguel != null ? `${fmt(mediaAluguel)}/sem` : "—"}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{mediaMotoNoFinal != null ? `${fmt(mediaMotoNoFinal)}/sem` : "—"}</td>
                          {hasOutrosPlanos && (
                            <td className="px-4 py-3 tabular-nums text-warning">{mediaOutros != null ? `${fmt(mediaOutros)}/sem` : "—"}</td>
                          )}
                          <td className="px-4 py-3 tabular-nums font-semibold text-foreground">{mediaGeral != null ? `${fmt(mediaGeral)}/sem` : "—"}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/20 border-b border-border">
                            <td colSpan={hasOutrosPlanos ? 7 : 6} className="px-12 py-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left font-medium py-1 pr-4">Cliente</th>
                                    <th className="text-left font-medium py-1 pr-4">
                                      Plano <InfoTooltip text="Só Aluguel = locação sem opção de compra. Moto no Final = locação com a moto ficando com o cliente ao fim do contrato." />
                                    </th>
                                    <th className="text-left font-medium py-1 pr-4">
                                      Período <InfoTooltip text={'Início e fim do contrato. "ativa" = contrato ainda em andamento.'} />
                                    </th>
                                    <th className="text-left font-medium py-1 pr-4">
                                      Frequência <InfoTooltip text="Frequência de cobrança combinada no contrato (semanal, quinzenal ou mensal)." />
                                    </th>
                                    <th className="text-right font-medium py-1">
                                      Valor/semana <InfoTooltip text="Valor cobrado no contrato convertido pra base semanal (quinzenal ÷ 2, mensal × 7/30) — pra poder comparar contratos com frequências diferentes. Linhas apagadas não têm sobreposição com o período selecionado." />
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contratos.map(c => (
                                    <tr key={c.rental.id} className={c.overlapDays === 0 ? "opacity-40" : ""}>
                                      <td className="py-1 pr-4 text-foreground">{c.clienteNome}</td>
                                      <td className="py-1 pr-4 text-muted-foreground">{planoLabel[c.plano] || c.plano || "—"}</td>
                                      <td className="py-1 pr-4 text-muted-foreground">
                                        {format(parseISO(c.rental.dataInicio), "dd/MM/yy", { locale: ptBR })}
                                        {" – "}
                                        {c.rental.dataFim ? format(parseISO(c.rental.dataFim), "dd/MM/yy", { locale: ptBR }) : "ativa"}
                                      </td>
                                      <td className="py-1 pr-4 text-muted-foreground capitalize">{c.rental.frequenciaPagamento || "semanal"}</td>
                                      <td className="py-1 text-right tabular-nums text-foreground">{fmt(c.valorSemanal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {precoSemanalReport.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Nenhuma moto com contrato no período.</p>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── DRE Sub-components ──────────────────────────────────────────────────────

function DreBlock({ label, value, sign, tip }: { label: string; value: number; sign: "+" | "−"; tip?: string }) {
  return (
    <div className="flex items-center justify-between pt-3 pb-1">
      <span className="text-sm font-semibold text-foreground">{label}{tip && <InfoTooltip text={tip} />}</span>
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

function DreLineTotal({ label, value, tip }: { label: string; value: number; tip?: string }) {
  return (
    <div className="flex items-center justify-between py-2 mt-1 border-t border-border">
      <span className="text-sm font-semibold text-foreground">{label}{tip && <InfoTooltip text={tip} />}</span>
      <span className="text-sm tabular-nums font-mono font-semibold text-foreground">{fmt(value)}</span>
    </div>
  );
}

function DreLineResult({ label, value, margem, highlight = false, tip }: {
  label: string; value: number; margem: number; highlight?: boolean; tip?: string;
}) {
  const color = value >= 0 ? "text-green-600" : "text-destructive";
  return (
    <div className={`flex items-center justify-between py-2.5 mt-1 border-t-2 border-border ${highlight ? "bg-muted/40 -mx-6 px-6" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className={`font-bold text-foreground ${highlight ? "text-base" : "text-sm"}`}>{label}{tip && <InfoTooltip text={tip} />}</span>
        <span className={`text-xs font-mono ${color}`}>{margem.toFixed(1)}% margem</span>
      </div>
      <span className={`tabular-nums font-mono font-bold ${highlight ? "text-lg" : "text-sm"} ${color}`}>
        {fmt(value)}
      </span>
    </div>
  );
}
