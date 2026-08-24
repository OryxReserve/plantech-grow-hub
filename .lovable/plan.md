# QA Fase 3.3 — Bloco A: idempotência, conta sem tarefas e integridade de log

## O que verifiquei agora (estado real)

- Só existe **um** token de push no banco: conta `fffbe247…` (Rogerio Correa), 1 token. Todas as outras contas têm 0 tokens — nenhum teste de entrega real é possível fora do seu aparelho.
- Nessa conta, a única planta com intervalo é o **Manjericão** (rega a cada 1 dia, sem log de rega e sem `last_watered_at`) — ou seja, sempre vencida. As outras 6 plantas não têm intervalo.
- `care_reminder_sent` está **vazia** (0 linhas). Nenhum dia foi marcado ainda.
- `reminder_run_log` tem 10+ linhas; os ciclos automáticos recentes (15:05, 15:11–15:13, 16:05) gravaram `accounts_considered: 0`, `push_sent: 0`, com `started_at`/`finished_at` preenchidos e `error` nulo.
- Contas candidatas a "sem tarefas": `024ba742…` (Teste Planta, 1 planta, 0 perfis com intervalo) e `39504b73…` (Foto Tester, mesma situação). Ambas são contas de teste antigas, não são a sua conta real.

## Ponto que muda o Teste 1 (importante)

Lendo o código do job: o disparo **manual** com `accountId` entra por um caminho que ignora completamente `care_reminder_sent` — ele só monta a conta alvo e envia. A deduplicação diária acontece exclusivamente dentro de `list_accounts_due_for_reminder()`, que exclui contas que já têm linha do dia.

Consequência: dois disparos manuais seguidos **vão** enviar dois pushes. Isso não prova falha de idempotência — prova apenas que o caminho manual é, por desenho, um bypass. O teste correto para idempotência é pelo caminho do cron (sem `accountId`).

## Teste 1 — Idempotência por conta + dia local (via caminho do cron)

Como executar, sem enviar push repetido para o seu aparelho:

1. Snapshot: `select * from care_reminder_sent where account_id = 'fffbe247…'` (hoje: zero linhas) e a última linha de `reminder_run_log`.
2. Um único disparo real, sem `accountId` e sem `dryRunDedupe`, com a conta temporariamente elegível pelo horário: ajusto `accounts.reminder_hour` da conta para a hora UTC corrente (a conta está em `UTC`), disparo o hook, e depois **restauro `reminder_hour` para 9**. Isso não toca em plantas, perfis nem logs de cuidado.
   - Resultado esperado: `accountsConsidered: 1`, `pushSent: 1`, **1 push no aparelho**, e 1 linha nova em `care_reminder_sent` com `local_date` de hoje.
3. Segundo disparo imediato, idêntico: `list_accounts_due_for_reminder()` deve agora excluir a conta → `accountsConsidered: 0`, `pushSent: 0`, **nenhum push novo**, e `care_reminder_sent` continua com exatamente 1 linha.
4. Evidência reportada: as duas respostas JSON, `count(*)` antes/depois e a linha de dedupe (`task_count`, `delivered_count`).

Ruído no aparelho: exatamente **1 notificação**, no passo 2. Confirmo com você antes de disparar.

Se preferir zero notificação, faço a mesma prova removendo temporariamente o token de push da conta — mas aí `delivered = 0` e a linha de dedupe não é escrita (por desenho), então o teste vira "dedupe por RPC" apenas, checando o retorno de `list_accounts_due_for_reminder()` com e sem linha em `care_reminder_sent`.

## Teste 2 — Conta sem tarefas elegíveis

Uso `024ba742…` (Teste Planta): 1 planta, nenhum perfil com intervalo, 0 tokens. Nada é criado nem alterado.

- Disparo manual com `{"accountId":"024ba742…"}`.
- Esperado: `accountsConsidered: 1`, `accountsNotified: 0`, `pushSent: 0`, `pushFailed: 0`, `accounts: []` (o loop faz `continue` antes de notificar).
- Prova complementar: `select count(*) from care_reminder_sent where account_id='024ba742…'` = 0 antes e depois.
- Zero push (a conta não tem token) — nenhum ruído no seu aparelho.

## Teste 3 — Integridade e observabilidade do log

- **Ciclo vazio**: comparo `count(*)` de `reminder_run_log` antes/depois do disparo do Teste 2 e mostro a linha nova: `started_at` < `finished_at`, `error` nulo, contadores todos 0 e `triggered_manually: true`.
- **Ciclo com entrega**: a linha gerada no passo 2 do Teste 1 deve trazer `accounts_considered: 1`, `accounts_notified: 1`, `push_sent: 1`, `push_failed: 0`, `stale_tokens_removed: 0`, `triggered_manually: false`.
- **Ciclo automático**: reporto também a linha do cron das :05 mais próxima, para mostrar que ciclos sem contas elegíveis continuam gravando uma única linha coerente.

## Limpeza ao final

- `reminder_hour` da conta real restaurado para `9`.
- Linha de `care_reminder_sent` criada no teste removida (chave `account_id` + `local_date` de hoje), para não bloquear o lembrete real de amanhã… na prática ela é de hoje, então removo só se você quiser receber o lembrete de hoje novamente; caso contrário deixo, é o comportamento normal.
- Nada mais é criado: sem contas novas, sem plantas novas, sem tokens novos. Linhas de `reminder_run_log` são histórico e ficam.

## Confirmação que preciso de você

1. Autorizo 1 push real no aparelho no Teste 1 (ou prefere a variante sem push)?
2. Devo apagar a linha de `care_reminder_sent` do dia ao final?
