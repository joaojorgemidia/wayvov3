import { useMemo } from "react";
import { Motorcycle } from "@/lib/types";
import { formatDate } from "@/lib/alerts";
import { Card, CardContent } from "@/components/ui/card";

interface OilHistoryProps {
  motos: Motorcycle[];
}

export function OilHistory({ motos }: OilHistoryProps) {
  const allRecords = useMemo(() => {
    const records: { placa: string; data: string; kmEntreTrocas: number | null; km: number }[] = [];
    motos.forEach((m) => {
      const sorted = [...m.historicoOleo].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      sorted.forEach((r, i) => {
        records.push({
          placa: m.placa,
          data: r.data,
          km: r.km,
          kmEntreTrocas: i > 0 ? r.km - sorted[i - 1].km : null,
        });
      });
    });
    return records.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [motos]);

  if (allRecords.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-2 text-base font-semibold text-foreground">Histórico de Trocas de Óleo</h3>
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma troca registrada ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">Histórico de Trocas de Óleo</h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Placa</th>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Data</th>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">KM na Troca</th>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">KM entre Trocas</th>
              </tr>
            </thead>
            <tbody>
              {allRecords.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 font-mono font-bold text-foreground">{r.placa}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(r.data)}</td>
                  <td className="px-4 py-2 font-mono text-foreground">{r.km.toLocaleString("pt-BR")} Km</td>
                  <td className="px-4 py-2 font-mono">
                    {r.kmEntreTrocas != null ? (
                      <span className={r.kmEntreTrocas > 1000 ? "text-destructive font-semibold" : "text-foreground"}>
                        {r.kmEntreTrocas.toLocaleString("pt-BR")} Km
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
