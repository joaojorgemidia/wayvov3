import { useState } from "react";
import { loadMaintenanceConfig, saveMaintenanceConfig, type Oficina } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Building2, MoreVertical, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const DEFAULT_TIPOS_SEED = ["Troca de Óleo", "Revisão", "Reparo", "Vistoria", "Outro"];

export default function ManutencoesConfigPage() {
  const [config, setConfig] = useState(loadMaintenanceConfig);
  const { canCreate, canEdit, canDelete } = usePermissions();

  // ── Tipos ────────────────────────────────────────────────────────
  const [tipoDialogOpen, setTipoDialogOpen] = useState(false);
  const [editTipoIdx, setEditTipoIdx] = useState<number | null>(null);
  const [tipoForm, setTipoForm] = useState("");

  const openNewTipo = () => { setEditTipoIdx(null); setTipoForm(""); setTipoDialogOpen(true); };
  const openEditTipo = (idx: number) => { setEditTipoIdx(idx); setTipoForm(config.tipos[idx]); setTipoDialogOpen(true); };

  const saveTipo = () => {
    const nome = tipoForm.trim();
    if (!nome) return;
    const isDuplicate = config.tipos.some((t, i) => t === nome && i !== editTipoIdx);
    if (isDuplicate) { toast.error("Já existe um tipo com esse nome"); return; }
    const tipos =
      editTipoIdx === null
        ? [...config.tipos, nome]
        : config.tipos.map((t, i) => (i === editTipoIdx ? nome : t));
    const next = { ...config, tipos };
    setConfig(next);
    saveMaintenanceConfig(next);
    toast.success(editTipoIdx === null ? "Tipo adicionado" : "Tipo atualizado");
    setTipoDialogOpen(false);
  };

  const deleteTipo = (idx: number) => {
    const tipos = config.tipos.filter((_, i) => i !== idx);
    const next = { ...config, tipos };
    setConfig(next);
    saveMaintenanceConfig(next);
    toast.success("Tipo removido");
  };

  // ── Oficinas ─────────────────────────────────────────────────────
  const [oficinaDialogOpen, setOficinaDialogOpen] = useState(false);
  const [editOficina, setEditOficina] = useState<Oficina | null>(null);
  const emptyOficinaForm = () => ({ nome: "", endereco: "", responsavel: "" });
  const [oficForm, setOficForm] = useState(emptyOficinaForm);

  const openNewOficina = () => { setEditOficina(null); setOficForm(emptyOficinaForm()); setOficinaDialogOpen(true); };
  const openEditOficina = (o: Oficina) => { setEditOficina(o); setOficForm({ nome: o.nome, endereco: o.endereco, responsavel: o.responsavel }); setOficinaDialogOpen(true); };

  const saveOficina = () => {
    const nome = oficForm.nome.trim();
    if (!nome) { toast.error("Nome é obrigatório"); return; }
    const isDuplicate = config.oficinas.some((o) => o.nome === nome && o.id !== editOficina?.id);
    if (isDuplicate) { toast.error("Já existe uma oficina com esse nome"); return; }
    const oficina: Oficina = {
      id: editOficina?.id ?? crypto.randomUUID(),
      nome,
      endereco: oficForm.endereco.trim(),
      responsavel: oficForm.responsavel.trim(),
    };
    const oficinas = editOficina
      ? config.oficinas.map((o) => (o.id === editOficina.id ? oficina : o))
      : [...config.oficinas, oficina];
    const next = { ...config, oficinas };
    setConfig(next);
    saveMaintenanceConfig(next);
    toast.success(editOficina ? "Oficina atualizada" : "Oficina adicionada");
    setOficinaDialogOpen(false);
  };

  const deleteOficina = (id: string) => {
    const oficinas = config.oficinas.filter((o) => o.id !== id);
    const next = { ...config, oficinas };
    setConfig(next);
    saveMaintenanceConfig(next);
    toast.success("Oficina removida");
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-10 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configurações de Manutenção</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gerencie os tipos de OS e as oficinas cadastradas
        </p>
      </div>

      {/* ── Seção Tipos ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tipos de OS</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{config.tipos.length} tipos cadastrados</p>
          </div>
          {canCreate && (
            <Button onClick={openNewTipo} className="gap-2" size="sm">
              <Plus className="h-4 w-4" /> Novo tipo
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {config.tipos.map((t, idx) => (
            <Card key={idx}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="truncate text-sm font-medium">{t}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEdit && (
                      <DropdownMenuItem onClick={() => openEditTipo(idx)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem onClick={() => deleteTipo(idx)} className="text-destructive">
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}

          {config.tipos.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Nenhum tipo cadastrado.
            </p>
          )}

          {canCreate && (
            <Card className="cursor-pointer border-dashed transition-colors hover:border-primary/50" onClick={openNewTipo}>
              <CardContent className="flex min-h-[64px] flex-col items-center justify-center p-4">
                <Plus className="h-5 w-5 text-muted-foreground/50" />
                <p className="mt-1 text-xs font-medium text-primary">Novo tipo</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ── Seção Oficinas ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Oficinas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{config.oficinas.length} oficinas cadastradas</p>
          </div>
          {canCreate && (
            <Button onClick={openNewOficina} className="gap-2" size="sm">
              <Plus className="h-4 w-4" /> Nova oficina
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {config.oficinas.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-semibold">{o.nome}</p>
                      {o.endereco && (
                        <p className="truncate text-xs text-muted-foreground">{o.endereco}</p>
                      )}
                      {o.responsavel && (
                        <p className="text-xs text-muted-foreground">Resp.: {o.responsavel}</p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => openEditOficina(o)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem onClick={() => deleteOficina(o.id)} className="text-destructive">
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}

          {config.oficinas.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Nenhuma oficina cadastrada.
            </p>
          )}

          {canCreate && (
            <Card className="cursor-pointer border-dashed transition-colors hover:border-primary/50" onClick={openNewOficina}>
              <CardContent className="flex min-h-[80px] flex-col items-center justify-center p-5">
                <Plus className="h-5 w-5 text-muted-foreground/50" />
                <p className="mt-1 text-xs font-medium text-primary">Nova oficina</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ── Dialog Tipo ─────────────────────────────────────────── */}
      <Dialog open={tipoDialogOpen} onOpenChange={setTipoDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{editTipoIdx === null ? "Novo tipo" : "Editar tipo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label>Nome</Label>
              <Input
                value={tipoForm}
                onChange={(e) => setTipoForm(e.target.value)}
                placeholder="Ex: Funilaria"
                onKeyDown={(e) => { if (e.key === "Enter") saveTipo(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTipoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveTipo} disabled={!tipoForm.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Oficina ───────────────────────────────────────── */}
      <Dialog open={oficinaDialogOpen} onOpenChange={setOficinaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editOficina ? "Editar oficina" : "Nova oficina"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input
                value={oficForm.nome}
                onChange={(e) => setOficForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Oficina do João"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Endereço <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
              <Input
                value={oficForm.endereco}
                onChange={(e) => setOficForm((f) => ({ ...f, endereco: e.target.value }))}
                placeholder="Ex: Rua das Flores, 123 – Centro"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
              <Input
                value={oficForm.responsavel}
                onChange={(e) => setOficForm((f) => ({ ...f, responsavel: e.target.value }))}
                placeholder="Ex: João Silva"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOficinaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveOficina} disabled={!oficForm.nome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
