import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { localToday } from "@/lib/utils";
import { Client } from "@/lib/types";
import { saveClients } from "@/lib/store";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Plus, Search, Pencil, Trash2, Users, Upload, FileText, Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskCpf, maskPhone, maskCep, isValidCpf, isValidEmail, isValidPhone, isValidCep } from "@/lib/masks";
import { getCnhStatus } from "@/lib/cnh-status";
import { ensureVistoriaFolders } from "@/lib/vistoria-folders";
import { uploadDocument, downloadDocument, buildClientDocPath } from "@/lib/document-storage";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertTriangle } from "lucide-react";

const emptyClient = (): Client => ({
  id: crypto.randomUUID(), nome: "", cpf: "", cnh: "", cnhCategoria: "", cnhValidade: null,
  cnhPdfName: null, cnhPdfData: null, cnhStoragePath: null, telefone: "", email: "",
  cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  comprovanteEnderecoName: null, comprovanteEnderecoData: null, comprovanteEnderecoStoragePath: null,
  emergenciaNome1: "", emergenciaTel1: "", emergenciaNome2: "", emergenciaTel2: "",
  observacoes: "", createdAt: localToday(),
});

const STEPS = [
  { label: "Documento (CNH)", num: 1 },
  { label: "Contato e Endereço", num: 2 },
  { label: "Emergência", num: 3 },
];

const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

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

