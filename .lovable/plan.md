# QA Fase 3.3 — Bloco A (plano de execução)

## Observação importante antes de começar

O Bloco A já foi executado hoje (24/08/2026, por volta das 18:40 UTC) e passou. O estado atual do banco confirma:

- `care_reminder_sent` tem exatamente 1 linha: conta `fffbe247…` (Rogerio Correa), `local_date = 2026-08-24`, `task_count = 1`, `delivered = 1`.
- `reminder_run_log` guarda a sequência esperada: entrega real (18:40:03 — considered 1, notified 1, push 1), ciclo bloqueado pelo dedupe (18:40:04 — considered 0) e ciclo manual sem tarefas (18:40:13 — considered 1, notified 0).

Ou seja: os três testes deste bloco já têm evidência gravada. Este plano descreve como **reexecutar do zero** caso você queira uma rodada nova e observada ao vivo. Se preferir, posso apenas apresentar o relatório com as evidências já existentes, sem tocar em nada.

## Dados de QA escolhidos

| Papel no teste | Conta | Por quê |
|---|---|---|
| Conta com entrega real | `fffbe247…` "Rogerio Correa" | É a **única** conta do projeto com token de push válido (1 token) e com tarefa vencida (Manjericão, intervalo diário, sem log de rega). Não há alternativa segura. |
| Conta sem tarefas elegíveis | `024ba742…` "Teste Planta" | Tem 1 planta e **nenhum** perfil de cuidado com intervalo, e nenhum token. É exatamente o cenário do Teste 2, sem precisar criar ou alterar nada. |

Nenhuma planta, perfil de cuidado ou log de cuidado será criado, alterado ou apagado em nenhuma conta.

## Teste 1 — Idempotência por conta + dia local

Bloqueio a resolver primeiro: a linha de dedupe de hoje da conta `fffbe247…` já existe. Enquanto ela existir, qualquer disparo novo retorna zero contas — o que já é a prova da idempotência, mas impede ver o primeiro disparo com entrega.

Duas variantes, você escolhe:

- **Variante A (sem push novo, sem mexer em nada):** disparo único pelo caminho do cron. Esperado `accountsConsidered: 0`, nenhuma linha nova. Prova a idempotência contra a linha real de hoje. Zero ruído no aparelho.
- **Variante B (rodada completa, 1 push real):** apago a linha de dedupe de hoje, executo os dois disparos e deixo a nova linha no lugar. Custo: **exatamente 1 notificação** no seu Android.

Fluxo da Variante B:

1. Snapshot: contagem e conteúdo de `care_reminder_sent`, e `timezone` / `reminder_hour` da conta (hoje: UTC / 9).
2. Apagar a linha `(fffbe247…, 2026-08-24)`.
3. Ajustar `reminder_hour` para a hora UTC corrente, para a conta entrar na janela do cron.
4. Disparo 1: `POST /api/public/hooks/care-reminders` com `x-cron-secret`, **body vazio** (sem `accountId`, sem `dryRunDedupe`) — caminho idêntico ao do pg_cron. Esperado: `accountsNotified: 1`, `pushSent: 1`, `delivered: 1`.
5. Restaurar `reminder_hour = 9` imediatamente.
6. Disparo 2: idêntico ao 1. Esperado: `accountsConsidered: 0`, `pushSent: 0`.
7. Conferir que `care_reminder_sent` voltou a ter exatamente 1 linha para a chave (`account_id`, `local_date`).

Controle de ruído: só o disparo 1 pode gerar notificação; o disparo 2 é justamente a prova de que não gera. Aviso antes de executar.

**Limpeza:** `reminder_hour` restaurado para 9. A linha de dedupe do dia **permanece** — é o comportamento correto que impede um segundo lembrete hoje.

## Teste 2 — Conta sem tarefas elegíveis

1. Confirmar por consulta que `024ba742…` continua sem perfil de cuidado com intervalo e sem token.
2. Disparo manual com `{"accountId":"024ba742-c7c4-4819-986f-eb1ddc043a7b"}`.
3. Esperado: `accountsNotified: 0`, `pushSent: 0`, `staleTokensRemoved: 0`.
4. Confirmar que **nenhuma** linha nova apareceu em `care_reminder_sent` para essa conta.

Sem push, sem escrita, sem limpeza necessária.

## Teste 3 — Integridade e observabilidade do log

Sem disparos extras: leitura de `reminder_run_log` cobrindo as execuções dos Testes 1 e 2 mais os ciclos automáticos do cron. Vou verificar, linha a linha:

- `started_at` e `finished_at` preenchidos e coerentes com o horário do disparo;
- `error` nulo;
- `triggered_manually` verdadeiro só nos disparos com `accountId`, falso no caminho do cron;
- contadores consistentes: `push_sent + push_failed` compatível com o número de tokens tentados, e `accounts_notified <= accounts_considered`;
- que um ciclo com zero contas elegíveis gera **uma** linha (e não zero nem duas).

`reminder_run_log` é preservado integralmente como histórico.

## Restrições respeitadas

- Nenhuma alteração em código, cron, FCM, RLS ou lógica de cálculo de tarefas.
- Único dado real tocado: `reminder_hour` da sua conta (temporário, restaurado no mesmo passo) e, só na Variante B, a linha de dedupe de hoje.
- Nada é executado até sua aprovação.

## O que preciso decidir com você

1. Teste 1: Variante A (zero push) ou Variante B (1 push real)?
2. Quer a rodada nova ou prefere só o relatório das evidências já gravadas hoje?
