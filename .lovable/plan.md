# Fase 3 — Agenda Inteligente de Cuidados (PLAN)

Dividida em 3 sub-fases para reduzir risco. Cada uma é entregável e testável sozinha.

- **3.1 — Motor de tarefas + tela Hoje/Próximos + "marcar como feito"** (sem notificações)
- **3.2 — Infraestrutura de push (FCM) + preferências de notificação**
- **3.3 — Cron diário + envio (push com fallback por e-mail)**

Motivo do split: 3.1 não depende de credencial nenhuma e já entrega valor; 3.2 depende de você criar o projeto Firebase; 3.3 depende de 3.1 e 3.2 e de uma decisão de e-mail ainda em aberto (ver "Bloqueios").

---

## Estado atual verificado

- **Firebase: não existe nada no projeto.** Sem `firebase`/`firebase-admin` em `package.json`, sem `public/manifest.webmanifest`, sem service worker, sem VAPID configurada. Único conteúdo em `public/` é `favicon.ico` e `robots.txt`.
- **Cron: já há helper pronto.** `src/integrations/supabase/cron-auth.ts` (`authenticateCronRequest`) valida `Authorization: Bearer` contra o secret `LOVABLE_CRON_SECRET`, que já existe nos secrets do projeto. Não vamos inventar secret novo.
- **Dados de agendamento já existem** em `plant_care_profile`: `watering_interval_days`, `last_watered_at`, `fertilizing_interval_days`. `plant_care_log` já registra `care_type` (`watering`, `fertilizing`, ...) com `performed_at`.
- **`accounts` não tem coluna de timezone** — confirmado no schema atual. Precisa de adição.
- **Backend do app roda em Cloudflare Workers (TanStack Start)**, não em Edge Functions Deno. Isso impacta a decisão de e-mail (ver Bloqueios).

## Escopo confirmado

Geram tarefa e lembrete: **rega** e **fertilização**. Poda, replantio e tratamento continuam apenas como registro manual em `plant_care_log`, sem recorrência.

---

## 3.1 — Motor de tarefas e tela Hoje/Próximos

**Cálculo (sem tabela de tarefas).** As tarefas são derivadas, não persistidas. Para cada planta não arquivada da conta:

```text
último cuidado = max(plant_care_log.performed_at do tipo)  ou  last_watered_at (rega)  ou  created_at
próxima data   = último cuidado + intervalo (dias)
atrasada       = próxima data < hoje (no timezone da conta)
```

Reaproveita a mesma lógica de `src/lib/plant-health.ts`, extraída para `src/lib/care-tasks.ts` para servir a UI e o cron com a mesma regra.

**Tela** `src/routes/_authenticated/tasks.tsx`:
- `SegmentedTabs` com **Hoje** (atrasadas + vencendo hoje) e **Próximos** (7 dias).
- Item da lista: foto principal, apelido, tipo de cuidado, `StatusBadge` (atrasada/hoje/agendada), botão "Feito".
- Empty state próprio por aba; skeleton no carregamento; `BackButton` no cabeçalho.
- Entrada a partir de `/app` (card "Cuidados" deixa de ser "em breve").

**"Marcar como feito"**: insere linha em `plant_care_log` (`account_id`, `plant_id`, `care_type`, `performed_at = now()`); para rega, também atualiza `plant_care_profile.last_watered_at`. A próxima data se recalcula sozinha — não há reagendamento manual. Invalida as queries de tarefas, perfil e timeline.

**i18n**: chaves `tasks.*` em pt/en/es.

---

## 3.2 — Push (FCM) e preferências

### Guia para criar o Firebase (você executa antes do BUILD)

