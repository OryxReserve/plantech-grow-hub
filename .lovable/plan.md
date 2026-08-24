# Fase 3.3 — Cron diário de lembretes (push + fallback por e-mail)

## Ajuste importante ao escopo

Este projeto é TanStack Start, não Supabase Edge Functions. O endpoint do cron será uma **rota de servidor** em `src/routes/api/public/hooks/care-reminders.ts`, chamada pelo pg_cron via pg_net. O restante das decisões (pg_cron de hora em hora, Resend por fetch, acesso com service_role) permanece.

Autenticação: o projeto já tem `src/integrations/supabase/cron-auth.ts` com `authenticateCronRequest()` e o secret `LOVABLE_CRON_SECRET` provisionado. Usaremos isso em vez de criar um `CRON_INVOKE_SECRET` novo.

## 1. Fluxo completo

```text
pg_cron (minuto 0 de cada hora, UTC)
  └─ pg_net.http_post → /api/public/hooks/care-reminders  (Bearer LOVABLE_CRON_SECRET)
       ├─ authenticateCronRequest() → 401 se o token não bater
       ├─ RPC list_accounts_due_for_reminder()  [SECURITY DEFINER, no Postgres]
       │     hora local = now() AT TIME ZONE accounts.timezone
       │     elegível se extract(hour) = reminder_hour
       │       e não existe care_reminder_sent para (account_id, dia local)
       ├─ para cada conta elegível (lotes de 25 por execução):
       │     ├─ carrega plantas + perfis + logs (service_role) e roda buildCareTasks()
       │     │    com timeZone da conta → filtra status "overdue" | "today"
       │     ├─ 0 tarefas → não envia nada, não marca, segue
       │     ├─ PUSH: tokens da conta em push_subscriptions
       │     │     concorrência 5, retry backoff (2 tentativas) em 429/500/503
       │     │     stale: true → DELETE da linha no mesmo ciclo
       │     ├─ fallback E-MAIL se email_fallback_enabled
       │     │     e (nenhum ok:true OU nenhum token ativo)
       │     │     Resend → destinatários = e-mails dos membros ativos
       │     ├─ sucesso em ≥1 canal → INSERT em care_reminder_sent
       │     └─ ambos falharam → não marca (retry no próximo ciclo, ver §6)
       └─ INSERT em reminder_run_log (contadores) + resposta JSON com o resumo
```

## 2. Migração SQL

Rastreamento **resumo por conta por dia** (escolhido). Justificativa: uma notificação "3 plantas precisam de atenção hoje" é melhor UX que N pushes; o custo por conta cai de N envios para 1; a marcação de idempotência fica em uma chave natural `(account_id, local_date)`. A alternativa por tarefa (`plant_id` + `care_type` + dia) foi descartada: multiplica notificações, exige limpeza de linhas antigas maior e não traz ganho — o e-mail e o push já listam as plantas no corpo.

```sql
CREATE TABLE public.care_reminder_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  local_date date NOT NULL,              -- dia no fuso da conta
  channel text NOT NULL,                 -- 'push' | 'email' | 'push+email'
  task_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, local_date)
);
GRANT ALL ON public.care_reminder_sent TO service_role;
GRANT SELECT ON public.care_reminder_sent TO authenticated;
ALTER TABLE public.care_reminder_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_reminder_sent_select ON public.care_reminder_sent
  FOR SELECT TO authenticated USING (is_account_member(account_id));

CREATE TABLE public.reminder_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  accounts_eligible integer NOT NULL DEFAULT 0,
  accounts_notified integer NOT NULL DEFAULT 0,
  push_sent integer NOT NULL DEFAULT 0,
  push_failed integer NOT NULL DEFAULT 0,
  tokens_removed integer NOT NULL DEFAULT 0,
  emails_sent integer NOT NULL DEFAULT 0,
  emails_failed integer NOT NULL DEFAULT 0,
  error text
);
GRANT ALL ON public.reminder_run_log TO service_role;
ALTER TABLE public.reminder_run_log ENABLE ROW LEVEL SECURITY;
-- sem policy para authenticated: log operacional, leitura só via service_role
```

