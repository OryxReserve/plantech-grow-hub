# Fase 3.3 — Republicar, validar o cron e fechar o QA

## Situação atual (verificada agora)

- O job `daily-care-check` existe, está ativo, roda `5 * * * *` e envia o header `x-cron-secret`.
- O valor no comando do job **é igual** ao valor atual em `cron_secrets.care_reminders` — não precisa recriar o job por causa do segredo.
- As duas últimas chamadas HTTP do cron responderam **401** (`{"error":"Unauthorized"}`) — a última às 14:05 UTC. Confirma o diagnóstico: a URL de produção ainda roda a versão antiga da rota, que só aceitava `LOVABLE_CRON_SECRET`.
- `reminder_run_log` tem 6 linhas, a última em 12:53 UTC (execuções manuais) — nenhuma vinda do cron, coerente com o 401.

Detalhe importante: o segredo está **literal** dentro do comando do job (não lido de `cron_secrets` em tempo de execução). Funciona hoje, mas se o segredo for rotacionado o job quebra silenciosamente.

## Passo 1 — Publicar

Publicar o projeto para que a produção passe a rodar a rota que aceita `x-cron-secret` validado contra `cron_secrets`.

## Passo 2 — Confirmar a versão publicada

Chamada `POST` à rota de produção com o header correto e `{"accountId": "<conta de QA>", "dryRunDedupe": true}`, esperando `200` com o resumo em JSON (sem 401).

## Passo 3 — Ajustar o job para ler o segredo em tempo de execução

Recriar o job com o header montado a partir da tabela, para eliminar o segredo literal:

```text
headers := jsonb_build_object(
  'Content-Type','application/json',
  'x-cron-secret',(select secret from cron_secrets where name='care_reminders')
)
```

Mesmo nome (`daily-care-check`) e mesmo schedule (`5 * * * *`).

## Passo 4 — Aguardar a execução real

Esperar o minuto 5 da próxima hora e reportar, a partir de `net._http_response`, `cron.job_run_details` e `reminder_run_log`:
- status HTTP da chamada (esperado 200, não 401);
- quantas contas `list_accounts_due_for_reminder()` retornou naquele ciclo;
- push enviados / falhados na linha correspondente do log.

Sem esse número concreto a fase não é considerada fechada.

## Passo 5 — Checklist de QA

1. **Idempotência**: dois disparos manuais no mesmo dia local para a mesma conta (sem `dryRunDedupe`); o segundo não deve enviar nem criar nova linha em `care_reminder_sent`. Evidência: contagem de linhas antes/depois + `delivered` do segundo disparo.
2. **Fuso horário**: criar conta de QA em `America/Sao_Paulo` com `reminder_hour` que bate com o horário local dela e outra em `Europe/Madrid` fora da hora; verificar quem `list_accounts_due_for_reminder()` retorna em cada hora.
3. **Conta sem tarefas**: conta com plantas sem intervalo configurado — confirmar zero envio e zero linha em `care_reminder_sent`.
4. **Token morto**: inserir um `fcm_token` inválido em `push_subscriptions` para a conta de QA, disparar e confirmar que a linha some (`staleTokensRemoved` > 0) e que o token válido continua.
5. **Múltiplos dispositivos**: com 2 tokens na conta (um real + um inválido, ou dois reais), confirmar `tokens: 2` e envio para todos.
6. **Foreground vs background**: dois disparos reais no seu aparelho — app aberto (`onMessage`) e app minimizado (`onBackgroundMessage`) — confirmando exibição nos dois casos e sem duplicar (mesma `tag`).
7. **reminder_run_log**: confirmar que cada execução grava linha mesmo com zero contas due (verificar após um ciclo de cron em hora sem contas elegíveis).

Itens 1–5 e 7 eu executo e reporto com números; o item 6 depende da sua confirmação visual no aparelho.

## Limpeza ao final

Remover contas/plantas/tokens criados só para o QA, mantendo o Manjericão com rega de 1 dia como combinado.
