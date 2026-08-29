-- Agenda a rotina diária de cobrança automática (óleo + pagamento) via IA.
-- Mesmo padrão dos demais jobs em cron.job (net.http_post + Authorization
-- Bearer anon key). Roda às 9h BRT (12h UTC) — dentro do horário comercial
-- padrão (8h-20h) configurado em companies.whatsapp_config.
select cron.schedule(
  'collection-ai-dispatch-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://qmwfotbczcruxaoemfde.supabase.co/functions/v1/collection-ai-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtd2ZvdGJjemNydXhhb2VtZmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzk3MzYsImV4cCI6MjA5MTkxNTczNn0.Dg_Tb8tQDcEKwWufK0K27qXu-_6Htk5gQ_oV_uUlGpU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