Índices: `UNIQUE (account_id, local_date)` já cobre a checagem de idempotência; `push_subscriptions_account_id_idx` já existe. A elegibilidade horária é um scan pequeno em `accounts` (dezenas de linhas) — não vale índice funcional agora.

RPC de elegibilidade (SECURITY DEFINER, EXECUTE só para service_role):

```sql
CREATE FUNCTION public.list_accounts_due_for_reminder(_limit int DEFAULT 25)
RETURNS TABLE (account_id uuid, timezone text, local_date date, email_fallback_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.timezone, (now() AT TIME ZONE a.timezone)::date, a.email_fallback_enabled
  FROM public.accounts a
  WHERE extract(hour FROM (now() AT TIME ZONE a.timezone)) = a.reminder_hour
    AND NOT EXISTS (
      SELECT 1 FROM public.care_reminder_sent s
      WHERE s.account_id = a.id
        AND s.local_date = (now() AT TIME ZONE a.timezone)::date
    )
  ORDER BY a.id
  LIMIT _limit;
$$;
```

**DST:** `now() AT TIME ZONE 'America/Sao_Paulo'` resolve pelo banco de fusos do Postgres, aplicando o offset vigente naquele instante — nomes IANA já carregam as regras de verão. Efeito colateral real: no dia em que o relógio adianta, a hora escolhida pode não existir e a conta perde a janela daquele dia; no dia em que atrasa, a hora ocorre duas vezes — a chave única `(account_id, local_date)` impede o segundo envio. Aceitável; será documentado no código.

## 3. Reuso da regra de negócio da 3.1

`buildCareTasks()` em `src/lib/care-tasks.ts` é uma função **pura** (recebe plantas, perfis, logs e `timeZone`) — nada de Supabase dentro dela. Ela será importada tal como está pelo código do cron; nenhuma regra é duplicada e nenhuma linha da 3.1 muda. Somente o carregamento dos dados é novo (`src/lib/reminders/reminder-data.server.ts`, com o cliente admin, filtrando por `account_id`). Consideramos e descartamos reimplementar a regra em SQL/RPC: duplicaria a lógica em duas linguagens.

Filtro: entram apenas tarefas com `status` `overdue` ou `today`. Conta sem nenhuma dessas → nenhum envio e nenhuma marcação.

## 4. Arquivos e assinaturas

```text
src/routes/api/public/hooks/care-reminders.ts   POST → resumo JSON da execução
src/lib/reminders/reminder-run.server.ts        orquestração de uma execução
src/lib/reminders/reminder-data.server.ts       leitura via service_role
src/lib/reminders/reminder-message.server.ts    títulos/corpos pt-BR + HTML do e-mail
src/lib/reminders/email.server.ts               Resend via fetch
src/lib/push/fcm.server.ts                      (inalterado)
src/lib/care-tasks.ts                           (inalterado, reusado)
```

```ts
runCareReminders(opts?: { limit?: number; now?: Date }): Promise<RunSummary>
loadDueAccounts(limit: number): Promise<DueAccount[]>
loadAccountTasks(accountId: string, timeZone: string): Promise<CareTask[]>
loadAccountRecipients(accountId: string): Promise<{ email: string }[]>
sendPushBatch(tokens: PushRow[], msg: PushMessage): Promise<PushBatchResult>  // concorrência 5 + backoff
deleteStaleTokens(ids: string[]): Promise<number>
sendReminderEmail(to: string[], tasks: CareTask[]): Promise<{ ok: boolean; error?: string }>
markReminderSent(accountId, localDate, channel, taskCount): Promise<void>
```

`sendPushToToken` não muda: `{ ok: true, messageId } | { ok: false, stale, status, error }` já é tudo o que o batch precisa.

Destinatário do e-mail: `auth.users.email` dos membros com `status = 'active'` em `account_members` (via `supabaseAdmin.auth.admin`), com fallback para `accounts.billing_email`. `profiles` não guarda e-mail.

## 5. Secrets

