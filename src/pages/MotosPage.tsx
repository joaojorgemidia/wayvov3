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
import { Plus, Bike, BarChart3, Tag, Car } from "lucide-react";
import { ImportExportBar } from "@/components/ImportExportBar";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureVistoriaFolders } from "@/lib/vistoria-folders";
import { useCompany } from "@/contexts/CompanyContext";
import { isLoca2Rodas as checkIsLoca2Rodas } from "@/lib/companies";
import { VehicleFilterChips } from "@/components/VehicleFilterChips";

export default function MotosPage() {
  const [searchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const isLoca2Rodas = checkIsLoca2Rodas(activeCompany);
  const requestedTab = searchParams.get("tab");
  const defaultTab = requestedTab === "patrimonio" ? "patrimonio"
    : requestedTab === "vendidos" ? "vendidos"
    : requestedTab === "carros" && isLoca2Rodas ? "carros"
    : "motos";
  // Tabs precisa ser controlado: a página não remonta ao navegar entre os links do menu
  // lateral (mesma rota, só muda a query string), então um `defaultValue` não reagiria
  // a cliques no menu — só é lido na primeira renderização.
  const [activeTab, setActiveTab] = useState(defaultTab);
  useEffect(() => {
    setActiveTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab, isLoca2Rodas]);
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
  const [addCategoria, setAddCategoria] = useState<"moto" | "carro">("moto");
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleMoto, setSaleMoto] = useState<Motorcycle | null>(null);
  const [patrimonioFilter, setPatrimonioFilter] = useState<"todos" | "moto" | "carro">("todos");
  const [vendidosFilter, setVendidosFilter] = useState<"todos" | "moto" | "carro">("todos");

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
    const alvo = motos.find((m) => m.id === id);
    const label = alvo?.categoriaVeiculo === "carro" ? "este carro" : "esta moto";
    if (confirm(`Tem certeza que deseja remover ${label}?`)) persist(motos.filter((m) => m.id !== id));
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
      descricao: `Venda d${moto.categoriaVeiculo === "carro" ? "o carro" : "a moto"} ${moto.placa}${moto.modelo ? ` (${moto.modelo})` : ""}`,
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

  const motosOnly = motos.filter(m => m.categoriaVeiculo !== "carro");
  const carros = motos.filter(m => m.categoriaVeiculo === "carro");

  const activeMotos = motosOnly.filter(m => m.status !== "vendida");
  const soldCount = motosOnly.filter(m => m.status === "vendida").length;

  const activeCarros = carros.filter(m => m.status !== "vendida");
  const soldCarrosCount = carros.filter(m => m.status === "vendida").length;
  const soldAllCount = motos.filter(m => m.status === "vendida").length;

  const propriasCount = activeMotos.filter(m => m.tipo === "propria").length;
  const terceirosCount = activeMotos.filter(m => m.tipo === "terceiro").length;
  const carrosPropriasCount = activeCarros.filter(m => m.tipo === "propria").length;
  const carrosTerceirosCount = activeCarros.filter(m => m.tipo === "terceiro").length;

  // Hero (título, stats e botão de cadastro) isolado por tipo de veículo nas abas
  // Motos/Carros. Nas abas combinadas (Controle Patrimonial/Vendidos) mostra a frota
  // toda (motos + carros), já que ali o filtro Todos/Motos/Carros é interno à tela.
  const isCarrosTab = activeTab === "carros";
  const isCombinedTab = activeTab === "patrimonio" || activeTab === "vendidos";
  const heroLabel = isCarrosTab ? "Carros" : isCombinedTab ? "Frota" : "Motos";
  const heroCadastradas = isCarrosTab ? activeCarros.length : isCombinedTab ? activeMotos.length + activeCarros.length : activeMotos.length;
  const heroProprias = isCarrosTab ? carrosPropriasCount : isCombinedTab ? propriasCount + carrosPropriasCount : propriasCount;
  const heroTerceiros = isCarrosTab ? carrosTerceirosCount : isCombinedTab ? terceirosCount + carrosTerceirosCount : terceirosCount;
  const heroVendidas = isCarrosTab ? soldCarrosCount : isCombinedTab ? soldAllCount : soldCount;

  // Controle Patrimonial e Vendidos mostram motos + carros juntos (para quem tem carros),
  // com filtro por tipo — para as demais empresas `motos` só tem categoria "moto" mesmo.
  const byVehicleFilter = (list: Motorcycle[], filter: "todos" | "moto" | "carro") =>
    filter === "todos" ? list : list.filter(m => m.categoriaVeiculo === filter);
  const patrimonioMotos = byVehicleFilter(motos, patrimonioFilter);
  const vendidosMotos = byVehicleFilter(motos, vendidosFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="absolute -left-10 -bottom-20 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20">
              {isCarrosTab ? <Car className="h-6 w-6" /> : <Bike className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">{heroLabel}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Gerencie sua frota, patrimônio e vendas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isCarrosTab && (
              <ImportExportBar
                kind="motos"
                items={motosOnly}
                onImport={(rows) => {
                  const map = new Map(motos.map(m => [m.id, m]));
                  rows.forEach(r => map.set(r.data.id, r.data));
                  persist(Array.from(map.values()));
                }}
              />
            )}
            {canCreate && (
              <Button
                onClick={() => { setEditMoto(null); setDialogMode("add"); setAddCategoria(isCarrosTab ? "carro" : "moto"); setDialogOpen(true); }}
                className="gap-2 shadow-md shadow-primary/20"
              >
                <Plus className="h-4 w-4" /> {isCarrosTab ? "Novo Carro" : "Nova Moto"}
              </Button>
            )}
          </div>
        </div>

        {/* Stat chips */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="Cadastradas" value={heroCadastradas} tone="default" />
          <StatChip label="Próprias" value={heroProprias} tone="primary" />
          <StatChip label="Terceiros" value={heroTerceiros} tone="accent" />
          <StatChip label="Vendidas" value={heroVendidas} tone="violet" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-11 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="motos" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><Bike className="h-4 w-4" /> Motos</TabsTrigger>
          {isLoca2Rodas && (
            <TabsTrigger value="carros" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><Car className="h-4 w-4" /> Carros {activeCarros.length > 0 && <span className="ml-1 text-xs bg-background px-1.5 py-0.5 rounded-full">{activeCarros.length}</span>}</TabsTrigger>
          )}
          <TabsTrigger value="patrimonio" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><BarChart3 className="h-4 w-4" /> Controle Patrimonial</TabsTrigger>
          <TabsTrigger value="vendidos" className="gap-1.5 rounded-lg data-[state=active]:shadow-sm"><Tag className="h-4 w-4" /> Vendidos {soldAllCount > 0 && <span className="ml-1 text-xs bg-background px-1.5 py-0.5 rounded-full">{soldAllCount}</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="motos" className="mt-4">
          <FrotaTab motos={activeMotos} onEdit={handleEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} onSell={handleSell} />
        </TabsContent>

        {isLoca2Rodas && (
          <TabsContent value="carros" className="mt-4">
            <FrotaTab motos={activeCarros} onEdit={handleEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} onSell={handleSell} vehicleLabel="carro" />
          </TabsContent>
        )}

        <TabsContent value="patrimonio" className="mt-4 space-y-3">
          {isLoca2Rodas && (
            <VehicleFilterChips value={patrimonioFilter} onChange={setPatrimonioFilter} />
          )}
          <PatrimonioTab motos={patrimonioMotos} onEdit={handleEdit} vehicleLabel={isLoca2Rodas ? patrimonioFilter : "moto"} />
        </TabsContent>

        <TabsContent value="vendidos" className="mt-4 space-y-3">
          {isLoca2Rodas && (
            <VehicleFilterChips value={vendidosFilter} onChange={setVendidosFilter} />
          )}
          <VendidosTab
            motos={vendidosMotos}
            vehicleLabel={isLoca2Rodas ? vendidosFilter : "moto"}
            onUpdate={(id, updates) => persist(motos.map((m) => (m.id === id ? { ...m, ...updates } : m)))}
          />
        </TabsContent>
      </Tabs>

      <MotoDialog open={dialogOpen} onOpenChange={setDialogOpen} moto={editMoto} onSave={handleSave} mode={dialogMode} defaultCategoria={addCategoria} />
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
