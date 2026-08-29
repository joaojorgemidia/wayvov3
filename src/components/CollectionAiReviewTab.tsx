import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDataCacheSnapshot } from "@/lib/data-cache";
import { MODULE_LABELS, CollectionModule } from "@/lib/collections";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, X, Sparkles, User, Bike } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

interface AiDispatchLog {
  id: string;
  company_id: string;
  module: CollectionModule;
  entity_id: string;
  cliente_id: string | null;
  moto_id: string | null;
  stage_number: number;
  reasoning: string;
  proposed_message: string | null;
  status: string;
  created_at: string;
}

export function CollectionAiReviewTab() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const cache = useDataCacheSnapshot();
  const cid = activeCompany?.id;

  const [rows, setRows] = useState<AiDispatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRows = async () => {
    if (!cid) return;
    setLoading(true);
    const { data } = await db
      .from("collection_ai_dispatch_log")
      .select("*")
      .eq("company_id", cid)
      .eq("status", "pending_review")
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, [cid]);

  const handleApprove = async (row: AiDispatchLog) => {
    const cliente = row.cliente_id ? cache.clients.find((c) => c.id === row.cliente_id) : null;
    if (!cliente?.telefone) {
      toast.error("Cliente sem telefone cadastrado — não é possível enviar");
      return;
    }
    const message = drafts[row.id] ?? row.proposed_message ?? "";
    if (!message.trim()) {
      toast.error("Mensagem vazia");
      return;
    }
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          companyId: row.company_id,
          phone: cliente.telefone,
          message,
          clienteId: row.cliente_id,
          motoId: row.moto_id,
          module: row.module,
          entityId: row.entity_id,
          stageNumber: row.stage_number,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await db
        .from("collection_ai_dispatch_log")
        .update({
          status: "sent",
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          followup_id: data?.followupId || null,
        })
        .eq("id", row.id);

      toast.success(`Cobrança enviada para ${cliente.nome}`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao enviar cobrança");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (row: AiDispatchLog) => {
    setBusyId(row.id);
    try {
      await db
        .from("collection_ai_dispatch_log")
        .update({ status: "rejected", reviewed_by: user?.id || null, reviewed_at: new Date().toISOString() })
        .eq("id", row.id);
      toast.success("Sugestão rejeitada");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao rejeitar sugestão");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Nenhuma cobrança da IA aguardando aprovação no momento.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 text-sm flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-muted-foreground">
            A IA analisou as pendências de óleo e pagamento junto com o histórico de conversa no WhatsApp e sugeriu
            estas cobranças. Revise o texto se quiser e aprove para enviar de verdade, ou rejeite para não enviar.
          </div>
        </CardContent>
      </Card>

      {rows.map((row) => {
        const cliente = row.cliente_id ? cache.clients.find((c) => c.id === row.cliente_id) : null;
        const moto = row.moto_id ? cache.motos.find((m) => m.id === row.moto_id) : null;
        const message = drafts[row.id] ?? row.proposed_message ?? "";
        const busy = busyId === row.id;
        return (
          <Card key={row.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{MODULE_LABELS[row.module]}</Badge>
                    <span className="text-xs text-muted-foreground">Etapa {row.stage_number}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{cliente?.nome || "Cliente não encontrado"}</span>
                      {cliente?.telefone && <span className="text-muted-foreground text-xs">• {cliente.telefone}</span>}
                    </span>
                    {moto && (
                      <span className="inline-flex items-center gap-1.5">
                        <Bike className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono tracking-wider font-semibold">{moto.placa}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Por que a IA decidiu enviar: </span>
                {row.reasoning}
              </div>

              <Textarea
                rows={3}
                value={message}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
              />

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={busy}
                  onClick={() => handleApprove(row)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Aprovar e enviar
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => handleReject(row)}>
                  <X className="h-4 w-4 mr-1.5" /> Rejeitar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
