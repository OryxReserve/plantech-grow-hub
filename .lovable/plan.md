# Diagnóstico: FCM aceitou (delivered:1) mas nada apareceu na tela

Nenhum código foi alterado. Abaixo o que foi verificado, na ordem pedida.

## 1. Payload exato enviado ao HTTP v1

`POST https://fcm.googleapis.com/v1/projects/plantech-app/messages:send`

```json
{
  "message": {
    "token": "<token do dispositivo>",
    "notification": { "title": "1 planta precisa de atenção hoje", "body": "Manjericão" },
    "data": { "...": "..." },
    "webpush": {
      "notification": { "icon": "/icons/icon-192.png", "badge": "/icons/icon-192.png" },
      "fcmOptions": { "link": "/tasks" }
    }
  }
}
```

Conclusão: **não é data-only**. Existe `message.notification` com title/body, então o Chrome deveria exibir automaticamente em background, mesmo sem handler customizado.

## 2. Service worker

`public/firebase-messaging-sw.js` está publicado na raiz e **tem** `messaging.onBackgroundMessage(...)` chamando `self.registration.showNotification(title, options)` (tag `plantech-care-reminder`, icon/badge, `notificationclick` implementado). Ou seja, o item 2 também está correto.

Ressalva importante: o SW é registrado como `/firebase-messaging-sw.js?apiKey=...&projectId=...`. Se a query string não chegar (ou `apiKey` vier vazio do servidor), o bloco `firebase.initializeApp` inteiro é pulado e o `onBackgroundMessage` nunca é anexado. O push nativo do Chrome ainda exibiria a notificação (porque há `message.notification`), mas isso é um ponto a confirmar no DevTools.

## 3. Causa mais provável (código está correto)

Como o payload e o SW estão certos, restam três hipóteses, em ordem de probabilidade:

1. **App em primeiro plano no momento do envio.** Com a aba do Plantech aberta e visível no Chrome Android, o FCM entrega via `onMessage` (foreground), **não** via `onBackgroundMessage` — e o projeto não tem nenhum handler `onMessage`. Resultado exato do que você viu: entrega com sucesso, nada na tela. Esse é o candidato número um.
2. **Notificações do Chrome desativadas no nível do sistema Android**, ou "Não perturbar"/economia de bateria ativos (Configurações → Apps → Chrome → Notificações; e canal "Sites").
3. **Tab/collapse ou SW inativo**: mensagem chegou ao dispositivo mas foi suprimida.

## 4. Como separar as hipóteses (verificação, sem alterar lógica)

- Você confere no aparelho: Configurações do Android → Apps → Chrome → Notificações ligadas (e o canal "Sites"), e "Não perturbar" desligado.
- Novo disparo com o **Chrome totalmente em background** (tela inicial do Android, aba do Plantech fechada ou minimizada) — se a notificação aparecer, confirma a hipótese 1.
- `chrome://inspect/#devices` via USB: inspecionar o service worker `firebase-messaging-sw.js`, confirmar estado `activated` e observar o evento `push` chegando no console do worker.

## 5. Correção proposta (só após sua confirmação)

Se a hipótese 1 se confirmar, a correção é pequena e não toca no motor de tarefas:

- Adicionar um handler `onMessage` no cliente (registrado junto com o push) que chama `registration.showNotification(...)` com o mesmo formato do SW, evitando notificação duplicada via `tag`.
- Opcionalmente, adicionar `webpush.headers.Urgency: high` e `TTL` explícito no envio, para reduzir atraso em modo economia de bateria.

Nada de cron ainda; `daily-care-check` permanece intocado.
