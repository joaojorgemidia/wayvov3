import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { Rental, Client, Motorcycle, CaucaoParcela } from "@/lib/types";
import { loadClients, saveClients, loadMotos, loadRentals } from "@/lib/store";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Plus, Upload, FileText, Loader2, Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskCpf, maskPhone, maskCep, isValidCpf, isValidEmail, isValidPhone, isValidCep, maskCurrency, parseBRL, maskPercent, maskKm, parseKm, formatBRL } from "@/lib/masks";
import { addMonths, format } from "date-fns";
import { getCnhStatus } from "@/lib/cnh-status";
import { AlertTriangle } from "lucide-react";


const TEMPO_MINIMO_OPTIONS = [3, 6, 12, 24, 26, 28, 30, 32, 34, 36];
const VENDEDORES = ["João Jorge", "Carlos Eduardo"];
const FREQUENCIA_OPTIONS: { value: Rental["frequenciaPagamento"]; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
];

const NIVEL_COMBUSTIVEL = ["Reserva", "1/4", "1/2", "3/4", "Cheio"];

const emptyClient = (): Client => ({
  id: crypto.randomUUID(), nome: "", cpf: "", cnh: "", cnhCategoria: "", cnhValidade: null,
  cnhPdfName: null, cnhPdfData: null, telefone: "", email: "",
  cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  comprovanteEnderecoName: null, comprovanteEnderecoData: null,
  emergenciaNome1: "", emergenciaTel1: "", emergenciaNome2: "", emergenciaTel2: "",
  observacoes: "", createdAt: new Date().toISOString().split("T")[0],
});

const STEPS = [
  { label: "Dados da Locação", num: 1 },
  { label: "Documento (CNH)", num: 2 },
  { label: "Contato e Endereço", num: 3 },
  { label: "Emergência", num: 4 },
];

const isCnhFile = (file: File) => {
  const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/jpg"];
  const validExts = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
  return validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
};

interface RentalWizardProps {
  rental: Rental;
  onSave: (rental: Rental, client: Client) => void;
  onCancel: () => void;
  motos: Motorcycle[];
  activeRentalMotoIds?: string[];
  activeRentalClientIds?: string[];
}