- `RESEND_API_KEY` — novo, pedido pelo formulário seguro de secrets.
- `REMINDER_FROM_EMAIL` — novo, remetente verificado no Resend (ex.: `Plantech <lembretes@seu-dominio>`); enquanto o domínio não estiver verificado, o Resend só entrega para o próprio e-mail da conta.
- `LOVABLE_CRON_SECRET` — já existe, usado na autenticação do endpoint.
- `SUPABASE_SERVICE_ROLE_KEY`, `FCM_*` — já existem.

## 6. Idempotência e duplicidade

- A checagem `NOT EXISTS em care_reminder_sent` acontece dentro da própria RPC de elegibilidade, então uma segunda execução no mesmo ciclo não seleciona a conta.
- A marcação só ocorre após ≥1 canal ter sucesso; se push e e-mail falharem, nada é gravado.
- Raciocínio validado: `reminder_hour` é fixo, então a conta é elegível apenas durante os ~60 minutos da sua hora local. O cron roda uma vez por hora, ou seja há **uma única tentativa por dia** na prática — o "retry no próximo ciclo" só ajuda se a execução falhar antes de terminar dentro da mesma hora. Não vale a pena alargar essa janela; o e-mail já é o canal de resgate.
- A restrição `UNIQUE (account_id, local_date)` é a garantia final contra corrida entre duas execuções sobrepostas: o segundo INSERT falha e o envio duplicado é impossível de ser marcado (e a conta já não teria sido selecionada).

## 7. Observabilidade e limites

- Uma linha em `reminder_run_log` por execução, com contadores e erro fatal quando houver. `ai_usage_log` não é reaproveitado: ele tem trigger e semântica de consumo de IA.
- Lote de 25 contas por execução; a resposta JSON informa `remaining > 0` e o próximo ciclo horário pega o resto (a conta continua elegível dentro da sua hora local). Sem auto-invocação encadeada.
- Cada conta é processada dentro de `try/catch` próprio: falha de e-mail ou de push em uma conta nunca interrompe as demais.
- Envio de push com concorrência 5 e no máximo 3 tentativas por token mantêm a execução bem abaixo do limite de tempo do worker.

## 8. Segurança

- Endpoint sob `/api/public/` (única forma de o pg_cron alcançá-lo), protegido por `authenticateCronRequest()` — comparação em tempo constante com `LOVABLE_CRON_SECRET`. Sem o header, 401.
- Só aceita POST; a resposta traz apenas contadores agregados, nunca e-mails ou tokens.
- `supabaseAdmin` importado **dentro** do handler; toda consulta é filtrada explicitamente por `account_id`, então não há mistura de dados entre contas mesmo com RLS ignorada.
- `RESEND_API_KEY` e `FCM_*` lidos via `process.env` apenas em arquivos `.server.ts` / dentro do handler.
- Tokens FCM e e-mails nunca aparecem em log; os logs registram apenas contagens e códigos de status.

## 9. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Envio duplicado | RPC filtra por `care_reminder_sent` + UNIQUE `(account_id, local_date)` |
| Hora local inexistente/repetida no DST | `AT TIME ZONE` com nome IANA + chave única por dia; comportamento documentado |
| Token morto acumulando | `stale: true` apaga a linha no mesmo ciclo |
| Timeout do worker | Lote de 25 contas, concorrência 5, retries limitados a 3 |
| 429 do FCM | Backoff exponencial com jitter, teto de tentativas, falha do token conta como falha (aciona e-mail) |
| Domínio do Resend não verificado | Documentar; `REMINDER_FROM_EMAIL` configurável e falha de e-mail registrada em `reminder_run_log` |
| Endpoint público abusado | Secret de cron obrigatório, resposta sem dados sensíveis |
| Conta sem tarefas | Nenhum envio, nenhuma marcação |

## 10. Verificação após o Build

1. Typecheck/build limpos.
2. Chamada ao endpoint sem o secret → 401; com o secret → 200 com resumo.
3. Ajustar `reminder_hour` da conta de teste para a hora corrente, disparar, conferir a linha em `care_reminder_sent` e em `reminder_run_log`.
4. Segunda chamada imediata → conta não elegível, nenhum envio novo.
5. Token inválido em `push_subscriptions` → removido e e-mail de fallback disparado.
6. Agendamento do pg_cron criado e listado em `cron.job`.
