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

## E-mail — decisão final: serviço gerenciado do Lovable Cloud

Confirmado. Hostinger SMTP fica descartada por um motivo técnico duro: o backend deste app roda em Cloudflare Workers, que **não abre socket TCP para portas SMTP** (465/587) — nenhuma lib de SMTP funciona ali, e a regra do projeto também impede criar Edge Function Deno nova só para isso. O serviço gerenciado é HTTP, sem chave nova, com bounce/supressão/rate limit resolvidos pela plataforma.

### 1. Configurar o domínio remetente

Hoje **não há domínio de e-mail configurado** neste projeto (verificado). O fluxo é:

1. Abrir o diálogo de configuração de e-mail (botão no fim desta conversa) e informar o domínio.
2. O Lovable devolve um par de registros **NS** para um subdomínio delegado (ex.: `notify.seudominio.com`), apontando para `nsN.lovable.cloud`.
3. Você adiciona esses NS no seu provedor de DNS.
4. **Não é preciso criar SPF, DKIM, DMARC ou MX manualmente.** Com a delegação, o Lovable passa a gerenciar a zona daquele subdomínio e cria/renova todos esses registros sozinho. Esse é o motivo de a delegação ser por NS e não por CNAME/TXT.
5. A propagação leva de minutos a 72h; o status fica visível em Cloud → Emails e há botão de re-verificar.

Os valores exatos de NS são gerados por domínio — vou lê-los da tela/status no momento do BUILD, nunca de memória.

### 2. Subdomínio delegado é o caminho certo

Sim: delegue um **subdomínio** (`notify.seudominio.com`) do domínio que você já usa, não um domínio novo. Três razões:

- O domínio raiz continua intocado — o e-mail existente da Hostinger (caixas, MX) segue funcionando, porque a delegação afeta só a zona do subdomínio.
- Um subdomínio dedicado a notificações isola a reputação de envio do seu e-mail pessoal/comercial.
- Domínio separado exigiria comprar e aquecer reputação do zero, sem ganho.

Onde adicionar os NS: no provedor que **hospeda o DNS** do domínio. Se o DNS está na Hostinger, é lá; se você já migrou para Cloudflare, é no Cloudflare. Atenção no Cloudflare: registro NS não pode ser proxied (não há nuvem laranja para NS — normal).

### 3. Abstração `EmailProvider` — ajuste em relação ao plano anterior

A ideia de provider trocável se mantém, mas a estrutura de arquivos muda para a do serviço gerenciado, que já traz um registry próprio:

- `src/lib/email-templates/` — templates React Email (`.tsx`), um `template` exportado por arquivo.
- `src/lib/email-templates/registry.ts` — registro dos templates.
- `src/lib/email-templates/send-email.ts` — helper de envio (server-only), gerado pela plataforma.
- `src/lib/email/care-reminder-email.server.ts` — **a nossa camada**: monta os dados do digest, escolhe idioma (pt/en/es pelo `profiles.preferred_language`) e chama o helper com `idempotencyKey` derivado da execução do cron. É esse arquivo que o cron importa; trocar de provedor no futuro significa reescrever só ele.

Não vamos criar `email-provider.ts` + `provider-registry.server.ts` espelhando `src/lib/ai/`: ali a troca de provider era um requisito real (Kindwise/Lovable/LogoriOn), aqui seria uma indireção sobre um único provedor gerenciado. Se você preferir manter a simetria mesmo assim, é uma linha no BUILD — só me diga.

### 4. Templates e tokens visuais

Um template: `care-reminder`, com os tokens do Plantech (verde sage no CTA e nos acentos, tipografia sans-serif limpa, espaçamento generoso), assunto e preview text localizados. Uma ressalva de e-mail: o `Body` fica com fundo **branco** — é a regra do cliente de e-mail para não quebrar em dark mode; o neutro quente entra no container interno e nas faixas, não no fundo externo.

Conteúdo: resumo do dia ("3 plantas precisam de água"), lista com apelido + tipo de cuidado, e um botão para `/tasks`. Um e-mail por conta por dia, nunca um por planta. Rodapé de descadastro é acrescentado pela plataforma — não escrevemos nada disso.

### Ordem de execução

1. **3.1** agora — sem nenhuma dependência de credencial.
2. Em paralelo, você cria o projeto Firebase e inicia a verificação do domínio de e-mail.
3. **3.2** quando as chaves do FCM estiverem prontas.
4. **3.3** por último, com a migração de schema aplicada antes.

