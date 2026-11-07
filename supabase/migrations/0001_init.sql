-- MEstudos: armazenamento genérico sincronizado (um registro por entidade do app)
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  deleted    boolean     not null default false,
  primary key (user_id, collection, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

alter table public.records enable row level security;

create policy "records: dono lê"      on public.records for select using (auth.uid() = user_id);
create policy "records: dono insere"  on public.records for insert with check (auth.uid() = user_id);
create policy "records: dono altera"  on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "records: dono remove"  on public.records for delete using (auth.uid() = user_id);

-- tempo real para sincronizar celular <-> notebook
alter publication supabase_realtime add table public.records;

-- Inscrições de notificação push (uma por aparelho)
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push: dono gerencia" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Registro de lembretes já enviados (evita duplicados). Só a Edge Function acessa.
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.reminder_log enable row level security;

-- Bucket privado para PDFs e arquivos dos temas
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

create policy "materials: dono lê" on storage.objects for select
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materials: dono envia" on storage.objects for insert
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materials: dono remove" on storage.objects for delete
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