1. **console.firebase.google.com** → *Adicionar projeto* → nome `plantech` → pode desativar Google Analytics.
2. Dentro do projeto: ícone **</>** (Web) → registrar app "Plantech Web". Copie o objeto `firebaseConfig` (apiKey, authDomain, projectId, messagingSenderId, appId). **Esses valores são públicos** e vão no código/env `VITE_*`, não são secrets.
3. **Configurações do projeto → Cloud Messaging**: a API do FCM (V1) já vem ativa; se aparecer "Cloud Messaging API (Legacy) desativada", ignore — usamos a V1.
4. Ainda em **Cloud Messaging → Web configuration → Web Push certificates → Generate key pair**. Isso gera a **chave pública VAPID** (uma string longa começando com `B...`). Só a pública é usada; a privada fica no Firebase e não é exposta.
5. **Configurações do projeto → Contas de serviço → Gerar nova chave privada** → baixa um JSON. Desse JSON usamos três campos: `project_id`, `client_email`, `private_key`.

**Onde cada valor vai:**

| Valor | Destino | Sensível |
|---|---|---|
| `firebaseConfig` (apiKey, appId, etc.) | `.env` como `VITE_FIREBASE_*` e no `firebase-messaging-sw.js` | não |
| Chave pública VAPID | `VITE_FIREBASE_VAPID_KEY` | não |
| `client_email` do service account | secret `FCM_CLIENT_EMAIL` | sim |
| `private_key` do service account | secret `FCM_PRIVATE_KEY` | sim |
| `project_id` do service account | secret `FCM_PROJECT_ID` | sim (baixo) |

Os três secrets serão pedidos pelo formulário seguro no momento do BUILD; nunca chegam ao bundle do cliente.

### Implementação

- `public/manifest.webmanifest` + tags de head (`manifest`, `theme-color`, `apple-touch-icon`) e ícones. Escopo **manifest-only**: instalação na tela inicial, **sem service worker de offline**. iOS Safari só entrega push quando o app está instalado na tela inicial — a UI explica isso.
- `public/firebase-messaging-sw.js`: service worker exclusivo de mensageria (separado e não sujeito às regras de kill-switch de app-shell).
- `src/lib/push/register-push.ts` (cliente): pede permissão, obtém o token via `getToken(messaging, { vapidKey })`, envia para o servidor. Nunca pede permissão no carregamento — só via ação explícita nas preferências.
- Dependência nova: `firebase` (SDK web). **Não** usamos `firebase-admin` — ele é Node-only e quebra no Worker. O envio server-side usa a **HTTP v1 API** do FCM com um JWT assinado por Web Crypto (`RS256`) a partir do `FCM_PRIVATE_KEY`, em `src/lib/push/fcm.server.ts`.

### Preferências de notificação

Rota `src/routes/_authenticated/settings.notifications.tsx`: ativar/desativar push (com estado da permissão do navegador), horário preferido, timezone, fallback por e-mail ligado/desligado.

---

## 3.3 — Cron diário e envio

- Rota `src/routes/api/public/hooks/care-reminders.ts` (POST). **Sim, precisa de autenticação**: `/api/public/*` só ignora o gate de auth do site publicado, continua acessível ao mundo. O handler chama `authenticateCronRequest(request)` na primeira linha e devolve 401 sem o bearer correto. Sem secret novo — usa o `LOVABLE_CRON_SECRET` já existente.
- Agendamento: `pg_cron` + `pg_net` chamando a rota **de hora em hora**, não uma vez ao dia. Rodar de hora em hora é o que permite respeitar o horário preferido de cada conta no fuso dela.
- Por execução: seleciona contas cuja hora local corrente (via `timezone(accounts.timezone, now())`) bate com o horário preferido, calcula as tarefas vencidas com a mesma lógica de 3.1, e envia um **digest único por conta** (não uma notificação por planta).
- **Idempotência**: cada tarefa vencida tem uma chave estável `plant_id + care_type + due_date`. Antes de enviar, a rota grava as chaves em `care_reminder_sent` (tabela mínima: `account_id`, `plant_id`, `care_type`, `due_on date`, `sent_at`) com `UNIQUE (plant_id, care_type, due_on)` e `ON CONFLICT DO NOTHING`; só entram no digest as chaves efetivamente inseridas. Rodar duas vezes no mesmo dia não reenvia nada.
- **Sem AI**: confirmado — esse fluxo não chama nenhum modelo, então **nada é escrito em `ai_usage_log`**. Aquela tabela continua exclusiva de identificação e guias de espécie.
- Ordem de canais por conta: push para todos os tokens ativos; token que voltar `UNREGISTERED`/`NOT_FOUND` é removido; se nenhum token entregou **e** o fallback por e-mail está ligado, envia e-mail.

