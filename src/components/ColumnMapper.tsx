import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { AlertCircle } from "lucide-react";

export interface SystemField {
  key: string;
  label: string;
  required: boolean;
}

interface Props {
  open: boolean;
  columns: string[];
  samples: Record<string, string[]>;
  fields: SystemField[];
  onConfirm: (mapping: Record<string, string | null>) => void;
  onCancel: () => void;
}

const IGNORE = "__ignore__";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function autoMap(fileCol: string, fields: SystemField[]): string | null {
  const n = normalize(fileCol);
  // exact match on key or label
  for (const f of fields) {
    if (normalize(f.key) === n || normalize(f.label) === n) return f.key;
  }
  // substring match (either direction)
  for (const f of fields) {
    const nk = normalize(f.key);
    const nl = normalize(f.label);
    if (n.includes(nk) || nk.includes(n) || n.includes(nl) || nl.includes(n)) return f.key;
  }
  return null;
}

function buildInitialMapping(columns: string[], fields: SystemField[]): Record<string, string | null> {
  const assigned = new Set<string>();
  const mapping: Record<string, string | null> = {};
  for (const col of columns) {
    const match = autoMap(col, fields);
    if (match && !assigned.has(match)) {
      mapping[col] = match;
      assigned.add(match);
    } else {
      mapping[col] = null;
    }
  }
  return mapping;
}

export function ColumnMapper({ open, columns, samples, fields, onConfirm, onCancel }: Props) {
  const [mapping, setMapping] = useState<Record<string, string | null>>(
    () => buildInitialMapping(columns, fields)
  );

  const assignedFields = new Set(Object.values(mapping).filter(Boolean) as string[]);
  const missingRequired = fields.filter(f => f.required && !assignedFields.has(f.key));

  const setField = (col: string, value: string) => {
    setMapping(prev => {
      const next = { ...prev };
      // unassign any other col that had this field
      if (value !== IGNORE) {
        for (const c of Object.keys(next)) {
          if (next[c] === value && c !== col) next[c] = null;
        }
      }
      next[col] = value === IGNORE ? null : value;
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Mapeamento de colunas</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Relacione cada coluna do arquivo ao campo correspondente do sistema.
          </p>
        </DialogHeader>

        <div className="overflow-auto flex-1 px-6 py-4">
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr>
                <th className="text-left pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide w-[35%]">
                  Coluna no arquivo
                </th>
                <th className="text-left pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Exemplos
                </th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide w-44">
                  Campo do sistema
                </th>
              </tr>
            </thead>
            <tbody>
              {columns.map(col => (
                <tr key={col} className="align-middle">
                  <td className="pr-4 py-1">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{col}</span>
                  </td>
                  <td className="pr-4 py-1">
                    <div className="flex flex-wrap gap-1">
                      {(samples[col] ?? []).map((v, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-xs font-normal max-w-[110px] truncate"
                          title={v}
                        >
                          {v}
                        </Badge>
                      ))}
                      {!(samples[col]?.length) && (
                        <span className="text-xs text-muted-foreground italic">sem dados</span>
                      )}
                    </div>
                  </td>
                  <td className="py-1">
                    <Select value={mapping[col] ?? IGNORE} onValueChange={v => setField(col, v)}>
                      <SelectTrigger className="h-8 text-xs w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE} className="text-muted-foreground text-xs">
                          Ignorar
                        </SelectItem>
                        {fields.map(f => (
                          <SelectItem key={f.key} value={f.key} className="text-xs">
                            {f.label}{f.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {missingRequired.length > 0 && (
          <div className="mx-6 mb-3 flex items-center gap-2 text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Campo{missingRequired.length > 1 ? "s" : ""} obrigatório{missingRequired.length > 1 ? "s" : ""} não mapeado{missingRequired.length > 1 ? "s" : ""}:{" "}
              <strong>{missingRequired.map(f => f.label).join(", ")}</strong>
            </span>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onConfirm(mapping)} disabled={missingRequired.length > 0}>
            Confirmar mapeamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
