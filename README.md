# MEstudos

Caderno de estudos para a faculdade de Medicina, feito como **PWA** (funciona no iPhone e no notebook com o mesmo código) e sincronizado pelo **Supabase**.

**Funcionalidades:** agenda de provas/entregas (diária, semanal, mensal, anual) com contagem regressiva e lembretes · grade horária do período, editável a qualquer momento (mudanças valem "daqui pra frente" e o histórico fica) · matérias e temas com status *não vi / estudei / revisado* · revisão espaçada automática com intervalos escolhidos por tema · registro de questões com gráfico de desempenho · planejamento semanal que avisa quando a semana não cabe nas horas livres e sugere redistribuição · pomodoro com horas por matéria · notas com peso, média e quanto falta para passar · resumos e links/arquivos por tema · modo claro/escuro/sistema · busca (⌘K / Ctrl K) · funciona offline.

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173 (e na rede local, para testar no celular)
npm test           # testes da lógica (notas, revisões, planejamento)
npm run build      # gera dist/
```

Sem configurar nada, o app roda em **modo local** (dados só no navegador). Em *Visão geral* há um botão "Carregar exemplo" com os dados do design.

## 1. Configurar o Supabase (sincronização celular ↔ notebook)

1. Crie um projeto gratuito em <https://supabase.com>.
2. Em **SQL Editor**, rode o conteúdo de `supabase/migrations/0001_init.sql` (tabelas, segurança por usuário, tempo real e bucket de arquivos).
3. Em **Authentication → Providers → Email**, deixe o login por e-mail ativo. Se preferir não precisar confirmar o e-mail, desligue *Confirm email*.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (em **Project Settings → API**).
5. Rode `npm run dev`, crie a conta da Mariah e pronto: tudo que ela fizer em um aparelho aparece no outro.

> Os dados ficam salvos no aparelho primeiro e sobem para o Supabase em segundo plano, então o app funciona sem internet e sincroniza quando a conexão volta.

## 2. Publicar (necessário para instalar no iPhone)

O iPhone só instala PWAs servidos por HTTPS. Opções gratuitas:

- **Vercel**: importe o repositório, framework *Vite*, e adicione as variáveis `VITE_*` em *Environment Variables*. O `vercel.json` já cuida das rotas.
- **Netlify / Cloudflare Pages**: build `npm run build`, pasta `dist`. O `public/_redirects` já cuida das rotas.

Depois, no Supabase, em **Authentication → URL Configuration**, coloque o endereço publicado em *Site URL*.

### Instalar no iPhone
Abra o endereço no **Safari** → botão **Compartilhar** → **Adicionar à Tela de Início**. Abra pelo ícone. (No notebook, Chrome/Edge mostram um ícone de instalar na barra de endereço.)

## 3. Lembretes push (opcional, mas recomendado)

Para os avisos chegarem com o app fechado (provas X dias antes, revisões do dia às 7h):

```bash
npx web-push generate-vapid-keys          # gera chave pública e privada
```

1. Coloque a chave **pública** em `VITE_VAPID_PUBLIC_KEY` (no `.env.local` e na hospedagem) e publique de novo.
2. Instale a [Supabase CLI](https://supabase.com/docs/guides/cli), faça `supabase login` e `supabase link --project-ref <PROJECT_REF>`.
3. Configure os segredos e publique a função:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:seu@email.com CRON_SECRET=<uma-senha-aleatoria>
   supabase functions deploy send-reminders --no-verify-jwt
   ```
4. Em **Database → Extensions**, ative `pg_cron` e `pg_net`. Depois rode `supabase/migrations/0002_reminders_cron.sql` no SQL Editor, trocando `<PROJECT_REF>` e `<CRON_SECRET>`.
5. No app, em **Preferências e lembretes → Ativar avisos neste aparelho** (no iPhone e no notebook).

Sem o passo 3, o app ainda mostra notificações locais (fim do pomodoro) e a lista de avisos no sininho.

> No iPhone, push exige iOS 16.4+ e o app instalado na Tela de Início.

## Estrutura

```
src/
  data/        modelo (types.ts), store com sincronização (store.ts), pomodoro, dados de exemplo
  lib/         lógica pura: datas, revisões, notas, planejamento, estatísticas (+ testes)
  components/  layout (sidebar/tab bar), UI, gráfico, busca
  pages/       uma página por funcionalidade
  styles/      tokens (claro/escuro), base, componentes, páginas
  sw.ts        service worker (offline + push)
supabase/      SQL e Edge Function de lembretes
```

Todos os dados ficam em uma tabela `records` (um registro JSON por item, com `updated_at` para resolver conflitos: a edição mais recente vence), protegida por RLS para que cada conta veja só os próprios dados.
