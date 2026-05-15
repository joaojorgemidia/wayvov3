import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Motorcycle } from "@/lib/types";
import { AlertCircle } from "lucide-react";

interface SaleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moto: Motorcycle | null;
  onConfirm: (moto: Motorcycle) => void;
}

export function SaleDialog({ open, onOpenChange, moto, onConfirm }: SaleDialogProps) {
  const [valorVenda, setValorVenda] = useState<number | null>(null);
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().slice(0, 10));
  const [kmVenda, setKmVenda] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setValorVenda(null);
    setDataVenda(new Date().toISOString().slice(0, 10));
    setKmVenda(null);
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (valorVenda == null || valorVenda <= 0) e.valorVenda = "Valor de venda obrigatório e > 0";
    if (!dataVenda) e.dataVenda = "Data de venda obrigatória";
    if (kmVenda == null || kmVenda < 0) e.kmVenda = "KM final obrigatório";
    if (moto && kmVenda != null && moto.kmCompra != null && kmVenda < moto.kmCompra) {
      e.kmVenda = "KM final não pode ser menor que KM na compra";
    }
    return e;
  };

  const handleConfirm = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || !moto) return;
    onConfirm({
      ...moto,
      status: "vendida",
      valorVenda,
      dataVenda,
      kmVenda,
    });
    resetForm();
    onOpenChange(false);
  };

  if (!moto) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Venda</DialogTitle>
          <DialogDescription>
            Moto <span className="font-mono font-bold">{moto.placa}</span> — {moto.modelo || "sem modelo"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="grid gap-1">
            <Label className="flex items-center gap-1 text-xs">
              Valor de Venda <span className="text-destructive">*</span>
              <InfoTooltip text="Valor pelo qual o veículo foi vendido" />
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">R$</span>
              <Input
                type="number" step="0.01" min="0"
                value={valorVenda ?? ""}
                onChange={(e) => setValorVenda(e.target.value ? Number(e.target.value) : null)}
                placeholder="Ex: 12000"
                className={`pl-9 ${errors.valorVenda ? "border-destructive" : ""}`}
              />
            </div>
            {errors.valorVenda && <p className="text-[11px] text-destructive">{errors.valorVenda}</p>}
          </div>

          <div className="grid gap-1">
            <Label className="flex items-center gap-1 text-xs">
              Data da Venda <span className="text-destructive">*</span>
              <InfoTooltip text="Data em que a venda foi realizada" />
            </Label>
            <Input
              type="date"
              value={dataVenda}
              onChange={(e) => setDataVenda(e.target.value)}
              className={errors.dataVenda ? "border-destructive" : ""}
            />
            {errors.dataVenda && <p className="text-[11px] text-destructive">{errors.dataVenda}</p>}
          </div>

          <div className="grid gap-1">
            <Label className="flex items-center gap-1 text-xs">
              KM Final (hodômetro) <span className="text-destructive">*</span>
              <InfoTooltip text="Quilometragem do veículo no momento da venda" />
            </Label>
            <Input
              type="number" min="0"
              value={kmVenda ?? ""}
              onChange={(e) => setKmVenda(e.target.value ? Number(e.target.value) : null)}
              placeholder={moto.kmAtual != null ? `Atual: ${moto.kmAtual.toLocaleString("pt-BR")} km` : "Ex: 45000"}
              className={errors.kmVenda ? "border-destructive" : ""}
            />
            {errors.kmVenda && <p className="text-[11px] text-destructive">{errors.kmVenda}</p>}
          </div>

          {/* Preview */}
          {valorVenda && moto.valorCompra && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resultado na venda</span>
                <span className={`font-semibold ${valorVenda >= moto.valorCompra ? "text-success" : "text-destructive"}`}>
                  {valorVenda >= moto.valorCompra ? "+" : ""}R$ {(valorVenda - moto.valorCompra).toLocaleString("pt-BR")}
                </span>
              </div>
              {kmVenda != null && moto.kmCompra != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KM rodados na frota</span>
                  <span className="font-mono">{(kmVenda - moto.kmCompra).toLocaleString("pt-BR")} km</span>
                </div>
              )}
            </div>
          )}

          {Object.keys(errors).length > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">Preencha todos os campos obrigatórios.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => { resetForm(); onOpenChange(false); }}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} className="bg-violet-600 hover:bg-violet-700 text-white">
            Confirmar Venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
