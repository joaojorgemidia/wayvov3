import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { Download, Upload, FileSpreadsheet, ChevronDown, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  EntityKind, downloadTemplate, downloadExport, parseFile,
  buildFinanceiroPreview, buildMotosPreview, buildLocacoesPreview, PreviewRow,
} from "@/lib/import-export";
import { Motorcycle, Rental, FinancialEntry, Client } from "@/lib/types";

interface Props {
  kind: EntityKind;
  items: any[];
  motos?: Motorcycle[];
  clients?: Client[];
  onImport: (rows: PreviewRow<any>[]) => Promise<void> | void;
}

export function ImportExportBar({ kind, items, motos = [], clients = [], onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow<any>[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    try {
      const rows = await parseFile(file);
      if (!rows.length) { toast.error("Arquivo vazio."); return; }
      let result: PreviewRow<any>[];
      if (kind === "financeiro") result = buildFinanceiroPreview(rows, items as FinancialEntry[]);
      else if (kind === "motos") result = buildMotosPreview(rows, items as Motorcycle[]);
      else result = buildLocacoesPreview(rows, items as Rental[], motos, clients);
      setPreview(result);
      setPreviewOpen(true);
    } catch (e: any) {
      toast.error("Erro ao ler arquivo: " + (e.message || e));
    }
  };

  const toggleRow = (i: number) => {
    if (!preview) return;
    setPreview(preview.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  };
  const toggleAll = (status: PreviewRow<any>["status"], val: boolean) => {
    if (!preview) return;
    setPreview(preview.map(r => r.status === status ? { ...r, selected: val } : r));
  };

  const confirmImport = async () => {
    if (!preview) return;
    const selected = preview.filter(r => r.selected && r.status !== "error");
    if (!selected.length) { toast.error("Nenhuma linha selecionada."); return; }
    try {
      setImporting(true);
      await onImport(selected);
      setPreviewOpen(false);
      setPreview(null);
      toast.success(`${selected.length} registro(s) importado(s).`);
    } catch (e: any) {
      toast.error(e?.message || "A importação falhou antes de concluir todos os registros.");
    } finally {
      setImporting(false);
    }
  };

  const stats = preview ? {
    create: preview.filter(r => r.status === "create").length,
    update: preview.filter(r => r.status === "update").length,
    error: preview.filter(r => r.status === "error").length,
  } : null;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Modelo <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => downloadTemplate(kind, "xlsx")}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadTemplate(kind, "csv")}>CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-4 w-4" /> Exportar <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => downloadExport(kind, items, "xlsx", { motos, clients })}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadExport(kind, items, "csv", { motos, clients })}>CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Importar
        </Button>
        <input
          ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação</DialogTitle>
          </DialogHeader>

          {stats && (
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <Badge variant="outline" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Novos: {stats.create}</Badge>
              <Badge variant="outline" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-warning" /> Atualizar: {stats.update}</Badge>
              {stats.error > 0 && <Badge variant="outline" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Erros: {stats.error}</Badge>}
              <div className="flex items-center gap-2 ml-auto text-xs">
                <button className="underline text-muted-foreground" onClick={() => toggleAll("create", true)}>marcar novos</button>
                <button className="underline text-muted-foreground" onClick={() => toggleAll("update", true)}>marcar updates</button>
                <button className="underline text-muted-foreground" onClick={() => toggleAll("update", false)}>desmarcar updates</button>
              </div>
            </div>
          )}

          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-16">Linha</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview?.map((r, i) => (
                  <TableRow key={i} className={r.status === "error" ? "bg-destructive/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={r.selected}
                        disabled={r.status === "error"}
                        onCheckedChange={() => toggleRow(i)}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.rowIndex}</TableCell>
                    <TableCell>
                      {r.status === "create" && <Badge className="bg-success/10 text-success hover:bg-success/10">Novo</Badge>}
                      {r.status === "update" && <Badge className="bg-warning/10 text-warning hover:bg-warning/10">Atualizar</Badge>}
                      {r.status === "error" && <Badge variant="destructive">Erro</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{summarize(kind, r.data)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={importing}>Cancelar</Button>
            <Button onClick={confirmImport} disabled={importing}>{importing ? "Importando..." : "Confirmar importação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function summarize(kind: EntityKind, d: any): string {
  if (kind === "financeiro") return `${d.tipo === "receita" ? "+" : "-"} R$ ${Number(d.valor).toFixed(2)} · ${d.descricao} · ${d.data}`;
  if (kind === "motos") return `${d.placa} · ${d.modelo}${d.anoModelo ? ` (${d.anoModelo})` : ""}`;
  const nome = d.__pendingClient?.nome || "";
  const tel = d.__pendingClient?.telefone || "";
  return [nome, tel].filter(Boolean).join(" · ") || "Locatário existente";
}