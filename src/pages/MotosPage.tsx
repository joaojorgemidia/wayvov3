import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Motorcycle, FinancialEntry } from "@/lib/types";
import { saveMotos, loadFinancial, saveFinancial } from "@/lib/store";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { MotoDialog } from "@/components/MotoDialog";
import { FrotaTab } from "@/components/motos/FrotaTab";
import { PatrimonioTab } from "@/components/motos/PatrimonioTab";
import { VendidosTab } from "@/components/motos/VendidosTab";
import { SaleDialog } from "@/components/motos/SaleDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Bike, BarChart3, Tag } from "lucide-react";
import { ImportExportBar } from "@/components/ImportExportBar";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureVistoriaFolders } from "@/lib/vistoria-folders";

export default function MotosPage() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "frota" ? "frota" : searchParams.get("tab") === "vendidos" ? "vendidos" : "patrimonio";
  const cache = useDataCacheSnapshot();
  const [motos, setMotos] = useState<Motorcycle[]>([]);

  useEffect(() => {
    const allMotos = cache.motos;
    const rentals = cache.rentals;
    const maintenance = cache.maintenance;
    const activeRentalMotoIds = new Set(rentals.filter(r => r.status === "ativa").map(r => r.motoId));
    const inMaintenanceMotoIds = new Set(maintenance.filter(m => m.status === "em_andamento" || m.status === "agendada").map(m => m.motoId));
    let changed = false;
    const synced = allMotos.map(m => {
      if (m.status === "vendida" || m.status === "inativa") return m;
      if (activeRentalMotoIds.has(m.id) && m.status !== "alugada") { changed = true; return { ...m, status: "alugada" as const }; }
      if (!activeRentalMotoIds.has(m.id) && m.status === "alugada") {
        changed = true;
        if (inMaintenanceMotoIds.has(m.id)) return { ...m, status: "manutencao" as const };
        return { ...m, status: "disponivel" as const };
      }
      if (!activeRentalMotoIds.has(m.id) && inMaintenanceMotoIds.has(m.id) && m.status === "disponivel") { changed = true; return { ...m, status: "manutencao" as const }; }
      if (!activeRentalMotoIds.has(m.id) && !inMaintenanceMotoIds.has(m.id) && m.status === "manutencao") { changed = true; return { ...m, status: "disponivel" as const }; }
      return m;
    });
    setMotos(synced);
    if (changed) saveMotos(synced);
  }, [cache.motos, cache.rentals, cache.maintenance]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMoto, setEditMoto] = useState<Motorcycle | null>(null);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleMoto, setSaleMoto] = useState<Motorcycle | null>(null);

  const persist = (updated: Motorcycle[]) => { setMotos(updated); saveMotos(updated); };

  const { canCreate, canEdit, canDelete } = usePermissions();

  const handleSave = (moto: Motorcycle) => {
    const exists = motos.find((m) => m.id === moto.id);
    if (exists) persist(motos.map((m) => (m.id === moto.id ? moto : m)));
    else persist([...motos, moto]);
    // Cria/garante a pasta da placa no Drive em background
    if (moto.placa) ensureVistoriaFolders({ placas: [moto.placa] });
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja remover esta moto?")) persist(motos.filter((m) => m.id !== id));
  };

  const handleBulkDelete = (ids: Set<string>) => {
    if (!confirm(`Remover ${ids.size} moto(s) selecionada(s)?`)) return;
    persist(motos.filter((m) => !ids.has(m.id)));
  };

  const handleEdit = (moto: Motorcycle) => {
    setEditMoto({ ...moto });
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleSell = (moto: Motorcycle) => {
    setSaleMoto({ ...moto });
    setSaleDialogOpen(true);
  };

  const handleSaleConfirm = (moto: Motorcycle) => {
    persist(motos.map((m) => (m.id === moto.id ? moto : m)));

    // Auto-create financial entry for the sale
    const entry: FinancialEntry = {
      id: crypto.randomUUID(),
      tipo: "receita",
      categoria: "venda_moto",
      descricao: `Venda da moto ${moto.placa}${moto.modelo ? ` (${moto.modelo})` : ""}`,
      valor: moto.valorVenda || 0,
      data: moto.dataVenda || new Date().toISOString().slice(0, 10),
      motoId: moto.id,
      placa: moto.placa,
      rentalId: null,
      clienteId: null,
      pago: true,
      conta: "Caixa",
      natureza: "operacional",
      observacao: `Venda registrada automaticamente. Valor compra: R$ ${(moto.valorCompra || 0).toLocaleString("pt-BR")} | KM compra: ${moto.kmCompra ?? "—"} | KM venda: ${moto.kmVenda ?? "—"}`,
    };
    const financial = loadFinancial();
    saveFinancial([...financial, entry]);

    // Renomear pasta no Google Drive em background — não bloqueia a UI
    void supabase.functions
      .invoke("rename-vistoria-folder", { body: { placa: moto.placa, suffix: "Vendida" } })
      .then(({ error }) => {
        if (error) console.warn("Falha ao renomear pasta no Drive:", error.message);
      });
  };

  const activeMotos = motos.filter(m => m.status !== "vendida");
  const soldCount = motos.filter(m => m.status === "vendida").length;

  const propriasCount = activeMotos.filter(m => m.tipo === "propria").length;
  const terceirosCount = activeMotos.filter(m => m.tipo === "terceiro").length;

  return (
    <div className="p-6 space-y-6">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="absolute -left-10 -bottom-20 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20">
              <Bike className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Motos</h2>
              <p className="mt-1 text-sm text-muted-foreground">Gerencie sua frota, patrimônio e vendas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ImportExportBar
              kind="motos"
              items={motos}
              onImport={(rows) => {
                const map = new Map(motos.map(m => [m.id, m]));
                rows.forEach(r => map.set(r.data.id, r.data));
                persist(Array.from(map.values()));
              }}
            />
            {canCreate && (
              <Button onClick={() => { setEditMoto(null); setDialogMode("add"); setDialogOpen(true); }} className="gap-2 shadow-md shadow-primary/20">
                <Plus className="h-4 w-4" /> Nova Moto
              </Button>
            )}
          </div>
        </div>

        {/* Stat chips */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="Cadastradas" value={activeMotos.length} tone="default" />
          <StatChip label="Próprias" value={propriasCount} tone="primary" />
          <StatChip label="Terceiros" value={terceirosCount} tone="accent" />
          <StatChip label="Vendidas" value={soldCount} tone="violet" />
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="h-11 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="patrimonio" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><Bike className="h-4 w-4" /> Frota</TabsTrigger>
          <TabsTrigger value="frota" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><BarChart3 className="h-4 w-4" /> Controle Patrimonial</TabsTrigger>
          <TabsTrigger value="vendidos" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><Tag className="h-4 w-4" /> Vendidos {soldCount > 0 && <span className="ml-1 text-xs bg-background px-1.5 py-0.5 rounded-full">{soldCount}</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="patrimonio" className="mt-4">
          <PatrimonioTab motos={motos} onEdit={handleEdit} />
        </TabsContent>

        <TabsContent value="frota" className="mt-4">
          <FrotaTab motos={activeMotos} onEdit={handleEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} onSell={handleSell} />
        </TabsContent>

        <TabsContent value="vendidos" className="mt-4">
          <VendidosTab motos={motos} />
        </TabsContent>
      </Tabs>

      <MotoDialog open={dialogOpen} onOpenChange={setDialogOpen} moto={editMoto} onSave={handleSave} mode={dialogMode} />
      <SaleDialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen} moto={saleMoto} onConfirm={handleSaleConfirm} />
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: "default" | "primary" | "accent" | "violet" }) {
  const tones: Record<string, string> = {
    default: "bg-background/70 text-foreground ring-border",
    primary: "bg-primary/10 text-primary ring-primary/20",
    accent: "bg-accent/10 text-accent ring-accent/20",
    violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  };
  return (
    <div className={`rounded-xl px-4 py-3 ring-1 backdrop-blur-sm ${tones[tone]}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}
