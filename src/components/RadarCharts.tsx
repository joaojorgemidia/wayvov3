import { useMemo } from "react";
import { Motorcycle } from "@/lib/types";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";

interface RadarChartsProps {
  motos: Motorcycle[];
}

export function RadarCharts({ motos }: RadarChartsProps) {
  const motosWithHistory = useMemo(
    () => motos.filter((m) => m.historicoOleo.length > 0).slice(0, 8),
    [motos]
  );

  if (motosWithHistory.length < 3) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-base font-semibold text-foreground">Quantidade de trocas de óleo</h3>
            <p className="text-sm text-muted-foreground py-12 text-center">
              Necessário ao menos 3 motos com histórico de trocas para exibir o gráfico.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-base font-semibold text-foreground">Km médio de troca de óleo</h3>
            <p className="text-sm text-muted-foreground py-12 text-center">
              Necessário ao menos 3 motos com histórico de trocas para exibir o gráfico.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const countData = motosWithHistory.map((m) => ({
    placa: m.placa,
    value: m.historicoOleo.length,
  }));

  const avgKmData = motosWithHistory.map((m) => {
    const history = [...m.historicoOleo].sort((a, b) => a.km - b.km);
    if (history.length < 2) return { placa: m.placa, value: 0 };
    let totalKm = 0;
    for (let i = 1; i < history.length; i++) {
      totalKm += history[i].km - history[i - 1].km;
    }
    return { placa: m.placa, value: Math.round(totalKm / (history.length - 1)) };
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-base font-semibold text-foreground">Quantidade de trocas de óleo</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={countData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="placa" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
              <Radar
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.25}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-base font-semibold text-foreground">Km médio de troca de óleo</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={avgKmData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="placa" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
              <Radar
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.25}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
