# QA Audit — Fase 3.2 (push FCM + preferências de notificação)

Auditoria somente leitura. Nenhum arquivo foi alterado.

## 1. Aprovado na revisão

**Registro de token (`register-push.ts` → `push.functions.ts` → `push_subscriptions`)**
- Fluxo: `enablePush(accountId)` → checa suporte → `Notification.requestPermission()` (somente no clique do switch) → busca a config do Firebase → registra o service worker de mensageria → `getToken()` com a VAPID key → `registerPushToken({ accountId, token, userAgent })` → upsert → grava o token no localStorage.
- O alvo de conflito do upsert é `fcm_token` (coluna com UNIQUE no banco). Não é `account_id` nem `user_id`, então cada dispositivo/navegador gera uma linha própria e um dispositivo novo nunca sobrescreve o de outro.
- `last_seen_at` é enviado explicitamente (`new Date().toISOString()`) no mesmo objeto do upsert, portanto vale tanto para inserção quanto para re-registro/refresh do token.
- Clique duplo: o switch fica desabilitado enquanto `pushBusy` estiver ativo, e mesmo em corrida o upsert por `fcm_token` é idempotente (o FCM devolve o mesmo token). Todo o corpo de `enablePush` está em `try/catch` e o `togglePush` usa `finally`, então não há promise rejeitada sem tratamento.

**RLS**
- SELECT exige `is_account_member(account_id)`; INSERT/UPDATE/DELETE exigem `is_account_member(account_id) AND user_id = auth.uid()`. Um usuário da conta A que forje um `account_id` da conta B falha no `WITH CHECK` (não é membro) — não lê, não insere, não apaga.
- `service_role` tem `GRANT ALL` e ignora RLS por definição, então o cron da 3.3 consegue ler todos os tokens de todas as contas.
- Cascatas existem: `account_id → accounts(id) ON DELETE CASCADE` e `user_id → auth.users(id) ON DELETE CASCADE`. Sem linhas órfãs.

**Timezone e reminder_hour**
- Trigger `trg_accounts_validate_timezone` (BEFORE INSERT OR UPDATE OF timezone) valida contra `pg_timezone_names` e levanta exceção para valores como `Fake/Timezone`. A UI trata como erro de salvamento (toast de erro), não corrompe o dado nem cai em default silencioso.
- `accounts_reminder_hour_check (0..23)` é constraint de banco: chamada direta à API/PostgREST com 25 é rejeitada, independentemente da UI.
- Auto-detecção só define o valor inicial do estado (`useState(detectTimezone())`); assim que a query retorna, o efeito sobrescreve com o valor salvo da conta, e a gravação só acontece no submit. Não há sobrescrita silenciosa a cada visita.

**iOS / standalone**
- `isIosDevice()` cobre iPhone/iPad/iPod e iPadOS moderno (`Macintosh` + `maxTouchPoints > 1`); `isStandaloneDisplay()` checa `display-mode: standalone` e `navigator.standalone`. O aviso só aparece quando iOS **e** não-standalone, portanto nunca em Android/desktop, nem no PWA já instalado.

**Segurança**
- `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` e `FCM_PRIVATE_KEY` aparecem apenas em `src/lib/push/fcm.server.ts` (arquivo `.server.ts`, bloqueado no bundle do cliente) e lidos dentro de função, não em escopo de módulo.
- A assinatura RS256 e a troca de token OAuth acontecem só no servidor; o access token fica em cache em memória do worker e nunca é retornado ao cliente. `fcm.server.ts` hoje não é importado por nenhuma rota/componente.

## 2. Problemas encontrados

**Médio (revisar antes/junto da 3.3)**
1. `getFirebaseWebConfig` é um server function **sem autenticação** que devolve `GOOGLE_API_KEY` como apiKey do Firebase. Isso é aceitável se a chave for uma Browser Key do Firebase com restrições (referrer/API); se for uma chave Google Cloud ampla usada por outros serviços, é exposição pública. Vale confirmar as restrições no Google Cloud ou separar em um secret dedicado ao Firebase Web.

**Menor (não bloqueia a 3.3)**
2. `fcm_token` é único globalmente e a linha carrega um único `account_id`. Se o mesmo usuário/dispositivo ativar push em uma segunda conta, o upsert move a linha para a nova conta em vez de criar uma segunda — o dispositivo deixa de receber lembretes da primeira conta. Só importa quando multi-conta por usuário for real.
3. `disablePush()` depende do token no localStorage. Se o usuário limpar os dados do navegador, a linha do servidor fica até o FCM devolver `UNREGISTERED` — ou seja, a limpeza da 3.3 é o que fecha esse ciclo.
4. Erro do trigger de timezone chega à UI como toast genérico de falha de salvamento, sem mensagem específica.

**Cosmético**
5. `sendPushToToken` não devolve o token na resposta; o cron precisa correlacionar pelo token que enviou (trivial no loop).

**Sobre rate limit (é escopo da 3.3, não exige mudança na 3.2)**
- A API HTTP v1 não tem multicast por token (`sendMulticast` do firebase-admin era fan-out no cliente): a 3.3 vai enviar 1 requisição por token. O envio em loop sequencial sem limite é o risco; a 3.3 deve adicionar concorrência limitada (ex.: 5–10 em paralelo) e retry com backoff em 429/503/500, além de respeitar o limite de tempo de execução do worker (lotes por conta/hora). O cache do access token em escopo de módulo já evita reautenticar a cada envio dentro do mesmo isolate. Nada disso obriga a alterar `fcm.server.ts` agora — o formato de retorno (`{ ok: true, messageId }` | `{ ok: false, stale, status, error }`) já é suficiente para a limpeza de tokens.

## 3. Veredito

Fase 3.2 está sólida e **segura para servir de base à 3.3** sem correções prévias obrigatórias. Recomendo apenas confirmar as restrições da chave usada como `apiKey` do Firebase (item 1) — os demais itens podem ser absorvidos naturalmente durante a 3.3.
