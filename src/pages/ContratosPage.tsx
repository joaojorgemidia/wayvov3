import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  FileText, Upload, Download, ExternalLink, Plus, Trash2,
  FileSignature, Info, Loader2, RefreshCw,
} from "lucide-react";

// ─── tipos ───────────────────────────────────────────────────────────────────
interface ContractTemplate {
  id: string;
  nome: string;
  descricao?: string;
  storage_path: string;
  created_at: string;
}

interface Contract {
  id: string;
  nome: string;
  status: "gerado" | "enviado" | "assinado" | "cancelado";
  rental_id: string | null;
  template_id: string | null;
  storage_path: string | null;
  autentique_url: string | null;
  autentique_signed_url: string | null;
  created_at: string;
  signed_at: string | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  gerado: "Gerado",
  enviado: "Aguardando assinatura",
  assinado: "Assinado",
  cancelado: "Cancelado",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  gerado: "secondary",
  enviado: "default",
  assinado: "outline",
  cancelado: "destructive",
};

// Variáveis disponíveis para uso nos templates DOCX
const PLACEHOLDERS = [
  { key: "{LOCAT_NOME}", desc: "Nome do locatário" },
  { key: "{LOCAT_ENDERECO}", desc: "Endereço completo do locatário" },
  { key: "{LOCAT_TELEFONE}", desc: "Telefone do locatário" },
  { key: "{LOCATARIO_CPF}", desc: "CPF/CNPJ do locatário" },
  { key: "{COND_N-CNH}", desc: "Número da CNH" },
  { key: "{LOCC_N}", desc: "Número do contrato" },
  { key: "{LOCC_D-INICIO}", desc: "Data de início da locação" },
  { key: "{LOCC_D-FIM}", desc: "Data de fim do contrato" },
  { key: "{LOCC_V-ALUGUEL}", desc: "Valor do aluguel" },
  { key: "{LOCC_V-CAUCAO}", desc: "Valor da caução" },
  { key: "{PLACA}", desc: "Placa da moto" },
  { key: "{MODELO}", desc: "Modelo da moto" },
  { key: "{ANO}", desc: "Ano da moto" },
  { key: "{COR}", desc: "Cor da moto" },
  { key: "{CHASSI}", desc: "Chassi da moto" },
  { key: "{RENAVAM}", desc: "RENAVAM da moto" },
  { key: "{Nº_MOTOR}", desc: "Número do motor" },
  { key: "{KM_ATUAL}", desc: "KM na retirada" },
  { key: "{NIVEL_COMBUSTIVEL}", desc: "Nível de combustível" },
];

