# QA Fase 3.3 — Bloco B: fuso horário, token morto e múltiplos dispositivos

## Estado real verificado agora

- Contas de QA disponíveis, todas sem token de push: `bcb26fe4…` (Tester QA, 1 planta, 1 perfil com intervalo), `c7469131…` (Tester QA, 4 plantas, 1 perfil com intervalo), `6e8f4626…` (Tester QA, `Europe/Madrid`, hora 7, 0 plantas), `024ba742…` (Teste Planta, 1 planta, 0 perfis).
- Conta real `fffbe247…` (Rogerio Correa): `UTC`, hora 9, 1 token válido, 1 linha em `care_reminder_sent` (a de hoje, do Bloco A).
- `care_reminder_sent` só tem essa 1 linha no banco inteiro.
- Classificação de token morto em `fcm.server.ts`: `stale = true` quando HTTP 404, ou `error.status` = `NOT_FOUND`/`UNREGISTERED`, ou HTTP 400 cujo corpo contenha `registration-token` ou `not a valid FCM`.

## Ponto crítico sobre o Teste 2 (ler antes de aprovar)

Um token sintético (string inventada) **não** retorna `UNREGISTERED`. O FCM v1 responde HTTP 400 com `error.status: INVALID_ARGUMENT` e mensagem do tipo *"The registration token is not a valid FCM registration token"*. O código atual cobre esse caso pela terceira condição (400 + regex `registration-token|not a valid FCM`), então **deve** ser classificado como morto — mas isso depende do texto exato devolvido pelo Google, que pode variar.

Por isso o Teste 2 é feito em duas etapas: primeiro um disparo de sonda para ler a resposta real, e só depois a conclusão. Se o corpo não casar com a regex, o resultado será `staleTokensRemoved: 0` e eu reporto isso como uma lacuna real de tratamento (`INVALID_ARGUMENT` não é reconhecido), propondo o ajuste em plano separado — sem alterar código nesta rodada.

## Teste 1 — Fuso horário (zero push)

Conta usada: `6e8f4626…` (Tester QA, já em `Europe/Madrid`) e `bcb26fe4…` (Tester QA, hoje em `UTC`). Nenhuma tem token; a conta real não é tocada.

Passos:
1. Snapshot de `id, timezone, reminder_hour` das duas contas.
2. Definir `6e8f4626…` → `Europe/Madrid` com `reminder_hour` = hora local de Madrid no instante do teste (elegível).
3. Definir `bcb26fe4…` → `America/Sao_Paulo` com o mesmo `reminder_hour` numérico (São Paulo está 5h atrás de Madrid, então no mesmo instante UTC essa conta **não** é elegível).
4. Executar apenas `select * from list_accounts_due_for_reminder()` — nada de HTTP, nada de FCM, nada de push.
5. Evidência esperada: a lista contém `6e8f4626…` com `timezone: Europe/Madrid` e `local_date` de Madrid, e **não** contém `bcb26fe4…`.
6. Prova complementar (mesma seleção, papéis invertidos): trocar os `reminder_hour` para a hora local de São Paulo e reexecutar a função — agora `bcb26fe4…` aparece e `6e8f4626…` some. Isso descarta coincidência e prova que a decisão vem do par timezone+reminder_hour, não do relógio do servidor.
7. Restaurar exatamente os valores do snapshot do passo 1.

Push no aparelho: **zero**. Dados criados: nenhum.

## Teste 2 — Token morto (zero push no seu aparelho)

Conta usada: `bcb26fe4…` (Tester QA) — já tem 1 planta e 1 perfil com intervalo de rega, portanto tarefa vencida existe sem eu criar nada. Confirmo isso antes com uma query de derivação. O token do seu aparelho não é lido, alterado nem apagado em nenhum passo.

Passos:
1. Snapshot: `select * from push_subscriptions` (deve continuar com exatamente 1 linha, a sua) e `count(*)` de `care_reminder_sent` da conta de QA (0).
2. Inserir 1 linha temporária em `push_subscriptions` para `bcb26fe4…` com `fcm_token = 'qa-stale-token-<uuid>'` (≥20 chars, formato claramente inválido) e `user_id` do dono dessa conta.
3. Disparo manual: `POST /api/public/hooks/care-reminders` com `{"accountId":"bcb26fe4…","dryRunDedupe":true}`. `dryRunDedupe` evita escrever linha de dedupe — e, de todo modo, com `delivered = 0` o código não escreveria.
4. Evidências esperadas: `tokens: 1`, `delivered: 0`, `pushFailed: 1`, `staleTokensRemoved: 1`, e `select count(*) from push_subscriptions where fcm_token like 'qa-stale-%'` = 0 depois.
5. Se `staleTokensRemoved: 0`: leio o log da função e o corpo do erro FCM e reporto a classificação real (`INVALID_ARGUMENT` não coberto), removendo a linha temporária manualmente.
6. Limpeza: remover a linha `qa-stale-%` (se ainda existir) e qualquer linha de `care_reminder_sent` da conta de QA (não deve haver). Conta, planta e perfil de QA já existiam — não são apagados, apenas reportados como intocados.

Push no aparelho: **zero** (o disparo é escopado à conta de QA, que não tem seu token).

## Teste 3 — Múltiplos dispositivos

Objetivo honesto: provar que o job **enumera e tenta todos os tokens da conta**, não que dois aparelhos receberam. Duas variantes, você escolhe:

**Variante A — sem push no seu aparelho (recomendada):** dois tokens sintéticos na conta de QA `bcb26fe4…`. Resultado esperado: `tokens: 2`, `delivered: 0`, `pushFailed: 2`, `staleTokensRemoved: 2`, `accountsNotified: 0`, e as duas linhas removidas. Prova o fan-out por token e a limpeza em lote. Zero push.

**Variante B — com 1 push real no seu aparelho:** insiro 1 token sintético temporário **na sua conta real** `fffbe247…` (o token real fica intocado) e disparo manual com `dryRunDedupe: true`. Esperado: `tokens: 2`, `delivered: 1`, `pushFailed: 1`, `staleTokensRemoved: 1`; o token real permanece na tabela, o sintético some. Isso é a prova mais próxima de multi-dispositivo real: entrega parcial com falha isolada não bloqueia o token bom. Custo: **1 notificação** no seu aparelho, num único passo, avisado antes.

Limpeza em ambas: remover só as linhas `qa-stale-%`; nenhuma linha de dedupe é escrita (`dryRunDedupe: true`); token real preservado.

## Resumo de limpeza e restauração

- Restaurado: `timezone` e `reminder_hour` das duas contas de QA do Teste 1 (valores do snapshot).
- Removido: todas as linhas `push_subscriptions` com `fcm_token like 'qa-stale-%'`.
- Preservado: token real do seu aparelho, conta real, plantas, perfis e logs de cuidado — nada é criado nem apagado neles.
- Histórico: linhas de `reminder_run_log` geradas pelos disparos ficam (são log, por desenho).

## Confirmação que preciso de você

1. Teste 3: Variante A (zero push) ou Variante B (1 push real)?
2. Posso usar a conta de QA `bcb26fe4…` e sua planta existente como alvo do Teste 2, sem criar nem apagar nada nela?
