// Edge Function (Deno): envia notificações push de provas/entregas e das revisões do dia.
// Variáveis (supabase secrets set ...): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem por padrão nas Edge Functions.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface EventData {
  id: string; title: string; type: string; date: string; time?: string; location?: string;
  remindersEnabled: boolean; reminderDays: number[]; reminderTime: string; deleted?: boolean;
}
interface TopicData {
  id: string; name: string; spacedEnabled: boolean; deleted?: boolean;
  reviews: { due: string; doneAt?: string }[];
}

const REVIEW_DIGEST_TIME = '07:00';
const WINDOW_MIN = 60 * 6; // tolera atrasos do cron sem disparar lembretes muito antigos

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: subs } = await db.from('push_subscriptions').select('*');
  const users = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  let sent = 0;

  for (const userId of users) {
    const { data: rows } = await db
      .from('records')
      .select('collection,data')
      .eq('user_id', userId)
      .eq('deleted', false)
      .in('collection', ['events', 'topics', 'settings']);
    const settings = rows?.find((r) => r.collection === 'settings')?.data as { timezone?: string } | undefined;
    const tz = settings?.timezone ?? 'America/Sao_Paulo';
    const now = nowIn(tz);

    const due: { key: string; title: string; body: string; url: string }[] = [];

    for (const r of rows ?? []) {
      if (r.collection !== 'events') continue;
      const e = r.data as EventData;
      if (!e.remindersEnabled || e.deleted) continue;
      for (const days of e.reminderDays ?? []) {
        const day = addDays(e.date, -days);
        const at = minutesSinceEpoch(day, e.reminderTime || '09:00');
        if (now >= at && now - at <= WINDOW_MIN) {
          const what = e.type === 'prova' ? 'Prova' : e.type === 'entrega' ? 'Entrega' : 'Evento';
          due.push({
            key: `event:${e.id}:${e.date}:${days}`,
            title: `${what} ${days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`}`,
            body: `${e.title}${e.time ? ` · ${e.time}` : ''}${e.location ? ` · ${e.location}` : ''}`,
            url: '/agenda',
          });
        }
      }
    }

    const today = todayIn(tz);
    const digestAt = minutesSinceEpoch(today, REVIEW_DIGEST_TIME);
    if (now >= digestAt && now - digestAt <= WINDOW_MIN) {
      const pending = (rows ?? [])
        .filter((r) => r.collection === 'topics')
        .map((r) => r.data as TopicData)
        .filter((t) => t.spacedEnabled && !t.deleted && t.reviews?.find((rv) => !rv.doneAt && rv.due <= today));
      if (pending.length) {
        due.push({
          key: `reviews:${today}`,
          title: pending.length === 1 ? '1 revisão para hoje' : `${pending.length} revisões para hoje`,
          body: pending.slice(0, 3).map((t) => t.name).join(', ') + (pending.length > 3 ? '…' : ''),
          url: '/',
        });
      }
    }

    for (const n of due) {
      const { error: dup } = await db.from('reminder_log').insert({ user_id: userId, key: n.key });
      if (dup) continue; // já enviado
      for (const s of (subs ?? []).filter((x) => x.user_id === userId)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }),
          );
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }
  }
  return Response.json({ ok: true, sent });
});

/* datas no fuso da usuária, em "minutos desde a época" para comparar facilmente */
function partsIn(tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return p as Record<string, string>;
}
function todayIn(tz: string) {
  const p = partsIn(tz);
  return `${p.year}-${p.month}-${p.day}`;
}
function nowIn(tz: string) {
  const p = partsIn(tz);
  return minutesSinceEpoch(`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`);
}
function minutesSinceEpoch(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60_000;
}
function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
