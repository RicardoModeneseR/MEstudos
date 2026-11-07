-- Agenda a Edge Function de lembretes a cada 15 minutos.
-- Antes de rodar: habilite as extensões pg_cron e pg_net (Database > Extensions)
-- e troque <PROJECT_REF> e <CRON_SECRET> pelos valores do seu projeto.
select cron.schedule(
  'mestudos-send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
