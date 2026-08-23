# Fase 1 — Identificação de planta por foto (PLAN)

## Bloqueio real antes do BUILD

O LogoriOn **não existe no projeto**: não há URL base, nem chave, nem contrato de request/response. A única referência é a string `'logorion'` como default da coluna `ai_usage_log.provider`. Não há secret cadastrado, não há Edge Function, não há cliente HTTP.

Menor configuração necessária para execução real:
1. URL base do LogoriOn (ex.: `https://.../v1/chat/completions`)
2. Nome do header de autenticação e a chave (a guardar como secret server-side)
3. Formato do body aceito (OpenAI-compatible com blocos `image_url`, ou formato próprio)
4. Identificadores dos modelos multimodais caros disponíveis (rota Gemini Pro / Claude Sonnet)

Sem esses quatro itens não escrevo cliente algum — seria contrato inventado, o que o prompt proíbe.

**Alternativa executável hoje:** o Lovable AI Gateway já está provisionado neste projeto (`LOVABLE_API_KEY` presente, rota multimodal `google/gemini-3-pro` disponível). Posso implementar o slice inteiro contra uma interface `AiVisionProvider` com uma implementação `lovable` funcionando de verdade agora, e uma implementação `logorion` que só é ativada quando os 4 dados acima chegarem — troca por variável de ambiente, sem tocar em UI nem em persistência. `ai_usage_log.provider` grava o provedor realmente usado.

## Escopo do slice

Fluxo: escolher/tirar foto → análise server-side → resultado → confirmação → planta criada (ou espécie atualizada em planta existente) → detalhe da planta.

### Camada de servidor
- `src/lib/ai/vision-provider.server.ts` — interface tipada `identifyPlant(imageBase64, mimeType, language)` → `{ candidates: [{commonName, scientificName, note, confidence|null}], model, provider, usage, requestId|null }`. Timeout de 45s, `AbortController`, erros mapeados em categorias seguras (`provider_unavailable`, `rate_limited`, `no_credits`, `invalid_image`, `unknown`).
- `src/lib/ai/logorion.server.ts` — stub que lança blocker explícito enquanto o contrato não existe.
- `src/lib/ai/lovable-vision.server.ts` — implementação real via AI Gateway, saída JSON estruturada.
- `src/lib/plant-identification.functions.ts` — `identifyPlantPhoto` com `.middleware([requireSupabaseAuth])`:
  - resolve `account_id` **no servidor** a partir de `account_members` (status `active`) do usuário; o `accountId` enviado pelo cliente só é aceito se pertencer ao conjunto resolvido;
  - se vier `plantId`, valida que a planta é da conta resolvida antes de qualquer leitura de foto;
  - lê o objeto do bucket privado via `supabaseAdmin` (download → base64), nunca tornando o bucket público;
  - chama o provider, grava `ai_usage_log` e retorna DTO enxuto.

### Uso temporário do storage
Upload no fluxo "nova planta" acontece antes da planta existir. Caminho `{account_id}/_staging/{uuid}.ext` — a policy de storage valida a conta pelo primeiro segmento, então continua correta. Na confirmação, o objeto é **movido** para `{account_id}/{plant_id}/{uuid}.ext` e vira `plant_photos.is_primary`. Em cancelamento, falha de persistência ou saída da tela, o objeto de staging é removido.

### Registro de uso de IA
Uma linha por tentativa real, escrita server-side com `supabaseAdmin` (o cliente não tem INSERT):
`account_id`, `user_id`, `feature = 'plant_identification'`, `provider`, `model`, `status` (`success` | `error`), `tokens_in`, `tokens_out`, `latency_ms`, `cost_usd` quando disponível, `summarized_payload` (categoria do erro, request id, nº de candidatos — sempre < 4096 bytes, respeitando o trigger existente).
Falha de log **após** sucesso do provedor: o resultado é entregue ao usuário mesmo assim (não punimos o usuário por falha de telemetria), mas o erro é logado no servidor com `console.error` e o DTO retorna `usageLogged: false`, visível para diagnóstico. Nunca engolido em silêncio.

### UI
- `src/routes/_authenticated/plants.identify.tsx` — fluxo em máquina de estados: `select` → `preview` (trocar/remover) → `uploading` → `analyzing` → `result` | `uncertain` | `error`, com retry e fallback manual (segue para criação manual mantendo a foto já enviada).
- Resultado: até 3 candidatos, seleção explícita; confiança só aparece se o provedor devolver valor real.
- Confirmação com `nickname`, `species_name`, `scientific_name` editáveis.
- Planta existente: entrada pela tela de detalhe, passo de confirmação explícito, atualiza só espécie/nome científico, sem tocar nas fotos existentes.
- Entrada primária no estado vazio e no topo da lista de plantas.
- i18n pt/en/es para todas as strings novas; alvos de toque ≥44px, foco e rótulos de leitor de tela, skeletons, `prefers-reduced-motion` respeitado.

### Fora de escopo (confirmado)
Care log, lembretes, produtos, abas avançadas de perfil, diagnóstico de saúde, novas tabelas ou colunas.

## Decisão necessária de você

Escolha uma:
- **A)** Você fornece agora URL base + header de auth + chave + formato de body + IDs de modelo do LogoriOn → implemento direto contra o LogoriOn real.
- **B)** Implemento agora com o Lovable AI Gateway atrás da interface `AiVisionProvider`, com o adaptador LogoriOn pronto para plugar depois.

Sem A nem B, o slice para aqui — não vou simular resultado de IA.
