import { useState } from "react";
import { Rental, Motorcycle, Client, FinancialEntry } from "@/lib/types";
import { loadFinancial, saveFinancial, saveRentals, loadRentals } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { History } from "lucide-react";
import { toast } from "sonner";

const MOTIVOS_ENCERRAMENTO = [
  "Fim do contrato",
  "Devolução Antecipada",
  "Solicitação do cliente",
  "Inadimplência",
  "Sublocação",
  "Cliente não fez a Retirada",
  "Acidente / Sinistro",
  "Venda da moto",
  "Manutenção prolongada",
  "Descumprimento de contrato",
  "Outro",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motos: Motorcycle[];
  clients: Client[];
  onSaved: (rental: Rental, associatedCount: number) => void;
}

export default function HistoricalRentalDialog({ open, onOpenChange, motos, clients, onSaved }: Props) {
  const [motoId, setMotoId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const reset = () => {
    setMotoId(""); setClienteNome(""); setDataInicio(""); setDataFim("");
    setMotivo(""); setObservacoes("");
  };

  const handleSave = () => {
    if (!motoId) { toast.error("Selecione a placa"); return; }
    if (!clienteNome.trim()) { toast.error("Informe o nome do cliente"); return; }
    if (!dataInicio || !dataFim) { toast.error("Informe data de início e fim"); return; }
    if (dataFim < dataInicio) { toast.error("Data fim deve ser depois da data início"); return; }
    if (!motivo) { toast.error("Selecione o motivo do encerramento"); return; }

    const moto = motos.find(m => m.id === motoId);
    if (!moto) return;
    const nome = clienteNome.trim();

    const obs = [
      `--- Locação histórica ---`,
      `Motivo: ${motivo}`,
      `Período: ${new Date(dataInicio + "T00:00:00").toLocaleDateString("pt-BR")} → ${new Date(dataFim + "T00:00:00").toLocaleDateString("pt-BR")}`,
      observacoes ? `Obs: ${observacoes}` : "",
    ].filter(Boolean).join("\n");

    const rental: Rental = {
      id: crypto.randomUUID(),
      motoId, clienteId: "",
      vendedor: nome,
      dataInicio, horaInicio: "00:00",
      dataFim, dataFimContrato: dataFim,
      proximoPagamento: null,
      tempoMinimoContrato: null, frequenciaPagamento: "",
      valorDiario: 0, valorCaucao: 0, caucaoPendente: false, caucaoParcelado: false,
      parcelasCaucao: [],
      multaAtraso: 0, jurosAtrasoMes: 0,
      localRetirada: "", localDevolucao: "",
      kmInicio: 0, kmFim: null, nivelCombustivel: "", plano: "aluguel",
      raioCirculacao: "", seguroTerceiros: false,
      gerarCobrancaCaucao: false, gerarCobrancaPagamento: false,
      status: "finalizada",
      checklistRetirada: [], checklistDevolucao: [],
      observacoes: obs,
      createdAt: new Date().toISOString().split("T")[0],
    };

    // Persist rental
    const allRentals = loadRentals();
    saveRentals([...allRentals, rental]);

    // Auto-associate financial entries by placa + period
    const placa = (moto.placa || "").toUpperCase().trim();
    const allEntries = loadFinancial();
    let associated = 0;
    const updated: FinancialEntry[] = allEntries.map(e => {
      const ePlaca = (e.placa || "").toUpperCase().trim();
      if (!ePlaca || ePlaca !== placa) return e;
      if (!e.data || e.data < dataInicio || e.data > dataFim) return e;
      // Don't overwrite if already associated to a different rental
      if (e.rentalId && e.rentalId !== rental.id) return e;
      associated++;
      return {
        ...e,
        clienteNome: nome,
        rentalId: rental.id,
        motoId: moto.id,
      };
    });
    if (associated > 0) saveFinancial(updated);

    toast.success(`Locação cadastrada. ${associated} transação(ões) vinculada(s) ao cliente.`);
    onSaved(rental, associated);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Cadastrar locação encerrada
          </DialogTitle>
          <DialogDescription>
            Registre uma locação antiga para o histórico. As transações financeiras com a mesma placa nesse período serão automaticamente vinculadas ao cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Placa *</Label>
            <Select value={motoId} onValueChange={setMotoId}>
              <SelectTrigger><SelectValue placeholder="Selecione a moto" /></SelectTrigger>
              <SelectContent>
                {motos.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="font-mono font-bold">{m.placa}</span> — {m.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Input
              placeholder="Digite o nome do cliente"
              value={clienteNome}
              onChange={e => setClienteNome(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data início *</Label>
              <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data fim *</Label>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Motivo do encerramento *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
              <SelectContent>
                {MOTIVOS_ENCERRAMENTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={2} placeholder="Opcional" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar e vincular transações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}