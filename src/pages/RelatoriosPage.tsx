import { useState, useMemo } from "react";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { getOilTimeStatus, getOilKmStatus, getInspectionStatus, worstStatus } from "@/lib/alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Bike, Users, DollarSign, Wrench, AlertTriangle } from "lucide-react";

export default function RelatoriosPage() {
  const { motos, clients, rentals, fines, maintenance, financial } = useDataCacheSnapshot();

  const motoStats = useMemo(() => {
    let danger = 0, warning = 0, ok = 0;
    motos.forEach(m => {
      const w = worstStatus(getOilTimeStatus(m).status, getOilKmStatus(m).status, getInspectionStatus(m).status);
      if (w === "danger") danger++;
      else if (w === "warning") warning++;
      else ok++;
    });
    return { danger, warning, ok };
  }, [motos]);

  const rentalStats = useMemo(() => ({
    ativas: rentals.filter(r => r.status === "ativa").length,
    finalizadas: rentals.filter(r => r.status === "finalizada").length,
    total: rentals.length,
  }), [rentals]);

  const finStats = useMemo(() => {
    const receitas = financial.filter(e => e.tipo === "receita").reduce((s, e) => s + e.valor, 0);
    const despesas = financial.filter(e => e.tipo === "despesa").reduce((s, e) => s + e.valor, 0);
    return { receitas, despesas, saldo: receitas - despesas };
  }, [financial]);

  const fineStats = useMemo(() => ({
    total: fines.length,
    pendentes: fines.filter(f => f.status === "pendente").length,
    valorPendente: fines.filter(f => f.status === "pendente").reduce((s, f) => s + f.valor, 0),
  }), [fines]);

  const custoManutencao = maintenance.reduce((s, m) => s + m.custo, 0);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Relatórios</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Bike className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Frota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Total: <strong>{motos.length}</strong> motos</p>
            <p>Próprias: <strong>{motos.filter(m => m.tipo === "propria").length}</strong></p>
            <p>Terceiros: <strong>{motos.filter(m => m.tipo === "terceiro").length}</strong></p>
            <p>Disponíveis: <strong>{motos.filter(m => m.status === "disponivel").length}</strong></p>
            <p>Alugadas: <strong>{motos.filter(m => m.status === "alugada").length}</strong></p>
            <div className="border-t pt-2 mt-2">
              <p className="text-success">✓ Em dia: {motoStats.ok}</p>
              <p className="text-warning">⚠ Atenção: {motoStats.warning}</p>
              <p className="text-destructive">✗ Vencidas: {motoStats.danger}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Clientes & Locações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Clientes: <strong>{clients.length}</strong></p>
            <p>Locações ativas: <strong>{rentalStats.ativas}</strong></p>
            <p>Locações finalizadas: <strong>{rentalStats.finalizadas}</strong></p>
            <p>Total de locações: <strong>{rentalStats.total}</strong></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-success">Receitas: R$ {finStats.receitas.toFixed(2)}</p>
            <p className="text-destructive">Despesas: R$ {finStats.despesas.toFixed(2)}</p>
            <p className={finStats.saldo >= 0 ? "text-success font-bold" : "text-destructive font-bold"}>
              Saldo: R$ {finStats.saldo.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Wrench className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Manutenção</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Total registros: <strong>{maintenance.length}</strong></p>
            <p>Agendadas: <strong>{maintenance.filter(m => m.status === "agendada").length}</strong></p>
            <p>Custo total: <strong>R$ {custoManutencao.toFixed(2)}</strong></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Multas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Total: <strong>{fineStats.total}</strong></p>
            <p>Pendentes: <strong>{fineStats.pendentes}</strong></p>
            <p className="text-warning font-semibold">Valor pendente: R$ {fineStats.valorPendente.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
