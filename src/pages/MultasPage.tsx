import { useState, useMemo, useEffect } from "react";
import { Fine, Motorcycle, Client } from "@/lib/types";
import { saveFines } from "@/lib/store";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const statusLabel: Record<string, string> = { pendente: "Pendente", paga: "Paga", contestada: "Contestada", transferida: "Transferida" };
const statusColor: Record<string, string> = { pendente: "bg-warning/10 text-warning", paga: "bg-success/10 text-success", contestada: "bg-primary/10 text-primary", transferida: "bg-muted text-muted-foreground" };

const emptyFine = (): Fine => ({
  id: crypto.randomUUID(), motoId: "", clienteId: null, rentalId: null,
  dataMulta: new Date().toISOString().split("T")[0], dataNotificacao: null,
  valor: 0, descricao: "", status: "pendente", responsavel: "cliente",
});

export default function MultasPage() {
  const cache = useDataCacheSnapshot();
  const [fines, setFines] = useState<Fine[]>([]);
  const motos = cache.motos;
  const clients = cache.clients;
  useEffect(() => { setFines(cache.fines); }, [cache.fines]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Fine>(emptyFine());
  const [mode, setMode] = useState<"add" | "edit">("add");

  const { canCreate, canEdit, canDelete } = usePermissions();
  const persist = (d: Fine[]) => { setFines(d); saveFines(d); };
  const getMotoPlaca = (id: string) => motos.find(m => m.id === id)?.placa || "—";
  const getClientName = (id: string | null) => id ? (clients.find(c => c.id === id)?.nome || "—") : "—";

  const filtered = useMemo(() => fines.filter(f =>
    getMotoPlaca(f.motoId).toLowerCase().includes(search.toLowerCase()) ||
    f.descricao.toLowerCase().includes(search.toLowerCase())
  ), [fines, search]);

  const handleSave = () => {
    if (!form.motoId) return;
    const exists = fines.find(f => f.id === form.id);
    if (exists) persist(fines.map(f => f.id === form.id ? form : f));
    else persist([...fines, form]);
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Remover esta multa?")) persist(fines.filter(f => f.id !== id));
  };

  const totalPendente = fines.filter(f => f.status === "pendente").reduce((s, f) => s + f.valor, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Multas</h2>
          <p className="text-sm text-muted-foreground">{fines.length} multas · R$ {totalPendente.toFixed(2)} pendente</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm(emptyFine()); setMode("add"); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Multa
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar placa ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma multa registrada</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Moto</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Cliente</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Data</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Valor</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Responsável</th>
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-3 text-right font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 font-mono font-bold">{getMotoPlaca(f.motoId)}</td>
                    <td className="px-3 py-3">{getClientName(f.clienteId)}</td>
                    <td className="px-3 py-3">{new Date(f.dataMulta + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-3 font-semibold">R$ {f.valor.toFixed(2)}</td>
                    <td className="px-3 py-3 text-muted-foreground max-w-[200px] truncate">{f.descricao || "—"}</td>
                    <td className="px-3 py-3">
                      <Badge variant={f.responsavel === "cliente" ? "default" : "secondary"}>
                        {f.responsavel === "cliente" ? "Cliente" : "Locadora"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[f.status]}`}>{statusLabel[f.status]}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => { setForm({ ...f }); setMode("edit"); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                        {canDelete && <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Nova Multa" : "Editar Multa"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Moto</Label>
                <SearchableSelect
                  options={motos.map(m => ({ value: m.id, label: m.placa }))}
                  value={form.motoId}
                  onValueChange={v => setForm({ ...form, motoId: v })}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar placa..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Cliente (opcional)</Label>
                <SearchableSelect
                  options={[{ value: "none", label: "Nenhum" }, ...clients.map(c => ({ value: c.id, label: c.nome }))]}
                  value={form.clienteId || "none"}
                  onValueChange={v => setForm({ ...form, clienteId: v === "none" ? null : v })}
                  placeholder="Nenhum"
                  searchPlaceholder="Buscar cliente..."
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Data da Multa</Label>
                <Input type="date" value={form.dataMulta} onChange={e => setForm({ ...form, dataMulta: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Responsável</Label>
                <SearchableSelect
                  options={[{ value: "cliente", label: "Cliente" }, { value: "locadora", label: "Locadora" }]}
                  value={form.responsavel}
                  onValueChange={v => setForm({ ...form, responsavel: v as "locadora" | "cliente" })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Status</Label>
                <SearchableSelect
                  options={Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v }))}
                  value={form.status}
                  onValueChange={v => setForm({ ...form, status: v as any })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Data Notificação</Label>
                <Input type="date" value={form.dataNotificacao || ""} onChange={e => setForm({ ...form, dataNotificacao: e.target.value || null })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Avanço de sinal, velocidade..." />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