// ─── componente principal ─────────────────────────────────────────────────────
export default function ContratosPage() {
  const { currentCompanyId } = useCompany();
  const { rentals, motos, clients } = useDataCacheSnapshot();

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"contratos" | "templates">("contratos");

  // Upload de template
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadNome, setUploadNome] = useState("");
  const [uploadDescricao, setUploadDescricao] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Geração de contrato
  const [gerarOpen, setGerarOpen] = useState(false);
  const [gerarRentalId, setGerarRentalId] = useState("");
  const [gerarTemplateId, setGerarTemplateId] = useState("");
  const [gerarEnviarAut, setGerarEnviarAut] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Confirmação de exclusão de template
  const [deleteTmpl, setDeleteTmpl] = useState<ContractTemplate | null>(null);

  useEffect(() => {
    if (currentCompanyId) fetchAll();
  }, [currentCompanyId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [tmplRes, ctrRes] = await Promise.all([
        (supabase as any)
          .from("contract_templates")
          .select("*")
          .eq("company_id", currentCompanyId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("contracts")
          .select("*")
          .eq("company_id", currentCompanyId)
          .order("created_at", { ascending: false }),
      ]);
      setTemplates((tmplRes.data as ContractTemplate[]) || []);
      setContracts((ctrRes.data as Contract[]) || []);
    } finally {
      setLoading(false);
    }
  }

  // ── Upload de template ──
  async function handleUpload() {
    if (!uploadFile || !uploadNome.trim()) {
      toast.error("Nome e arquivo são obrigatórios");
      return;
    }
    setUploading(true);
    try {
      const ext = uploadFile.name.split(".").pop() || "docx";
      const safeName = uploadNome.trim().replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      const path = `templates/${currentCompanyId}/${Date.now()}_${safeName}.${ext}`;

      const { error: upErr } = await supabase.storage.from("contratos").upload(path, uploadFile, {
        contentType: uploadFile.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error: dbErr } = await (supabase as any).from("contract_templates").insert({
        company_id: currentCompanyId,
        nome: uploadNome.trim(),
        descricao: uploadDescricao.trim() || null,
        storage_path: path,
      });
      if (dbErr) throw dbErr;

      toast.success("Template enviado com sucesso");
      setUploadOpen(false);
      setUploadNome("");
      setUploadDescricao("");
      setUploadFile(null);
      fetchAll();
    } catch (e: unknown) {
      toast.error("Erro ao enviar template: " + (e instanceof Error ? e.message : "erro desconhecido"));
    } finally {
      setUploading(false);
    }
  }

  // ── Download de template ──
  async function downloadTemplate(t: ContractTemplate) {
    const { data, error } = await supabase.storage.from("contratos").createSignedUrl(t.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error("Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  // ── Excluir template ──
  async function handleDeleteTemplate(t: ContractTemplate) {
    await supabase.storage.from("contratos").remove([t.storage_path]);
    await (supabase as any).from("contract_templates").delete().eq("id", t.id);
    toast.success("Template excluído");
    setDeleteTmpl(null);
    fetchAll();
  }

  // ── Gerar contrato ──
  async function handleGerar() {
    if (!gerarRentalId || !gerarTemplateId) {
      toast.error("Selecione a locação e o template");
      return;
    }
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-contrato", {
        body: {
          rental_id: gerarRentalId,
          template_id: gerarTemplateId,
          enviar_autentique: gerarEnviarAut,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Contrato gerado com sucesso!");
      if (data?.download_url) window.open(data.download_url, "_blank");
      setGerarOpen(false);
      setGerarRentalId("");
      setGerarTemplateId("");
      setGerarEnviarAut(false);
      fetchAll();
    } catch (e: unknown) {
      toast.error("Erro ao gerar contrato: " + (e instanceof Error ? e.message : "erro"));
    } finally {
      setGerando(false);
    }
  }

  // ── Download de contrato gerado ──
  async function downloadContract(c: Contract) {
    if (!c.storage_path) { toast.error("Arquivo não encontrado"); return; }
    const { data, error } = await supabase.storage.from("contratos").createSignedUrl(c.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error("Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  // Mapa auxiliar
  const rentalMap = Object.fromEntries(rentals.map(r => [r.id, r]));
  const motoMap = Object.fromEntries(motos.map(m => [m.id, m]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const activeRentals = rentals.filter(r => r.status === "ativa");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6" /> Contratos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gere contratos a partir de templates e envie para assinatura digital.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setGerarOpen(true)} disabled={templates.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" /> Gerar Contrato
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["contratos", "templates"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "contratos" ? `Contratos (${contracts.length})` : `Templates (${templates.length})`}
          </button>
        ))}
      </div>

      {/* ── ABA CONTRATOS ── */}
      {tab === "contratos" && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum contrato gerado ainda</p>
              <p className="text-sm mt-1">Adicione um template e clique em "Gerar Contrato"</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Locatário / Placa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map(c => {
                    const rental = c.rental_id ? rentalMap[c.rental_id] : null;
                    const moto = rental ? motoMap[rental.motoId] : null;
                    const client = rental ? clientMap[rental.clienteId] : null;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-mono max-w-[200px] truncate" title={c.nome}>
                          {c.nome}
                        </TableCell>
                        <TableCell className="text-sm">
                          {client ? (
                            <div>
                              <div className="font-medium">{client.nome}</div>
                              <div className="text-muted-foreground text-xs">{moto?.placa || "—"}</div>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[c.status] || "secondary"}>
                            {STATUS_LABEL[c.status] || c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {c.storage_path && (
                              <Button variant="ghost" size="icon" title="Baixar DOCX" onClick={() => downloadContract(c)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {c.autentique_url && (
                              <Button variant="ghost" size="icon" title="Abrir no Autentique" onClick={() => window.open(c.autentique_url!, "_blank")}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ── ABA TEMPLATES ── */}
      {tab === "templates" && (
        <div className="space-y-4">
          {/* Info sobre placeholders */}
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 text-sm">
            <div className="flex gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <div className="space-y-2">
                <p className="font-medium text-blue-800 dark:text-blue-300">
                  Use estes marcadores no seu documento DOCX — eles serão preenchidos automaticamente:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                  {PLACEHOLDERS.map(p => (
                    <div key={p.key} className="flex gap-2 text-xs">
                      <code className="font-mono text-blue-700 dark:text-blue-300 shrink-0">{p.key}</code>
                      <span className="text-blue-600/80 dark:text-blue-400/80">→ {p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Adicionar Template
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum template cadastrado</p>
              <p className="text-sm mt-1">Faça upload de um arquivo .docx com os marcadores acima</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map(t => (
                <div key={t.id} className="border rounded-lg p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{t.nome}</div>
                      {t.descricao && <div className="text-xs text-muted-foreground mt-0.5">{t.descricao}</div>}
                    </div>
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Adicionado em {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => downloadTemplate(t)}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTmpl(t)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DIALOG: Upload de template ── */}
      <Dialog open={uploadOpen} onOpenChange={v => !v && setUploadOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do template</Label>
              <Input
                value={uploadNome}
                onChange={e => setUploadNome(e.target.value)}
                placeholder="ex: Contrato Sem Caução"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Textarea
                value={uploadDescricao}
                onChange={e => setUploadDescricao(e.target.value)}
                placeholder="Descreva quando usar este template"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo DOCX</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {uploadFile ? (
                  <div className="text-sm font-medium">{uploadFile.name}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <Upload className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    Clique para selecionar um arquivo .docx
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadNome.trim()}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Enviando…</> : "Salvar Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Gerar contrato ── */}
      <Dialog open={gerarOpen} onOpenChange={v => !v && setGerarOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Locação</Label>
              <Select value={gerarRentalId} onValueChange={setGerarRentalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma locação ativa" />
                </SelectTrigger>
                <SelectContent>
                  {activeRentals.map(r => {
                    const moto = motoMap[r.motoId];
                    const client = clientMap[r.clienteId];
                    const num = r.numero ? `#${String(r.numero).padStart(5, "0")}` : r.id.slice(0, 6);
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        {num} — {client?.nome || "?"} · {moto?.placa || "?"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={gerarTemplateId} onValueChange={setGerarTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                id="enviar-aut"
                checked={gerarEnviarAut}
                onChange={e => setGerarEnviarAut(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="enviar-aut" className="cursor-pointer text-sm leading-tight">
                Enviar para assinatura no Autentique
                <span className="block text-xs text-muted-foreground font-normal">
                  Requer token da API configurado nas configurações da empresa
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGerarOpen(false)} disabled={gerando}>Cancelar</Button>
            <Button onClick={handleGerar} disabled={gerando || !gerarRentalId || !gerarTemplateId}>
              {gerando
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Gerando…</>
                : <><FileText className="h-4 w-4 mr-1.5" /> Gerar Contrato</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM: Excluir template ── */}
      <AlertDialog open={!!deleteTmpl} onOpenChange={open => !open && setDeleteTmpl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              O template <strong>{deleteTmpl?.nome}</strong> será removido permanentemente.
              Contratos já gerados não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTmpl && handleDeleteTemplate(deleteTmpl)} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
