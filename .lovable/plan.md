# Fase 1.3B — Plan da integração Kindwise (Onda 1: identificação botânica)

Sem Build. Estado atual verificado no código e no banco (`ai_usage_log.credits_used` numeric NOT NULL default 0 e `plant_id` uuid nullable já existem).

## 1. Arquivos a alterar

Criar:
- `src/lib/ai/kindwise.server.ts` — o `KindwiseVisionProvider`, único lugar que fala HTTP com a Kindwise.

Alterar (mínimo):
- `src/lib/ai/provider-registry.server.ts` — passar `kindwise` a ser o default; `lovable` e `logorion` continuam selecionáveis por `AI_VISION_PROVIDER`.
- `src/lib/ai/vision-provider.ts` — acrescentar `creditsUsed: number | null` em `AiVisionUsage` (tipo puro, sem lógica).
- `src/lib/ai/usage-log.server.ts` — aceitar e gravar `credits_used` e `plant_id`.
- `src/lib/plant-identification.functions.ts` — repassar `creditsUsed` e o `plant_id` (que já é validado ali) para `logAiUsage`, nos caminhos de sucesso e de erro.

Não muda: a UI (`plants.identify.tsx`, componentes de step), `plant-identification.ts`, i18n, schema, RLS.

## 2. Fluxo atual identificado

1. **Contrato**: `src/lib/ai/vision-provider.ts` — tipos puros compartilhados por cliente e servidor (`AiVisionProvider`, `PlantIdentificationCandidate`, `AiVisionError` com 8 categorias, `MAX_CANDIDATES = 3`, `MAX_IDENTIFY_IMAGES = 3`, `normalizeHint`).
2. **Seleção do provider**: `src/lib/ai/provider-registry.server.ts` — `getVisionProvider()` lê `AI_VISION_PROVIDER` e devolve `logorion` (stub que lança `not_configured`) ou, por padrão, `lovableVisionProvider`.
3. **Onde a IA roda**: `identifyPlantPhoto` em `src/lib/plant-identification.functions.ts`, um `createServerFn` com `requireSupabaseAuth`. Executa no worker server-side; o provider e o logger são carregados por `await import(...)` dentro do handler. Nada de chave no cliente.
4. **Imagens**: o cliente sobe 1–3 arquivos para `plant-photos/{account_id}/_staging/{uuid}.ext` e envia só os `storagePaths`. O servidor valida o prefixo da conta, baixa com service role e converte cada foto em `{ imageBase64, mimeType }`. A dica passa por `normalizeHint` (máx. 280 chars, nunca persistida).
5. **Transformação para a UI**: hoje dentro de `lovable-vision.server.ts` (`mapCandidates`), que já aplica a regra da Fase 1.2 — candidato só entra se tiver `commonName` **ou** `scientificName`; lista vazia → a rota vai para `uncertain`; `isPlant === false` → copy de "não é planta".
6. **`ai_usage_log`**: gravado exclusivamente por `logAiUsage` em `src/lib/ai/usage-log.server.ts`, via service role, com payload jsonb limitado a 3500 bytes (`image_count`, `hint_provided`, `plant_context`, `is_plant`, `candidate_count`, `error_category`). Chamado nos dois ramos do `try/catch` do server fn.
7. **Fallback manual**: já existe — o step `uncertain` oferece `identify.manualFallback` levando ao cadastro manual. Intocado.

## 3. Mudanças mínimas propostas

### Adapter

`kindwiseVisionProvider` em `src/lib/ai/kindwise.server.ts`, `name: "kindwise"`, implementando a mesma interface `AiVisionProvider`. Mesma forma do adapter atual: timeout por `AbortController`, `categorize()` local, erros só como `AiVisionError`.

### Transporte: JSON, não multipart

O fluxo atual já entrega as fotos como base64 em memória (o download do bucket devolve bytes que viram base64). A `plant.id v3` aceita `images: [base64...]` no corpo JSON de `POST /api/v3/identification`. Usar multipart exigiria reconstruir `Blob`/`FormData` a partir do base64 sem ganho algum. Portanto: **JSON**, com `Api-Key: <KINDWISE_API_KEY>` no header e `Content-Type: application/json`.

### Requisição da Onda 1

- Endpoint: `POST /api/v3/identification` com query `?details=common_names,rank&language=<pt|en|es>`.
- Corpo: `{ images: [...base64], similar_images: false }` mais a dica só se existir.
- **Sem** `health=auto` e sem `health=all`. Sem `similar_images`, sem `url`, sem `description`, sem `taxonomy`, sem `image` licenciada — nada além de `common_names` e `rank`.
- A dica do usuário não tem campo equivalente na Kindwise. Ela **não** vai para a API nesta onda; continua sendo só contexto do usuário e continua sendo registrada como `hint_provided: true`. Isso é uma perda funcional consciente e deve ser dita ao usuário no Build (ou a dica pode virar um filtro de ordenação local numa fase seguinte — fora de escopo).
- Chave lida com `process.env["KINDWISE_API_KEY"]` **dentro** do handler do provider; ausência → `AiVisionError("not_configured")`.

