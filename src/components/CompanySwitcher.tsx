import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Building2, Check, ChevronsUpDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function CompanySwitcher() {
  const { companies, activeCompany, switchCompany, addCompany, updateCompany, removeCompany } = useCompany();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newCnpj, setNewCnpj] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");

  const filtered = companies.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search)
  );

  const handleAdd = async () => {
    if (!newNome.trim()) return;
    await addCompany({
      id: crypto.randomUUID(),
      nome: newNome.trim(),
      cnpj: newCnpj.trim(),
    });
    setNewNome("");
    setNewCnpj("");
    setDialogOpen(false);
  };

  const openEdit = (c: { id: string; nome: string; cnpj: string }) => {
    setEditId(c.id);
    setEditNome(c.nome);
    setEditCnpj(c.cnpj || "");
  };

  const handleSaveEdit = async () => {
    if (!editId || !editNome.trim()) return;
    await updateCompany(editId, { nome: editNome, cnpj: editCnpj });
    setEditId(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2 px-3 h-10 min-w-[200px] justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold leading-none">{activeCompany.nome}</p>
                {activeCompany.cnpj && (
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{activeCompany.cnpj}</p>
                )}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <div className="px-2 pb-1">
            <p className="text-xs text-muted-foreground px-2 py-1">
              Minhas Empresas ({companies.length})
            </p>
          </div>
          <div className="max-h-[200px] overflow-y-auto px-1 pb-1">
            {filtered.map(c => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 w-full rounded-md px-2 py-2 transition-colors hover:bg-accent",
                  c.id === activeCompany.id && "bg-accent"
                )}
              >
                <button
                  onClick={() => { switchCompany(c.id); setOpen(false); }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.nome}</p>
                    {c.cnpj && <p className="text-[10px] text-muted-foreground">{c.cnpj}</p>}
                  </div>
                  {c.id === activeCompany.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
                {isAdmin && companies.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                    title="Excluir empresa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); openEdit(c); setOpen(false); }}
                    title="Editar empresa"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhuma empresa encontrada</p>
            )}
          </div>
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={() => { setDialogOpen(true); setOpen(false); }}>
              <Plus className="h-4 w-4" /> Adicionar empresa
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da empresa</Label>
              <Input value={newNome} onChange={e => setNewNome(e.target.value)} placeholder="Ex: Motovia Locadora" />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={newCnpj} onChange={e => setNewCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!newNome.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Locadora</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da empresa</Label>
              <Input value={editNome} onChange={e => setEditNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={editCnpj} onChange={e => setEditCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={!editNome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o vínculo da empresa de todos os usuários. Os dados operacionais (motos, locações, financeiro) permanecem no banco mas ficarão inacessíveis. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (confirmDeleteId) await removeCompany(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