export default function ClientesPage() {
  const cache = useDataCacheSnapshot();
  const { activeCompany } = useCompany();
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => { setClients(cache.clients); }, [cache.clients]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Client>(emptyClient());
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [step, setStep] = useState(1);
  const [extracting, setExtracting] = useState(false);
  const [extractingComprovante, setExtractingComprovante] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [isCnhDragActive, setIsCnhDragActive] = useState(false);
  const [isComprovanteDragActive, setIsComprovanteDragActive] = useState(false);
  const cnhInputRef = useRef<HTMLInputElement>(null);
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  const persist = (d: Client[]) => { setClients(d); saveClients(d); };

  const filtered = useMemo(() => clients.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf.includes(search) ||
    c.telefone.includes(search)
  ), [clients, search]);

  /* ---- CNH Upload & Extraction ---- */
  const handleCnhUpload = async (file: File) => {
    if (!isCnhFile(file)) {
      toast.error("Envie um arquivo PDF ou imagem da CNH digital.");
      return;
    }

    setExtracting(true);
    setForm(prev => ({ ...prev, cnhPdfName: file.name }));

    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      // Upload para storage (persistente)
      let storagePath: string | null = null;
      if (activeCompany?.id) {
        try {
          storagePath = await uploadDocument(
            "client-documents",
            buildClientDocPath(activeCompany.id, form.id, "cnh", file.name),
            file,
          );
        } catch (uploadErr) {
          console.error("CNH upload error:", uploadErr);
          toast.warning("Não foi possível salvar a CNH no servidor. O download pode não funcionar após recarregar.");
        }
      }

      const { data, error } = await supabase.functions.invoke("extract-cnh", {
        body: { pdfBase64: base64, mimeType: file.type },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na extração");

      const d = data.data;
      setForm(prev => ({
        ...prev,
        nome: d.nome || prev.nome,
        cpf: d.cpf ? maskCpf(d.cpf) : prev.cpf,
        cnh: d.numeroCnh || prev.cnh,
        cnhCategoria: d.categoria || prev.cnhCategoria,
        cnhValidade: d.validade || prev.cnhValidade,
        cnhPdfName: file.name,
        cnhPdfData: base64,
        cnhStoragePath: storagePath ?? prev.cnhStoragePath,
      }));
      toast.success("Dados da CNH extraídos com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao extrair dados da CNH");
    } finally {
      setExtracting(false);
    }
  };

  const handleCnhDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsCnhDragActive(false);

    if (extracting) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    void handleCnhUpload(file);
  };

  const handleCnhFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file || extracting) return;

    void handleCnhUpload(file);
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
      setForm(prev => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }));
    } catch { toast.error("Erro ao consultar CEP"); }
    finally { setCepLoading(false); }
  };

  /* ---- Comprovante Upload & Address Extraction ---- */
  const handleComprovanteUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    setForm(prev => ({ ...prev, comprovanteEnderecoName: file.name, comprovanteEnderecoData: `data:${mimeType};base64,${base64}` }));
    setExtractingComprovante(true);

    if (activeCompany?.id) {
      try {
        const path = await uploadDocument(
          "client-documents",
          buildClientDocPath(activeCompany.id, form.id, "comprovante", file.name),
          file,
          mimeType,
        );
        setForm(prev => ({ ...prev, comprovanteEnderecoStoragePath: path }));
      } catch (uploadErr) {
        console.error("Comprovante upload error:", uploadErr);
        toast.warning("Não foi possível salvar o comprovante no servidor. O download pode não funcionar após recarregar.");
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke("extract-comprovante", {
        body: { fileBase64: base64, mimeType },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na extração");

      const d = data.data;
      const extractedCep = (d.cep || "").replace(/\D/g, "");
      const extractedNumero = d.numero || "";
      const extractedComplemento = d.complemento || "";

      // Always use número and complemento from the document
      setForm(prev => ({
        ...prev,
        numero: extractedNumero || prev.numero,
        complemento: extractedComplemento || prev.complemento,
      }));

      // Validate CEP via ViaCEP for rua, bairro, cidade, estado
      if (extractedCep.length === 8) {
        setForm(prev => ({ ...prev, cep: maskCep(extractedCep) }));
        setCepLoading(true);
        try {
          const res = await fetch(`https://viacep.com.br/ws/${extractedCep}/json/`);
          const viaCep = await res.json();
          if (viaCep.erro) {
            toast.warning("CEP extraído do comprovante não foi encontrado no ViaCEP. Verifique manualmente.");
            // Fallback: use AI data
            setForm(prev => ({
              ...prev,
              rua: d.rua || prev.rua,
              bairro: d.bairro || prev.bairro,
              cidade: d.cidade || prev.cidade,
              estado: d.estado || prev.estado,
            }));
          } else {
            // Cross-validate: compare AI data with ViaCEP
            const mismatches: string[] = [];
            if (d.cidade && viaCep.localidade && d.cidade.toLowerCase().trim() !== viaCep.localidade.toLowerCase().trim()) {
              mismatches.push(`Cidade: documento="${d.cidade}" / confirmado="${viaCep.localidade}"`);
            }
            if (d.estado && viaCep.uf && d.estado.toUpperCase().trim() !== viaCep.uf.toUpperCase().trim()) {
              mismatches.push(`Estado: documento="${d.estado}" / confirmado="${viaCep.uf}"`);
            }

            // Always use ViaCEP (authoritative) for rua, bairro, cidade, estado
            setForm(prev => ({
              ...prev,
              rua: viaCep.logradouro || d.rua || prev.rua,
              bairro: viaCep.bairro || d.bairro || prev.bairro,
              cidade: viaCep.localidade || d.cidade || prev.cidade,
              estado: viaCep.uf || d.estado || prev.estado,
            }));

            if (mismatches.length > 0) {
              toast.warning(`Divergência entre documento e CEP: ${mismatches.join("; ")}. Dados do CEP foram priorizados.`);
            } else {
              toast.success("Endereço extraído e confirmado via CEP com sucesso!");
            }
          }
        } catch {
          toast.warning("Não foi possível validar o CEP. Dados do documento foram usados.");
          setForm(prev => ({
            ...prev,
            rua: d.rua || prev.rua,
            bairro: d.bairro || prev.bairro,
            cidade: d.cidade || prev.cidade,
            estado: d.estado || prev.estado,
          }));
        } finally {
          setCepLoading(false);
        }
      } else {
        // No valid CEP extracted, use AI data as fallback
        setForm(prev => ({
          ...prev,
          cep: d.cep || prev.cep,
          rua: d.rua || prev.rua,
          bairro: d.bairro || prev.bairro,
          cidade: d.cidade || prev.cidade,
          estado: d.estado || prev.estado,
        }));
        toast.warning("CEP não identificado no comprovante. Preencha o CEP manualmente para validar o endereço.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao extrair endereço. Preencha manualmente.");
    } finally {
      setExtractingComprovante(false);
    }
  };

  /* ---- Validation ---- */
  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!form.nome.trim()) return "Nome é obrigatório";
      if (!form.cpf.trim()) return "CPF é obrigatório";
      if (!isValidCpf(form.cpf)) return "CPF inválido";
      const cpfClean = form.cpf.replace(/\D/g, "");
      const dup = clients.find(c => c.id !== form.id && c.cpf.replace(/\D/g, "") === cpfClean);
      if (dup) return `CPF já cadastrado para ${dup.nome}`;
      if (!form.cnh.trim()) return "Nº da CNH é obrigatório";
      if (form.cnh.replace(/\D/g, "").length < 9) return "Nº da CNH deve ter pelo menos 9 dígitos";
      if (!form.cnhCategoria.trim()) return "Categoria da CNH é obrigatória";
      if (!form.cnhValidade) return "Validade da CNH é obrigatória";
    }
    if (s === 2) {
      if (!form.telefone.trim()) return "Telefone é obrigatório";
      if (!isValidPhone(form.telefone)) return "Telefone inválido (10 ou 11 dígitos)";
      if (!form.email.trim()) return "E-mail é obrigatório";
      if (!isValidEmail(form.email)) return "E-mail inválido";
      if (!form.cep.trim()) return "CEP é obrigatório";
      if (!isValidCep(form.cep)) return "CEP inválido (8 dígitos)";
      if (!form.rua.trim()) return "Rua é obrigatória";
      if (!form.numero.trim()) return "Número é obrigatório";
      if (!form.bairro.trim()) return "Bairro é obrigatório";
      if (!form.cidade.trim()) return "Cidade é obrigatória";
      if (!form.estado.trim()) return "Estado é obrigatório";
      if (form.estado.replace(/[^A-Za-z]/g, "").length !== 2) return "Estado deve ter 2 letras (UF)";
    }
    if (s === 3) {
      if (!form.emergenciaNome1.trim()) return "Nome do 1º contato de emergência é obrigatório";
      if (!form.emergenciaTel1.trim()) return "Telefone do 1º contato é obrigatório";
      if (!isValidPhone(form.emergenciaTel1)) return "Telefone do 1º contato inválido";
      if (!form.emergenciaNome2.trim()) return "Nome do 2º contato de emergência é obrigatório";
      if (!form.emergenciaTel2.trim()) return "Telefone do 2º contato é obrigatório";
      if (!isValidPhone(form.emergenciaTel2)) return "Telefone do 2º contato inválido";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    setStep(s => s + 1);
  };

  const handleSave = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    const exists = clients.find(c => c.id === form.id);
    if (exists) persist(clients.map(c => c.id === form.id ? form : c));
    else persist([...clients, form]);
    // Cria/garante subpasta do locatário em todas as placas com locação ativa para ele
    if (form.nome) {
      const placasAtivas = cache.rentals
        .filter((r) => r.status === "ativa" && r.clienteId === form.id)
        .map((r) => cache.motos.find((m) => m.id === r.motoId)?.placa)
        .filter((p): p is string => !!p);
      if (placasAtivas.length > 0) {
        ensureVistoriaFolders({ placas: placasAtivas, locatarios: [form.nome] });
      }
    }
    setDialogOpen(false);
    toast.success(mode === "add" ? "Cliente cadastrado!" : "Cliente atualizado!");
  };

  const handleDelete = (id: string) => {
    if (confirm("Remover este cliente?")) persist(clients.filter(c => c.id !== id));
  };

  const { canCreate, canEdit, canDelete } = usePermissions();
  const openAdd = () => { setForm(emptyClient()); setMode("add"); setStep(1); setDialogOpen(true); };
  const openEdit = (c: Client) => { setForm({ ...c }); setMode("edit"); setStep(1); setDialogOpen(true); };

  const endereco = (c: Client) => [c.rua, c.numero, c.complemento, c.bairro, c.cidade, c.estado].filter(Boolean).join(", ");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        {canCreate && <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Novo Cliente</Button>}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum cliente cadastrado</p>
          <p className="text-sm text-muted-foreground">Clique em "Novo Cliente" para começar</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => {
            const cnhStatus = getCnhStatus(c);
            return (
            <Card key={c.id} className={`p-4 space-y-3 ${cnhStatus.hasBlocker ? "border-destructive/60" : cnhStatus.issues.includes("vence_em_breve") ? "border-yellow-500/60" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{c.nome}</h3>
                  <p className="text-sm text-muted-foreground">CPF: {c.cpf || "—"}</p>
                </div>
                <div className="flex gap-1">
                  {canEdit && <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </div>
              {cnhStatus.label && (
                <div className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${cnhStatus.hasBlocker ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"}`}>
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{cnhStatus.label}</span>
                </div>
              )}
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">CNH:</span> {c.cnh || "—"} ({c.cnhCategoria || "—"}) {c.cnhValidade ? `val. ${new Date(c.cnhValidade + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}</p>
                <p><span className="text-muted-foreground">Tel:</span> {c.telefone || "—"}</p>
                <p><span className="text-muted-foreground">Email:</span> {c.email || "—"}</p>
                <p><span className="text-muted-foreground">End:</span> {endereco(c) || "—"}</p>
              </div>
              {(c.cnhStoragePath || c.cnhPdfData || c.cnhPdfName || c.comprovanteEnderecoStoragePath || c.comprovanteEnderecoData || c.comprovanteEnderecoName) && (
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  {(c.cnhStoragePath || c.cnhPdfData || c.cnhPdfName) && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                      try {
                        if (c.cnhStoragePath) {
                          await downloadDocument("client-documents", c.cnhStoragePath, c.cnhPdfName || "cnh.pdf");
                        } else if (c.cnhPdfData) {
                          const link = document.createElement("a");
                          link.href = `data:application/pdf;base64,${c.cnhPdfData}`;
                          link.download = c.cnhPdfName || "cnh.pdf";
                          link.click();
                        } else {
                          toast.warning("Esta CNH é de um cadastro antigo. Reanexe o arquivo na edição do cliente para habilitar o download.");
                        }
                      } catch (err) {
                        console.error(err);
                        toast.error("Não foi possível baixar a CNH.");
                      }
                    }}><Download className="h-3 w-3" />CNH</Button>
                  )}
                  {(c.comprovanteEnderecoStoragePath || c.comprovanteEnderecoData || c.comprovanteEnderecoName) && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                      try {
                        if (c.comprovanteEnderecoStoragePath) {
                          await downloadDocument("client-documents", c.comprovanteEnderecoStoragePath, c.comprovanteEnderecoName || "comprovante");
                        } else if (c.comprovanteEnderecoData) {
                          const link = document.createElement("a");
                          link.href = c.comprovanteEnderecoData;
                          link.download = c.comprovanteEnderecoName || "comprovante";
                          link.click();
                        } else {
                          toast.warning("Este comprovante é de um cadastro antigo. Reanexe o arquivo na edição do cliente para habilitar o download.");
                        }
                      } catch (err) {
                        console.error(err);
                        toast.error("Não foi possível baixar o comprovante.");
                      }
                    }}><Download className="h-3 w-3" />Comprovante</Button>
                  )}
                </div>
              )}
              {c.observacoes && <p className="text-xs text-muted-foreground border-t pt-2">{c.observacoes}</p>}
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Novo Cliente" : `Editar ${form.nome}`}</DialogTitle>
          </DialogHeader>

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

          {step === 1 && (
            <div className="grid gap-4 py-2">
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center space-y-2 transition-colors ${
                  isCnhDragActive
                    ? "border-primary bg-primary/5"
                    : form.cnhPdfName
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                } ${extracting ? "cursor-wait" : "cursor-pointer"}`}
                onClick={() => !extracting && cnhInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!extracting) setIsCnhDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!extracting) setIsCnhDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setIsCnhDragActive(false);
                  }
                }}
                onDrop={handleCnhDrop}
              >
                <input
                  ref={cnhInputRef}
                  id="cnh-upload"
                  type="file"
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleCnhFileSelect}
                  disabled={extracting}
                />
                <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Anexar CNH Digital (PDF ou Imagem)</p>
                <p className="text-xs text-muted-foreground">Arraste o arquivo aqui ou clique para selecionar.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={extracting}
                  onClick={(e) => {
                    e.stopPropagation();
                    cnhInputRef.current?.click();
                  }}
                >
                  <span className="flex items-center gap-2">
                    {extracting ? <><Loader2 className="h-4 w-4 animate-spin" />Extraindo...</> : <><Upload className="h-4 w-4" />Selecionar Arquivo</>}
                  </span>
                </Button>
                {form.cnhPdfName && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-primary">📄 {form.cnhPdfName}</p>
                    {(form.cnhStoragePath || form.cnhPdfData) && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (form.cnhStoragePath) {
                            await downloadDocument("client-documents", form.cnhStoragePath, form.cnhPdfName || "cnh.pdf");
                          } else if (form.cnhPdfData) {
                            const link = document.createElement("a");
                            link.href = `data:application/pdf;base64,${form.cnhPdfData}`;
                            link.download = form.cnhPdfName || "cnh.pdf";
                            link.click();
                          }
                        } catch (err) { console.error(err); toast.error("Falha ao baixar CNH"); }
                      }}><Download className="h-3 w-3" />Baixar</Button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label className="flex items-center gap-1">Nome completo <InfoTooltip text="Nome conforme consta na CNH" /></Label>
                <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do condutor" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">CPF <InfoTooltip text="CPF do condutor" /></Label>
                  <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} />
                </div>
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">Nº da CNH <InfoTooltip text="Número de registro da habilitação" /></Label>
                  <Input value={form.cnh} onChange={e => setForm({ ...form, cnh: e.target.value })} placeholder="00000000000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">Categoria <InfoTooltip text="Categoria da habilitação (A, B, AB, etc)" /></Label>
                  <Input value={form.cnhCategoria} onChange={e => setForm({ ...form, cnhCategoria: e.target.value })} placeholder="A, B, AB..." />
                </div>
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">Validade <InfoTooltip text="Data de validade da CNH" /></Label>
                  <Input type="date" value={form.cnhValidade || ""} onChange={e => setForm({ ...form, cnhValidade: e.target.value || null })} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">Telefone <InfoTooltip text="Número principal de contato" /></Label>
                  <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
                </div>
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">E-mail <InfoTooltip text="E-mail para comunicações" /></Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
                </div>
              </div>

              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center space-y-2 transition-colors ${
                  isComprovanteDragActive
                    ? "border-primary bg-primary/5"
                    : form.comprovanteEnderecoName
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                } ${extractingComprovante ? "cursor-wait" : "cursor-pointer"}`}
                onClick={() => !extractingComprovante && comprovanteInputRef.current?.click()}
                onDragEnter={(e) => { e.preventDefault(); if (!extractingComprovante) setIsComprovanteDragActive(true); }}
                onDragOver={(e) => { e.preventDefault(); if (!extractingComprovante) setIsComprovanteDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsComprovanteDragActive(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsComprovanteDragActive(false);
                  if (extractingComprovante) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleComprovanteUpload(file);
                }}
              >
                <input
                  ref={comprovanteInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  disabled={extractingComprovante}
                  onChange={e => { if (e.target.files?.[0]) { void handleComprovanteUpload(e.target.files[0]); e.target.value = ""; } }}
                />
                <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Comprovante de Endereço (PDF/Imagem)</p>
                <p className="text-xs text-muted-foreground">Arraste ou clique — o endereço será preenchido automaticamente</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={extractingComprovante}
                  onClick={(e) => { e.stopPropagation(); comprovanteInputRef.current?.click(); }}
                >
                  <span className="flex items-center gap-2">
                    {extractingComprovante ? <><Loader2 className="h-4 w-4 animate-spin" />Extraindo endereço...</> : <><Upload className="h-4 w-4" />Anexar</>}
                  </span>
                </Button>
                {form.comprovanteEnderecoName && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-primary">📄 {form.comprovanteEnderecoName}</p>
                    {(form.comprovanteEnderecoStoragePath || form.comprovanteEnderecoData) && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (form.comprovanteEnderecoStoragePath) {
                            await downloadDocument("client-documents", form.comprovanteEnderecoStoragePath, form.comprovanteEnderecoName || "comprovante");
                          } else if (form.comprovanteEnderecoData) {
                            const link = document.createElement("a");
                            link.href = form.comprovanteEnderecoData!;
                            link.download = form.comprovanteEnderecoName || "comprovante";
                            link.click();
                          }
                        } catch (err) { console.error(err); toast.error("Falha ao baixar comprovante"); }
                      }}><Download className="h-3 w-3" />Baixar</Button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2 col-span-1">
                  <Label className="flex items-center gap-1">CEP <InfoTooltip text="Pressione Tab ou clique fora para buscar o endereço" /></Label>
                  <Input value={form.cep} onChange={e => setForm({ ...form, cep: maskCep(e.target.value) })} onBlur={e => handleCepLookup(e.target.value)} placeholder="00000-000" maxLength={9} />
                  {cepLoading && <p className="text-xs text-muted-foreground">Buscando...</p>}
                </div>
                <div className="grid gap-2 col-span-2">
                  <Label>Rua</Label>
                  <Input value={form.rua} onChange={e => setForm({ ...form, rua: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1">Nº <InfoTooltip text="Número da residência" /></Label>
                  <Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} />
                </div>
                <div className="grid gap-2 col-span-2">
                  <Label className="flex items-center gap-1">Qd/Lote (Complemento) <InfoTooltip text="Quadra, lote, bloco, apartamento, etc." /></Label>
                  <Input value={form.complemento} onChange={e => setForm({ ...form, complemento: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label>Bairro</Label>
                  <Input value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Estado</Label>
                  <Input value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="UF" maxLength={2} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 py-2">
              <p className="text-sm text-muted-foreground">Informe 2 contatos de emergência do condutor.</p>
              <div className="space-y-3 border rounded-lg p-4">
                <p className="text-sm font-semibold">1º Contato de Emergência</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Nome</Label>
                    <Input value={form.emergenciaNome1} onChange={e => setForm({ ...form, emergenciaNome1: e.target.value })} placeholder="Nome completo" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Telefone</Label>
                    <Input value={form.emergenciaTel1} onChange={e => setForm({ ...form, emergenciaTel1: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
                  </div>
                </div>
              </div>
              <div className="space-y-3 border rounded-lg p-4">
                <p className="text-sm font-semibold">2º Contato de Emergência</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Nome</Label>
                    <Input value={form.emergenciaNome2} onChange={e => setForm({ ...form, emergenciaNome2: e.target.value })} placeholder="Nome completo" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Telefone</Label>
                    <Input value={form.emergenciaTel2} onChange={e => setForm({ ...form, emergenciaTel2: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Observações (opcional)</Label>
                <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={3} />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => step === 1 ? setDialogOpen(false) : setStep(s => s - 1)}>
              {step === 1 ? "Cancelar" : "Voltar"}
            </Button>
            {step < STEPS.length ? (
              <Button onClick={handleNext}>Próximo</Button>
            ) : (
              <Button onClick={handleSave}>Salvar</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
