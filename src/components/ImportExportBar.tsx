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
import { ColumnMapper, SystemField } from "./ColumnMapper";

// ── System fields shown in the mapping step ──────────────────────────────────

const MOTOS_FIELDS: SystemField[] = [
  { key: "Placa",      label: "Placa",   required: true  },
  { key: "Modelo",     label: "Modelo",  required: false },
  { key: "Ano Modelo", label: "Ano",     required: false },
  { key: "Cor",        label: "Cor",     required: false },
  { key: "Chassi",     label: "Chassi",  required: false },
  { key: "Renavam",    label: "Renavam", required: false },
];

const LOCACOES_FIELDS: SystemField[] = [
  { key: "Placa",          label: "Placa",        required: true  },
  { key: "Nome",           label: "Locatário",    required: false },
  { key: "CPF",            label: "CPF",          required: false },
  { key: "Data Início",    label: "Data Início",  required: false },
  { key: "Data Fim",       label: "Data Fim",     required: false },
  { key: "Status",         label: "Status",       required: false },
  { key: "Valor Semanal",  label: "Valor Semanal",required: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractSamples(rows: Record<string, any>[], max = 3): Record<string, string[]> {
  const samples: Record<string, string[]> = {};
  for (const row of rows.slice(0, 20)) {
    for (const [col, val] of Object.entries(row)) {
      if (!samples[col]) samples[col] = [];
      const s = String(val ?? "").trim();
      if (s && !samples[col].includes(s) && samples[col].length < max) {
        samples[col].push(s);
      }
    }
  }
  return samples;
}

function applyMapping(
  rows: Record<string, any>[],
  mapping: Record<string, string | null>,
): Record<string, any>[] {
  const mappedFileCols = new Set(Object.keys(mapping));
  return rows.map(row => {
    const newRow: Record<string, any> = {};
    // keep unmapped columns unchanged
    for (const [col, val] of Object.entries(row)) {
      if (!mappedFileCols.has(col)) newRow[col] = val;
    }
    // rename mapped columns to system keys
    for (const [fileCol, systemKey] of Object.entries(mapping)) {
      if (systemKey) newRow[systemKey] = row[fileCol];
      // null = ignore: column is dropped
    }
    return newRow;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  kind: EntityKind;
  items: any[];
  motos?: Motorcycle[];
  clients?: Client[];
  onImport: (rows: PreviewRow<any>[]) => Promise<void> | void;
}

interface MappingStage {
  rows: Record<string, any>[];
  columns: string[];
  samples: Record<string, string[]>;
}

export function ImportExportBar({ kind, items, motos = [], clients = [], onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mappingStage, setMappingStage] = useState<MappingStage | null>(null);
  const [preview, setPreview] = useState<PreviewRow<any>[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const buildPreview = (rows: Record<string, any>[]) => {
    let result: PreviewRow<any>[];
    if (kind === "financeiro") result = buildFinanceiroPreview(rows, items as FinancialEntry[]);
    else if (kind === "motos") result = buildMotosPreview(rows, items as Motorcycle[]);
    else result = buildLocacoesPreview(rows, items as Rental[], motos, clients);
    setPreview(result);
    setPreviewOpen(true);
  };

  const handleFile = async (file: File) => {
    try {
      const rows = await parseFile(file);
      if (!rows.length) { toast.error("Arquivo vazio."); return; }

      // financeiro goes straight to preview (no column mapping step)
      if (kind === "financeiro") {
        buildPreview(rows);
        return;
      }

      const columns = Object.keys(rows[0] ?? {});
      const samples = extractSamples(rows);
      setMappingStage({ rows, columns, samples });
    } catch (e: any) {
      toast.error("Erro ao ler arquivo: " + (e.message || e));
    }
  };

  const handleMappingConfirm = (mapping: Record<string, string | null>) => {
    if (!mappingStage) return;
    setMappingStage(null);
    buildPreview(applyMapping(mappingStage.rows, mapping));
  };

  const toggleRow = (i: number) => {
    if (!preview) return;
    setPreview(preview.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  };
  const toggleAll = (status: PreviewRow<any>["status"], val: boolean) => {
    if (!preview) return;
    setPreview(preview.map(r => r.status === status ? { ...r, selected: val } : r));
  };

  const revalidateWithPlaca = (idx: number, placa: string) => {
    if (!preview) return;
    const placaNorm = placa.toUpperCase().trim();

    setPreview(prev => prev!.map((r, i) => {
      if (i !== idx) return r;

      if (!placaNorm) {
        return { ...r, status: "error", message: "Placa obrigatória", selected: false };
      }

      if (kind === "motos") {
        const byPlaca = new Map((items as Motorcycle[]).map(m => [m.placa.toUpperCase().trim(), m]));
        const conflict = byPlaca.get(placaNorm);
        return {
          ...r,
          data: { ...r.data, placa: placaNorm, id: conflict?.id || r.data.id },
          status: conflict ? "update" : "create",
          conflictWith: conflict?.id,
          message: "",
          selected: true,
        };
      }

      // locacoes
      const motoByPlaca = new Map(motos.map(m => [m.placa.toUpperCase().trim(), m]));
      const moto = motoByPlaca.get(placaNorm);
      if (!moto) {
        return {
          ...r,
          data: { ...r.data, motoId: "", __placa: placaNorm } as any,
          status: "warning",
          message: "Moto não encontrada — vincule manualmente após a importação",
          selected: true,
        };
      }
      const conflict = (items as Rental[]).find(
        rental => rental.motoId === moto.id && rental.clienteId === r.data.clienteId && rental.status === "ativa",
      );
      return {
        ...r,
        data: { ...r.data, motoId: moto.id, __placa: placaNorm } as any,
        status: conflict ? "update" : "create",
        conflictWith: conflict?.id,
        message: "",
        selected: true,
      };
    }));
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
    warning: preview.filter(r => r.status === "warning").length,
    error: preview.filter(r => r.status === "error").length,
  } : null;

  const mappingFields = kind === "motos" ? MOTOS_FIELDS : LOCACOES_FIELDS;

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

      {/* Column mapping step */}
      {mappingStage && (
        <ColumnMapper
          open
          columns={mappingStage.columns}
          samples={mappingStage.samples}
          fields={mappingFields}
          onConfirm={handleMappingConfirm}
          onCancel={() => setMappingStage(null)}
        />
      )}

      {/* Preview step */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação</DialogTitle>
          </DialogHeader>

          {stats && (
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <Badge variant="outline" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Novos: {stats.create}</Badge>
              <Badge variant="outline" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-success" /> Atualizar: {stats.update}</Badge>
              {stats.warning > 0 && <Badge variant="outline" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-warning" /> Avisos: {stats.warning}</Badge>}
              {stats.error > 0 && <Badge variant="outline" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Erros: {stats.error}</Badge>}
              <div className="flex items-center gap-2 ml-auto text-xs">
                <button className="underline text-muted-foreground" onClick={() => toggleAll("create", true)}>marcar novos</button>
                <button className="underline text-muted-foreground" onClick={() => toggleAll("update", true)}>marcar updates</button>
                <button className="underline text-muted-foreground" onClick={() => toggleAll("update", false)}>desmarcar updates</button>
                {stats.warning > 0 && <>
                  <button className="underline text-muted-foreground" onClick={() => toggleAll("warning", true)}>marcar avisos</button>
                  <button className="underline text-muted-foreground" onClick={() => toggleAll("warning", false)}>desmarcar avisos</button>
                </>}
              </div>
            </div>
          )}

          <div className="overflow-auto flex-1 border rounded-md">
            {kind === "locacoes" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>Locatário</TableHead>
                    <TableHead className="w-28">Placa</TableHead>
                    <TableHead className="w-24">Data Início</TableHead>
                    <TableHead className="w-24">Data Fim</TableHead>
                    <TableHead className="w-32 text-right">Valor Semanal</TableHead>
                    <TableHead className="w-32">Telefone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview?.map((r, i) => {
                    const d = r.data as any;
                    return (
                      <TableRow key={i} className={r.status === "error" ? "bg-destructive/5" : r.status === "warning" ? "bg-warning/5" : ""}>
                        <TableCell>
                          <Checkbox checked={r.selected} disabled={r.status === "error"} onCheckedChange={() => toggleRow(i)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {r.status === "create" && <Badge className="bg-success/10 text-success hover:bg-success/10 text-[10px] px-1.5 py-0">Novo</Badge>}
                            {r.status === "update" && <Badge className="bg-success/10 text-success hover:bg-success/10 text-[10px] px-1.5 py-0">Atualizar</Badge>}
                            {r.status === "warning" && <Badge className="bg-warning/10 text-warning hover:bg-warning/10 text-[10px] px-1.5 py-0">Aviso</Badge>}
                            {r.status === "error" && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Erro</Badge>}
                            {r.message && (
                              <span title={r.message} className="cursor-help">
                                <AlertCircle className={`h-3.5 w-3.5 shrink-0 ${r.status === "error" ? "text-destructive" : "text-warning"}`} />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{d.__clienteNome || "—"}</TableCell>
                        <TableCell>
                          {r.status === "error" && r.message === "Placa obrigatória"
                            ? <input type="text" placeholder="ABC1D23" className="border border-input rounded px-2 py-1 text-xs w-24 uppercase bg-background focus:outline-none focus:ring-1 focus:ring-ring" onChange={e => revalidateWithPlaca(i, e.target.value)} />
                            : <span className="font-mono text-xs font-bold">{d.__placa || "—"}</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs">{d.dataInicio ? new Date(d.dataInicio + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="text-xs">{d.dataFim ? new Date(d.dataFim + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="text-xs text-right">{d.valorDiario ? `R$ ${Number(d.valorDiario).toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-xs">{d.__telefone || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
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
                    <TableRow key={i} className={r.status === "error" ? "bg-destructive/5" : r.status === "warning" ? "bg-warning/5" : ""}>
                      <TableCell>
                        <Checkbox checked={r.selected} disabled={r.status === "error"} onCheckedChange={() => toggleRow(i)} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.rowIndex}</TableCell>
                      <TableCell>
                        {r.status === "create" && <Badge className="bg-success/10 text-success hover:bg-success/10">Novo</Badge>}
                        {r.status === "update" && <Badge className="bg-success/10 text-success hover:bg-success/10">Atualizar</Badge>}
                        {r.status === "warning" && <Badge className="bg-warning/10 text-warning hover:bg-warning/10">Aviso</Badge>}
                        {r.status === "error" && <Badge variant="destructive">Erro</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.status === "error" && r.message === "Placa obrigatória"
                          ? <input type="text" placeholder="ABC1D23" className="border border-input rounded px-2 py-1 text-xs w-28 uppercase bg-background focus:outline-none focus:ring-1 focus:ring-ring" onChange={e => revalidateWithPlaca(i, e.target.value)} />
                          : summarize(kind, r.data)
                        }
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.status === "error" && r.message === "Placa obrigatória" ? "Digite a placa para corrigir" : r.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
  const placa = d.__placa || "";
  const nome = d.__pendingClient?.nome || "";
  const tel = d.__pendingClient?.telefone || "";
  const client = [nome, tel].filter(Boolean).join(" · ") || "Locatário existente";
  return [placa, client].filter(Boolean).join(" — ");
}