### Mapeamento da resposta

| Kindwise | Destino |
| --- | --- |
| `result.is_plant.binary` | `isPlant` (ausente → `true`, nunca inventar rejeição) |
| `result.classification.suggestions[]` | candidatos, cortados em `MAX_CANDIDATES = 3`, na ordem devolvida |
| `suggestion.name` | `scientificName` |
| `suggestion.details.common_names[0]` (no idioma pedido) | `commonName`; ausente → string vazia, e o candidato sobrevive pelo `scientificName` |
| `suggestion.details.rank` | `rank`: `species`/`genus`/`cultivar` mapeados diretamente; qualquer outro valor (`family`, `variety`, etc.) → `genus` quando mais amplo que espécie, senão `species` |
| `suggestion.probability` | `confidence` (só quando numérico entre 0 e 1) |
| — | `broadOnly`: `true` quando `rank !== "species" && rank !== "cultivar"` |
| — | `note`: `null` na Onda 1. A Kindwise não devolve texto de incerteza e nada será fabricado; a UI já lida com `note` nulo |
| `access_token` / `id` da resposta | `requestId` para o log |

O filtro final é o mesmo já usado: sobrevive quem tem `commonName` ou `scientificName`. Zero sobreviventes → `candidates: []` → a rota manda para `uncertain` → fallback manual. Nenhuma mudança de UI.

### Erros

`categorize()` no adapter, mapeando para as categorias já existentes:
- `AbortError`/timeout (limite proposto: 30s, a Kindwise responde em segundos) → `timeout` (retryable)
- 401/403 → `not_configured` (chave inválida — não é falha do usuário, não é retryable)
- 429 → `rate_limited` (retryable)
- 402 / crédito esgotado → `no_credits`
- 400 / imagem rejeitada → `invalid_image`
- 5xx → `provider_unavailable` (retryable)
- falha de rede (`fetch` rejeitado) → `provider_unavailable`

Todos viram `AiVisionError`; o server fn já converte em `{ ok: false, errorCategory, retryable }` e a UI já tem tela e textos para cada categoria. Nenhum detalhe do provider cruza a fronteira; o log detalhado fica no `console.error` do servidor.

### `credits_used`

A Kindwise cobra 1 crédito por identificação simples (sem `health`, sem `similar_images`). Regra: `creditsUsed = 1` em sucesso; `0` em erro antes de resposta útil. Se a resposta trouxer um campo de custo, ele prevalece sobre a constante. `tokensIn`/`tokensOut` ficam `0` com `usageReported: false` — a Kindwise não usa tokens. `costUsd` fica `null`; o custo em dólar é derivável do plano na Fase 6, não do provider.

### Log

`logAiUsage` ganha `creditsUsed` e `plantId` no tipo de entrada e grava nas colunas novas. Em `identifyPlantPhoto`, `plantId` é `data.plantId ?? null` — já validado como pertencente à conta antes de qualquer byte ser lido. `feature` continua `plant_identification`, `provider` passa a ser `kindwise`, `model` recebe `plant.id/v3`. `image_count` e `hint_provided` seguem no jsonb como hoje.

## 4. Riscos e cuidados

- **Dica sem uso real na API**: o campo continua na UI e no log, mas não influencia o resultado. É o principal desvio funcional da Onda 1 e precisa de decisão explícita antes do Build (manter, ocultar, ou explicar na tela).
- **`note` vazio**: a UI perde a frase de incerteza que o modelo generativo produzia. A tela já suporta `note: null`, mas o resultado fica mais seco. Aceitável na Onda 1.
- **`rank` fora do enum**: a Kindwise pode devolver ranks que o app não modela. O mapa acima é conservador de propósito — nunca promover para `species` algo mais amplo.
- **Custo em produção**: cada tentativa consome crédito real. Um usuário repetindo o fluxo gasta créditos; o log por `account_id` + `created_at` já permite detectar isso, mas não há limite por conta (fora de escopo).
- **Rollback**: como o registry mantém os três adapters, voltar ao Lovable é uma variável de ambiente, sem deploy de código.
- **Verificação obrigatória no Build**: o formato exato de `details.common_names` e `details.rank` da v3 precisa ser confirmado com uma chamada real antes de considerar a integração pronta — o mapeamento acima é do contrato documentado, não de uma resposta observada.

## 5. Decisão objetiva

**Seguro para Build**, com duas condições:

1. Cadastrar o secret `KINDWISE_API_KEY` no ambiente do servidor antes de tudo.
2. Fechar a decisão sobre a dica opcional (manter visível sabendo que não afeta o resultado, ou ocultar na Onda 1).

Nenhum SQL, nenhuma tabela nova, nenhum refactor da UI ou do fluxo. O escopo do Build são um arquivo novo e quatro alterações pequenas.
