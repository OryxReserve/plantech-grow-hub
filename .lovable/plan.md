# QA Fase 3.3 — Bloco C: validação visual de push (foreground e background)

Bloco A permanece encerrado e intocado: a linha de `care_reminder_sent` de hoje não será apagada nem recriada, e `reminder_hour` não será alterado em nenhum momento deste bloco.

## 1. Como disparar push de teste sem tocar no dedupe de hoje

Chamada única, sempre com os dois parâmetros:

```
POST https://plantech-grow-hub.lovable.app/api/public/hooks/care-reminders
x-cron-secret: <lido de cron_secrets em tempo de execução>
{ "accountId": "fffbe247-7d96-45eb-be28-d7fdf0a4a6cb", "dryRunDedupe": true }
```

Por que isso é seguro, confirmado no código de `care-reminders.server.ts`:

- Com `accountId` informado, o job ignora a janela de horário local e a checagem de dedupe existente — por isso o `reminder_hour` continua em 9 e a linha de hoje não bloqueia o disparo.
- A gravação em `care_reminder_sent` acontece somente quando `!dryRunDedupe && delivered > 0`. Com `dryRunDedupe: true`, o push é real mas **nenhuma linha é escrita, atualizada ou apagada**.
- Nenhum caminho do job faz `delete` ou `update` em `care_reminder_sent`. A linha de 24/08 fica exatamente como está.

Efeito colateral esperado e aceito: cada disparo grava 1 linha em `reminder_run_log` (histórico, preservado).

## 2. O Manjericão é suficiente?

Sim. Confirmado no estado atual: a conta `fffbe247…` tem o Manjericão com intervalo de rega diário e sem registro de rega, portanto permanentemente vencido, e é a única conta com token de push válido (1 token). O job monta o título/corpo a partir dos nomes das plantas vencidas e do total de tarefas — exatamente o que já produziu `taskCount: 1, plantNames: ["Manjericão"]` nas execuções anteriores.

Nada será alterado: nem planta, nem perfil de cuidado, nem intervalo, nem `reminder_hour`, nem log de cuidado. Nenhum dado de QA será criado para este bloco.

## 3. Teste foreground (1 notificação)

1. Você abre o Plantech no Chrome do Android, deixa a aba **visível e em primeiro plano** (idealmente na tela de Tarefas) e me avisa.
2. Eu aguardo essa confirmação — não disparo antes.
3. Eu executo **exatamente 1** chamada com `accountId` + `dryRunDedupe: true`.
4. Você confirma visualmente se a notificação apareceu (bandeja/heads-up) e se o conteúdo cita o Manjericão.
5. Eu registro da resposta: `tokens`, `delivered`, `pushFailed`, `staleTokensRemoved`, `taskCount`, `plantNames`, e a linha correspondente de `reminder_run_log`.

Evidência do handler: em foreground o Chrome **não** exibe nada sozinho — quem exibe é `startForegroundPushListener`, que chama `registration.showNotification` com a tag `plantech-care-reminder`. Não há log server-side desse handler; a evidência é a notificação aparecer com `delivered: 1`. Se quiser evidência textual, no console do Chrome (chrome://inspect ou DevTools remoto) pode verificar ausência de `[push] foreground listener failed`. Isso é opcional e feito por você — não tenho acesso ao console do seu aparelho.

## 4. Teste background (1 notificação)

1. Você minimiza o Chrome ou troca de app, deixando o Plantech em segundo plano, e me avisa.
2. Eu aguardo a confirmação.
3. Eu executo **exatamente 1** chamada idêntica à do passo anterior.
4. Você confirma visualmente o aparecimento da notificação e, opcionalmente, que tocá-la abre `/tasks` (comportamento de `notificationclick`).
5. Eu registro os mesmos contadores e a linha de `reminder_run_log`.

Evidência do worker: quem exibe é `onBackgroundMessage` em `public/firebase-messaging-sw.js`, também com a tag `plantech-care-reminder`. Logs do service worker ficam no dispositivo; a evidência prática é a notificação exibida com o ícone/badge do app e o clique abrindo `/tasks`.

## 5. Como confirmar que não houve duplicação

O payload já leva `webpush.notification.tag = "plantech-care-reminder"` e ambos os handlers usam a mesma tag ao chamar `showNotification`. Consequência: mesmo que o navegador exiba a notificação nativa e o handler chame `showNotification`, o sistema **substitui** em vez de empilhar, porque a tag é idêntica.

Verificação em cada cenário:
- Contar as notificações visíveis na bandeja logo após o disparo: deve haver **exatamente 1** item do Plantech.
- Confirmar que a resposta trouxe `tokens: 1` e `delivered: 1` — um único envio, um único token.
- Após o segundo teste (background), a bandeja deve continuar com 1 item do Plantech (o novo substitui o anterior pela tag), e não 2 acumulados. Se você tiver descartado o primeiro, basta observar que só existe 1.

## 6. Limite de ruído

No máximo **2 notificações** no total: uma no teste foreground e uma no background. Cada disparo só acontece após sua confirmação explícita de que o app está no estado certo. Nenhum disparo extra, nenhum reteste sem você pedir.

## Resumo do que será tocado

| Item | Ação |
|---|---|
| `care_reminder_sent` | Nenhuma escrita, nenhuma leitura destrutiva — linha de hoje intacta |
| `accounts.reminder_hour` | Não alterado |
| Plantas, perfis, logs de cuidado | Não alterados |
| `push_subscriptions` | Só leitura; nenhum token sintético neste bloco |
| `reminder_run_log` | 2 linhas novas (histórico normal) |
| Código, cron, FCM, RLS | Nenhuma alteração |