### Sobre "last notified at"

Optei por uma tabela mínima (`care_reminder_sent`) em vez de coluna. Uma coluna em `plant_care_log` não serve: a linha do log só existe **depois** que o cuidado foi feito — o lembrete é justamente sobre a tarefa que ainda não tem log. Uma coluna em `plant_care_profile` também não serve, porque rega e fertilização precisam de marcas independentes. A tabela tem 5 colunas e um índice único; é o mais simples que resolve.

---

## Adições de schema (flag: SQL separada, estilo Fase 0)

Uma migração pequena, antes do BUILD de 3.2/3.3:

1. `accounts.timezone text not null default 'UTC'` — IANA (ex.: `Europe/Madrid`), validada por trigger.
2. `accounts.reminder_hour smallint not null default 9` (0–23) e `accounts.email_fallback_enabled boolean not null default true`.
3. Tabela `push_subscriptions` — `account_id`, `user_id`, `fcm_token` (único), `user_agent`, `last_seen_at`, `created_at`. RLS: membro da conta lê/insere/apaga os próprios; `service_role` completo. Escopo por `account_id` como todas as demais.
4. Tabela `care_reminder_sent` (acima). RLS: leitura por membro da conta; escrita apenas `service_role`, igual ao padrão de `ai_usage_log`.

Todas com `GRANT` explícito no mesmo migration.

---

## Bloqueios / pontos que preciso confirmar antes do BUILD de 3.3

**E-mail via SMTP da Hostinger não é viável neste projeto.** Dois motivos concretos:

1. O backend deste app **não é Edge Function Deno** — é TanStack Start rodando em Cloudflare Workers. Workers **não abrem conexão TCP para porta SMTP** (465/587). Não é limitação de biblioteca; não há socket SMTP disponível. Nenhuma lib de SMTP (nodemailer, denomailer) funciona ali.
2. A regra do projeto é não criar novas Edge Functions — então "colocar o SMTP numa Edge Function Deno" também não é caminho (e, mesmo em Deno Deploy, SMTP direto é notoriamente instável e frequentemente bloqueado).

O que muda: apenas o **transporte**. A abstração que você pediu continua igual — `src/lib/email/email-provider.ts` (interface, espelhando `src/lib/ai/vision-provider.ts`), `src/lib/email/provider-registry.server.ts`, e um adaptador concreto. Templates HTML com os tokens do Plantech (verde sage, fundo neutro quente, sans-serif) em `src/lib/email/templates/`.

Alternativas para o adaptador, em ordem de recomendação:

1. **E-mail gerenciado do Lovable Cloud** — envio por HTTP, sem chave nova, com supressão/bounce/rate limit resolvidos. Exige apenas verificar um domínio seu (pode ser o mesmo da Hostinger, delegando um subdomínio como `notify.seudominio.com`). Zero código de SMTP.
2. **Resend (ou outro provedor HTTP)** — API key própria, também compatível com Worker.
3. **Manter a Hostinger** só faz sentido via um relay HTTP→SMTP intermediário; adiciona uma peça de infraestrutura sem ganho.

Sobre os limites da Hostinger (~200/h, 2.400/dia): o batching/throttling do digest fica planejado de qualquer forma — um envio por conta por dia, em lotes com pausa, bem abaixo de qualquer teto.

**Escolha o adaptador (1, 2 ou 3) e eu fecho o plano de 3.3.** As sub-fases 3.1 e 3.2 podem começar sem essa decisão.