export default function RentalWizard({ rental, onSave, onCancel, motos, activeRentalMotoIds = [], activeRentalClientIds = [] }: RentalWizardProps) {
  const [form, setForm] = useState<Rental>({ ...rental });
  const isEdit = !!rental.createdAt;
  const { clients: existingClients } = useDataCacheSnapshot();
  const linkedClient = rental.clienteId ? existingClients.find(c => c.id === rental.clienteId) : undefined;
  const [clientForm, setClientForm] = useState<Client>(() => linkedClient ? { ...linkedClient } : emptyClient());
  const [clientMode, setClientMode] = useState<"new" | "existing">(linkedClient ? "existing" : "new");
  const [step, setStep] = useState(1);
  const [extracting, setExtracting] = useState(false);
  const [extractingComprovante, setExtractingComprovante] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [isCnhDragActive, setIsCnhDragActive] = useState(false);
  const [isComprovanteDragActive, setIsComprovanteDragActive] = useState(false);
  const cnhInputRef = useRef<HTMLInputElement>(null);
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  const availableMotos = motos.filter(m => (m.status === "disponivel" || m.id === form.motoId) && !activeRentalMotoIds.includes(m.id));

  // Auto-calc end date
  const updateEndDate = (startDate: string, months: number | null) => {
    if (!startDate || !months) return null;
    return format(addMonths(new Date(startDate + "T00:00:00"), months), "yyyy-MM-dd");
  };

  const setRentalField = <K extends keyof Rental>(key: K, val: Rental[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      if (key === "dataInicio" || key === "tempoMinimoContrato") {
        next.dataFimContrato = updateEndDate(
          key === "dataInicio" ? (val as string) : prev.dataInicio,
          key === "tempoMinimoContrato" ? (val as number) : prev.tempoMinimoContrato
        );
      }
      return next;
    });
  };

  // Caução parcelas
  const totalParcelas = form.parcelasCaucao.reduce((sum, p) => sum + p.valor, 0);
  const parcelasExcedem = totalParcelas > form.valorCaucao && form.valorCaucao > 0;

  const addParcela = () => {
    const remaining = Math.max(0, form.valorCaucao - totalParcelas);
    setForm(prev => ({
      ...prev,
      parcelasCaucao: [...prev.parcelasCaucao, { id: crypto.randomUUID(), valor: remaining, data: new Date().toISOString().split("T")[0], status: "pendente" }],
    }));
  };
  const updateParcela = (idx: number, patch: Partial<CaucaoParcela>) => {
    setForm(prev => ({
      ...prev,
      parcelasCaucao: prev.parcelasCaucao.map((p, i) => i === idx ? { ...p, ...patch } : p),
    }));
  };
  const removeParcela = (idx: number) => {
    setForm(prev => ({ ...prev, parcelasCaucao: prev.parcelasCaucao.filter((_, i) => i !== idx) }));
  };

  /* ---- CNH Upload ---- */
  const handleCnhUpload = async (file: File) => {
    if (!isCnhFile(file)) { toast.error("Envie PDF ou imagem da CNH."); return; }
    setExtracting(true);
    setClientForm(prev => ({ ...prev, cnhPdfName: file.name }));
    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const { data, error } = await supabase.functions.invoke("extract-cnh", { body: { pdfBase64: base64, mimeType: file.type } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na extração");
      const d = data.data;
      setClientForm(prev => ({
        ...prev,
        nome: d.nome || prev.nome,
        cpf: d.cpf ? maskCpf(d.cpf) : prev.cpf,
        cnh: d.numeroCnh || prev.cnh,
        cnhCategoria: d.categoria || prev.cnhCategoria,
        cnhValidade: d.validade || prev.cnhValidade,
        cnhPdfName: file.name,
        cnhPdfData: base64,
      }));
      toast.success("Dados da CNH extraídos!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao extrair CNH");
    } finally { setExtracting(false); }
  };

  const handleCnhDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsCnhDragActive(false);
    if (extracting) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleCnhUpload(file);
  };

  /* ---- CEP Lookup ---- */
  const handleCepLookup = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setClientForm(prev => ({ ...prev, rua: data.logradouro || prev.rua, bairro: data.bairro || prev.bairro, cidade: data.localidade || prev.cidade, estado: data.uf || prev.estado }));
    } catch { toast.error("Erro ao consultar CEP"); }
    finally { setCepLoading(false); }
  };

  /* ---- Comprovante Upload ---- */
  const handleComprovanteUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = file.type || "application/pdf";
    setClientForm(prev => ({ ...prev, comprovanteEnderecoName: file.name, comprovanteEnderecoData: `data:${mimeType};base64,${base64}` }));
    setExtractingComprovante(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-comprovante", { body: { fileBase64: base64, mimeType } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha");
      const d = data.data;
      setClientForm(prev => ({ ...prev, numero: d.numero || prev.numero, complemento: d.complemento || prev.complemento }));
      const extractedCep = (d.cep || "").replace(/\D/g, "");
      if (extractedCep.length === 8) {
        setClientForm(prev => ({ ...prev, cep: maskCep(extractedCep) }));
        try {
          const res = await fetch(`https://viacep.com.br/ws/${extractedCep}/json/`);
          const viaCep = await res.json();
          if (!viaCep.erro) {
            setClientForm(prev => ({ ...prev, rua: viaCep.logradouro || prev.rua, bairro: viaCep.bairro || prev.bairro, cidade: viaCep.localidade || prev.cidade, estado: viaCep.uf || prev.estado }));
            toast.success("Endereço extraído e confirmado via CEP!");
          }
        } catch { /* fallback */ }
      }
    } catch (err: any) { toast.error(err.message || "Erro ao extrair endereço"); }
    finally { setExtractingComprovante(false); }
  };

  /* ---- Validation ---- */
  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!form.motoId) return "Selecione uma moto";
      if (!form.vendedor.trim()) return "Vendedor é obrigatório";
      if (form.valorDiario <= 0) return "Valor do aluguel deve ser maior que 0";
      if (!form.dataInicio) return "Data de início é obrigatória";
      if (!form.horaInicio) return "Hora de início é obrigatória";
      if (!form.tempoMinimoContrato) return "Prazo do contrato é obrigatório";
      if (!form.nivelCombustivel) return "Nível de combustível é obrigatório";
      if (!form.frequenciaPagamento) return "Frequência de pagamento é obrigatória";
      if (!form.plano) return "Plano é obrigatório";
      if (form.caucaoParcelado && form.parcelasCaucao.reduce((s, p) => s + p.valor, 0) > form.valorCaucao) return "Parcelas do caução excedem o valor total";
      // Date overlap validation
      const allRentals = loadRentals();
      const overlapping = allRentals.find(r =>
        r.id !== form.id &&
        r.motoId === form.motoId &&
        r.status === "ativa" &&
        !r.dataFim // still active
      );
      if (overlapping) return `Esta moto já possui uma locação ativa (ID: ${overlapping.id.slice(0, 8)})`;
    }
    if (s === 2) {
      if (!clientForm.nome.trim()) return "Nome é obrigatório";
      if (!clientForm.cpf.trim()) return "CPF é obrigatório";
      if (!isValidCpf(clientForm.cpf)) return "CPF inválido";
      if (!clientForm.cnh.trim()) return "Nº da CNH é obrigatório";
      if (!clientForm.cnhCategoria.trim()) return "Categoria da CNH é obrigatória";
      if (!clientForm.cnhValidade) return "Validade da CNH é obrigatória";
      const cnhStatus = getCnhStatus(clientForm);
      if (cnhStatus.issues.includes("sem_categoria_a")) return "Categoria da CNH não habilita motocicleta (necessário ter A)";
      if (cnhStatus.issues.includes("vencida")) return "CNH vencida — não é possível prosseguir com a locação";
      // Duplicate CPF/CNH check
      const allClients = loadClients();
      const cpfClean = clientForm.cpf.replace(/\D/g, "");
      const dupCpf = allClients.find(c => c.id !== clientForm.id && c.cpf.replace(/\D/g, "") === cpfClean);
      if (dupCpf) return `CPF já cadastrado para ${dupCpf.nome}`;
      const dupCnh = allClients.find(c => c.id !== clientForm.id && c.cnh === clientForm.cnh);
      if (dupCnh) return `Nº da CNH já cadastrado para ${dupCnh.nome}`;
    }
    if (s === 3) {
      if (!clientForm.telefone.trim()) return "Telefone é obrigatório";
      if (!isValidPhone(clientForm.telefone)) return "Telefone inválido";
      if (!clientForm.email.trim()) return "E-mail é obrigatório";
      if (!isValidEmail(clientForm.email)) return "E-mail inválido";
      if (!clientForm.cep.trim()) return "CEP é obrigatório";
      if (!isValidCep(clientForm.cep)) return "CEP inválido";
      if (!clientForm.rua.trim()) return "Rua é obrigatória";
      if (!clientForm.numero.trim()) return "Número é obrigatório";
      if (!clientForm.bairro.trim()) return "Bairro é obrigatório";
      if (!clientForm.cidade.trim()) return "Cidade é obrigatória";
      if (!clientForm.estado.trim()) return "Estado é obrigatório";
    }
    if (s === 4) {
      if (!clientForm.emergenciaNome1.trim()) return "1º contato de emergência é obrigatório";
      if (!clientForm.emergenciaTel1.trim()) return "Telefone do 1º contato é obrigatório";
      if (!isValidPhone(clientForm.emergenciaTel1)) return "Telefone do 1º contato inválido";
      if (!clientForm.emergenciaNome2.trim()) return "2º contato de emergência é obrigatório";
      if (!clientForm.emergenciaTel2.trim()) return "Telefone do 2º contato é obrigatório";
      if (!isValidPhone(clientForm.emergenciaTel2)) return "Telefone do 2º contato inválido";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setStep(s => s - 1);
  };

  const handleSave = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }

    const finalClient = clientForm;
    // Save/update client to store
    const allClients = loadClients();
    const exists = allClients.find(c => c.id === clientForm.id);
    if (exists) saveClients(allClients.map(c => c.id === clientForm.id ? clientForm : c));
    else saveClients([...allClients, clientForm]);

    const finalRental: Rental = {
      ...form,
      clienteId: finalClient.id,
    };

    onSave(finalRental, finalClient);
  };

  const selectExistingClient = (clientId: string) => {
    setForm(prev => ({ ...prev, clienteId: clientId }));
    const client = existingClients.find(c => c.id === clientId);
    if (client) setClientForm({ ...client });
  };

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="space-y-3">
        <div className="flex gap-2">
          {STEPS.map(s => (
            <div key={s.num} className={`flex-1 text-center text-xs font-medium py-1.5 rounded ${step === s.num ? "bg-primary text-primary-foreground" : step > s.num ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
              {s.num}. {s.label}
            </div>
          ))}
        </div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" />
      </div>

      {/* STEP 1: Rental Data */}
      {step === 1 && (
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Placa da Moto *</Label>
              <SearchableSelect
                options={availableMotos.map(m => ({ value: m.id, label: `${m.placa}${m.modelo ? ` - ${m.modelo}` : ""}` }))}
                value={form.motoId}
                onValueChange={v => setRentalField("motoId", v)}
                placeholder="Selecione..."
                searchPlaceholder="Buscar placa..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Vendedor *</Label>
              <SearchableSelect
                options={VENDEDORES.map(v => ({ value: v, label: v }))}
                value={form.vendedor}
                onValueChange={v => setRentalField("vendedor", v)}
                placeholder="Selecione..."
                searchPlaceholder="Buscar vendedor..."
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Valor Aluguel *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input className="pl-9" value={form.valorDiario ? formatBRL(form.valorDiario) : ""} onChange={e => { const masked = maskCurrency(e.target.value); e.target.value = masked; setRentalField("valorDiario", parseBRL(masked)); }} placeholder="0,00" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Multa de Atraso</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input className="pl-9" value={form.multaAtraso ? formatBRL(form.multaAtraso) : ""} onChange={e => { const masked = maskCurrency(e.target.value); e.target.value = masked; setRentalField("multaAtraso", parseBRL(masked)); }} placeholder="0,00" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="flex items-center gap-1">Juros Atraso <InfoTooltip text="Juros cobrado sobre atraso, ao mês" /></Label>
              <div className="relative">
                <Input className="pr-14" value={form.jurosAtrasoMes ? formatBRL(form.jurosAtrasoMes) : ""} onChange={e => { const masked = maskPercent(e.target.value); e.target.value = masked; setRentalField("jurosAtrasoMes", parseBRL(masked)); }} placeholder="0,00" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%/mês</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Início da Locação *</Label>
              <Input type="date" value={form.dataInicio} onChange={e => setRentalField("dataInicio", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Hora *</Label>
              <Input type="time" value={form.horaInicio} onChange={e => setRentalField("horaInicio", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Próximo Pagamento</Label>
              <Input type="date" value={form.proximoPagamento || ""} onChange={e => setRentalField("proximoPagamento", e.target.value || null)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Prazo do Contrato *</Label>
              <SearchableSelect
                options={TEMPO_MINIMO_OPTIONS.map(m => ({ value: m.toString(), label: `${m} meses` }))}
                value={form.tempoMinimoContrato?.toString() || ""}
                onValueChange={v => setRentalField("tempoMinimoContrato", Number(v))}
                placeholder="Selecione..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Frequência Pagamentos *</Label>
              <SearchableSelect
                options={FREQUENCIA_OPTIONS.map(f => ({ value: f.value, label: f.label }))}
                value={form.frequenciaPagamento}
                onValueChange={v => setRentalField("frequenciaPagamento", v as Rental["frequenciaPagamento"])}
                placeholder="Selecione..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Final do Contrato</Label>
              <Input type="date" value={form.dataFimContrato || ""} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Local da Retirada</Label>
              <Input value={form.localRetirada} onChange={e => setRentalField("localRetirada", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Local da Devolução</Label>
              <Input value={form.localDevolucao} onChange={e => setRentalField("localDevolucao", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>KM na Entrega *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">KM</span>
                <Input className="pl-11" value={form.kmInicio ? maskKm(form.kmInicio.toString()) : ""} onChange={e => { const masked = maskKm(e.target.value); e.target.value = masked; setRentalField("kmInicio", parseKm(masked)); }} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Nível de Combustível *</Label>
              <SearchableSelect
                options={NIVEL_COMBUSTIVEL.map(n => ({ value: n, label: n }))}
                value={form.nivelCombustivel}
                onValueChange={v => setRentalField("nivelCombustivel", v)}
                placeholder="Selecione..."
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-primary font-bold text-base">Plano *</Label>
              <SearchableSelect
                options={[{ value: "aluguel", label: "Só Aluguel" }, { value: "moto_no_final", label: "Moto no Final" }]}
                value={form.plano}
                onValueChange={v => setRentalField("plano", v as Rental["plano"])}
                placeholder="Selecione o plano..."
                triggerClassName={form.plano ? "border-primary ring-1 ring-primary" : ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Raio de Circulação Permitido</Label>
              <Input value={form.raioCirculacao} onChange={e => setRentalField("raioCirculacao", e.target.value)} placeholder="Ex: 50km, Goiânia e região" />
            </div>
            <div className="grid gap-2">
              <Label>Seguro para Terceiros</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={form.seguroTerceiros} onCheckedChange={v => setRentalField("seguroTerceiros", v)} />
                <span className="text-sm">{form.seguroTerceiros ? "Sim" : "Não"}</span>
              </div>
            </div>
          </div>

          {/* Caução Section */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">Caução</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Valor do Caução</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input className="pl-9" value={form.valorCaucao ? formatBRL(form.valorCaucao) : ""} onChange={e => { const masked = maskCurrency(e.target.value); e.target.value = masked; setRentalField("valorCaucao", parseBRL(masked)); }} placeholder="0,00" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.caucaoParcelado} onCheckedChange={v => setRentalField("caucaoParcelado", v)} />
              <span className="text-sm">Caução Parcelado</span>
            </div>

            {form.caucaoParcelado && (
              <div className="space-y-2 border-t pt-3">
                {form.parcelasCaucao.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input className="w-28" value={p.valor ? formatBRL(p.valor) : ""} onChange={e => { const masked = maskCurrency(e.target.value); e.target.value = masked; updateParcela(i, { valor: parseBRL(masked) }); }} placeholder="0,00" />
                    </div>
                    <Input type="date" className="w-40" value={p.data} onChange={e => updateParcela(i, { data: e.target.value })} />
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input type="radio" name={`parcela-status-${i}`} checked={p.status === "recebido"} onChange={() => updateParcela(i, { status: "recebido" })} /> Recebido
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input type="radio" name={`parcela-status-${i}`} checked={p.status === "pendente"} onChange={() => updateParcela(i, { status: "pendente" })} /> Pendente
                    </label>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeParcela(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addParcela} className="gap-1"><Plus className="h-3 w-3" /> Adicionar parcela</Button>
                  <div className="text-sm">
                    <span className={parcelasExcedem ? "text-destructive font-semibold" : "text-muted-foreground"}>
                      Total: R$ {totalParcelas.toFixed(2)} / R$ {form.valorCaucao.toFixed(2)}
                    </span>
                    {parcelasExcedem && <p className="text-xs text-destructive">Parcelas excedem o valor do caução!</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Financial generation toggles */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">Gerar Cobranças Automáticas</h4>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.gerarCobrancaCaucao} onCheckedChange={v => setRentalField("gerarCobrancaCaucao", !!v)} />
              <span className="text-sm">Criar cobrança do caução no financeiro</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.gerarCobrancaPagamento} onCheckedChange={v => setRentalField("gerarCobrancaPagamento", !!v)} />
              <span className="text-sm">Criar todas as cobranças do período do contrato no financeiro</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Client - CNH */}
      {step === 2 && (
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="flex gap-2">
            <Button variant={clientMode === "new" ? "default" : "outline"} size="sm" onClick={() => setClientMode("new")}>Novo Cliente</Button>
            <Button variant={clientMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setClientMode("existing")}>Cliente Existente</Button>
          </div>

          {clientMode === "existing" && (
            <div className="grid gap-3 mb-3">
              <Label>Selecione o Cliente</Label>
              <SearchableSelect
                options={existingClients
                  .filter(c => !activeRentalClientIds.includes(c.id))
                  .map(c => ({ value: c.id, label: `${c.nome} — ${c.cpf}` }))}
                value={form.clienteId || ""}
                onValueChange={selectExistingClient}
                placeholder="Selecione..."
                searchPlaceholder="Buscar cliente..."
              />
            </div>
          )}

          {/* CNH upload + fields — always shown (for new or after selecting existing) */}
          {(clientMode === "new" || form.clienteId) && (
            <>
              {(() => {
                const s = getCnhStatus(clientForm);
                if (!s.label || s.issues.includes("sem_cnh")) return null;
                return (
                  <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${s.hasBlocker ? "bg-destructive/10 text-destructive border border-destructive/30" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30"}`}>
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{s.hasBlocker ? "Atenção: CNH inválida para locação" : "Aviso de CNH"}</p>
                      <p className="text-xs">{s.label}</p>
                    </div>
                  </div>
                );
              })()}
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center space-y-2 transition-colors ${isCnhDragActive ? "border-primary bg-primary/5" : clientForm.cnhPdfName ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50"} ${extracting ? "cursor-wait" : "cursor-pointer"}`}
                onClick={() => !extracting && cnhInputRef.current?.click()}
                onDragEnter={e => { e.preventDefault(); if (!extracting) setIsCnhDragActive(true); }}
                onDragOver={e => { e.preventDefault(); if (!extracting) setIsCnhDragActive(true); }}
                onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsCnhDragActive(false); }}
                onDrop={handleCnhDrop}
              >
                <input ref={cnhInputRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && !extracting) void handleCnhUpload(f); }} disabled={extracting} />
                <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Anexar CNH Digital (PDF ou Imagem)</p>
                <p className="text-xs text-muted-foreground">Arraste ou clique para selecionar</p>
                <Button type="button" variant="outline" size="sm" disabled={extracting} onClick={e => { e.stopPropagation(); cnhInputRef.current?.click(); }}>
                  {extracting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Extraindo...</> : <><Upload className="h-4 w-4 mr-1" />Selecionar</>}
                </Button>
                {clientForm.cnhPdfName && <p className="text-xs text-primary">📄 {clientForm.cnhPdfName}</p>}
              </div>

              <div className="grid gap-2">
                <Label>Nome completo *</Label>
                <Input value={clientForm.nome} onChange={e => setClientForm({ ...clientForm, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>CPF *</Label>
                  <Input value={clientForm.cpf} onChange={e => setClientForm({ ...clientForm, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} />
                </div>
                <div className="grid gap-2">
                  <Label>Nº da CNH *</Label>
                  <Input value={clientForm.cnh} onChange={e => setClientForm({ ...clientForm, cnh: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Categoria *</Label>
                  <Input value={clientForm.cnhCategoria} onChange={e => setClientForm({ ...clientForm, cnhCategoria: e.target.value })} placeholder="A, B, AB..." />
                </div>
                <div className="grid gap-2">
                  <Label>Validade *</Label>
                  <Input type="date" value={clientForm.cnhValidade || ""} onChange={e => setClientForm({ ...clientForm, cnhValidade: e.target.value || null })} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3: Contact & Address */}
      {step === 3 && (
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Telefone *</Label>
              <Input value={clientForm.telefone} onChange={e => setClientForm({ ...clientForm, telefone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
            </div>
            <div className="grid gap-2">
              <Label>E-mail *</Label>
              <Input type="email" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="email@exemplo.com" />
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center space-y-2 transition-colors ${isComprovanteDragActive ? "border-primary bg-primary/5" : clientForm.comprovanteEnderecoName ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50"} ${extractingComprovante ? "cursor-wait" : "cursor-pointer"}`}
            onClick={() => !extractingComprovante && comprovanteInputRef.current?.click()}
            onDragEnter={e => { e.preventDefault(); if (!extractingComprovante) setIsComprovanteDragActive(true); }}
            onDragOver={e => { e.preventDefault(); if (!extractingComprovante) setIsComprovanteDragActive(true); }}
            onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsComprovanteDragActive(false); }}
            onDrop={e => { e.preventDefault(); setIsComprovanteDragActive(false); if (!extractingComprovante && e.dataTransfer.files?.[0]) void handleComprovanteUpload(e.dataTransfer.files[0]); }}
          >
            <input ref={comprovanteInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={extractingComprovante} onChange={e => { if (e.target.files?.[0]) { void handleComprovanteUpload(e.target.files[0]); e.target.value = ""; } }} />
            <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Comprovante de Endereço</p>
            <p className="text-xs text-muted-foreground">Arraste ou clique — preenchimento automático</p>
            <Button type="button" variant="outline" size="sm" disabled={extractingComprovante} onClick={e => { e.stopPropagation(); comprovanteInputRef.current?.click(); }}>
              {extractingComprovante ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Extraindo...</> : <><Upload className="h-4 w-4 mr-1" />Anexar</>}
            </Button>
            {clientForm.comprovanteEnderecoName && <p className="text-xs text-primary">📄 {clientForm.comprovanteEnderecoName}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>CEP *</Label>
              <Input value={clientForm.cep} onChange={e => setClientForm({ ...clientForm, cep: maskCep(e.target.value) })} onBlur={e => handleCepLookup(e.target.value)} placeholder="00000-000" maxLength={9} />
              {cepLoading && <p className="text-xs text-muted-foreground">Buscando...</p>}
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Rua *</Label>
              <Input value={clientForm.rua} onChange={e => setClientForm({ ...clientForm, rua: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Nº *</Label>
              <Input value={clientForm.numero} onChange={e => setClientForm({ ...clientForm, numero: e.target.value })} />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Complemento</Label>
              <Input value={clientForm.complemento} onChange={e => setClientForm({ ...clientForm, complemento: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Bairro *</Label>
              <Input value={clientForm.bairro} onChange={e => setClientForm({ ...clientForm, bairro: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Cidade *</Label>
              <Input value={clientForm.cidade} onChange={e => setClientForm({ ...clientForm, cidade: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Estado *</Label>
              <Input value={clientForm.estado} onChange={e => setClientForm({ ...clientForm, estado: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="UF" maxLength={2} />
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Emergency + Checklist */}
      {step === 4 && (
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <p className="text-sm text-muted-foreground">Contatos de emergência do condutor</p>
          <div className="space-y-3 border rounded-lg p-4">
            <p className="text-sm font-semibold">1º Contato de Emergência</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Nome</Label>
                <Input value={clientForm.emergenciaNome1} onChange={e => setClientForm({ ...clientForm, emergenciaNome1: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input value={clientForm.emergenciaTel1} onChange={e => setClientForm({ ...clientForm, emergenciaTel1: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
              </div>
            </div>
          </div>
          <div className="space-y-3 border rounded-lg p-4">
            <p className="text-sm font-semibold">2º Contato de Emergência</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Nome</Label>
                <Input value={clientForm.emergenciaNome2} onChange={e => setClientForm({ ...clientForm, emergenciaNome2: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input value={clientForm.emergenciaTel2} onChange={e => setClientForm({ ...clientForm, emergenciaTel2: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Observações (opcional)</Label>
            <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={3} />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => step === 1 ? onCancel() : handleBack()}>
          {step === 1 ? "Cancelar" : "Voltar"}
        </Button>
        <div className="flex gap-2">
          {isEdit && step < STEPS.length && (
            <Button variant="secondary" onClick={handleSave}>Salvar Alterações</Button>
          )}
          {step < STEPS.length ? (
            <Button onClick={handleNext}>Próximo</Button>
          ) : (
            <Button onClick={handleSave}>Salvar Locação</Button>
          )}
        </div>
      </div>
    </div>
  );
}
