# Fase 4.2 — Ler rótulo de produto por foto

Foto do rótulo → extração estruturada por IA → rascunho editável no formulário → salvar somente após confirmação do usuário. O cadastro manual permanece intocado como fallback.

## 1. Infraestrutura atual (verificada)

- **Upload + IA já existem na Fase 1**: `src/lib/plant-identification.ts` faz upload direto do browser para o bucket privado `plant-photos` em `{account_id}/_staging/{uuid}.ext` (validação de tipo/tamanho, máx. 8 MB, jpeg/png/webp), e `src/lib/plant-identification.functions.ts` é um `createServerFn` com `requireSupabaseAuth` que: resolve as contas ativas do usuário, rejeita `accountId` fora delas, exige que todo path comece com `{accountId}/`, baixa os bytes via `supabaseAdmin` e chama o provider.
- **Não há Edge Functions para IA**: tudo é server function TanStack. A Fase 4.2 segue o mesmo padrão (nada de Edge Function nova).
- **Providers**: `src/lib/ai/provider-registry.server.ts` seleciona por env `AI_VISION_PROVIDER` entre `kindwise` (default), `lovable` e `logorion`. O adapter `src/lib/ai/logorion.server.ts` é hoje um stub que falha com `not_configured` — **o projeto não usa LogoriOn de fato**. Menor adaptação compatível: leitura de rótulo é OCR/extração genérica, não botânica, então usa diretamente o **Lovable AI Gateway** (`src/lib/ai/ai-gateway.server.ts`, secret `LOVABLE_API_KEY` já existente) com **`google/gemini-3.7-flash`** (modelo barato, multimodal). Nenhum secret novo. Se LogoriOn for contratado depois, entra como mais um adapter atrás da mesma interface, sem mexer na UI.
- **`ai_usage_log`**: já tem `account_id`, `user_id`, `feature`, `provider`, `model`, `status`, `tokens_in/out`, `latency_ms`, `cost_usd`, `credits_used`, `plant_id`, `summarized_payload` (trigger limita a 4096 bytes) e nega INSERT ao cliente — a escrita passa por `logAiUsage` com service role. Basta acrescentar a constante `AI_FEATURE_PRODUCT_LABEL = "product_label"` e alguns campos opcionais de payload. Nenhuma migração é necessária nessa tabela.
- **`products`**: já tem todos os campos alvo da extração (`name`, `brand`, `category`, `npk`, `description`, `quantity`, `unit`, `expires_at`, `notes`) com RLS por `is_account_member(account_id)`.
- **Buckets**: `plant-photos` (privado) e `database_export_24_08_26`. `plant-photos` é semanticamente de plantas e suas policies servem o domínio de plantas — **não será reutilizado**.

## 2. Experiência de usuário

- **CTA**: em `/products`, botão secundário "Ler rótulo por foto" ao lado do "+" e também no bloco de lista vazia; no formulário `/products/new`, um link discreto no topo ("Preencher a partir de uma foto"). Na edição, nada — evita sobrescrever dados existentes por engano.
- **Rota nova** `/products/label` (mobile-first, mesmo chrome `PlantScreen` da identificação de plantas), com passos:
  1. **Captura** — `input capture="environment"` + escolher da galeria. Uma foto basta; um botão "Adicionar verso" permite a segunda (máx. 2). Sem exigir duas no primeiro uso.
  2. **Prévia** — miniaturas, remover/refazer, botão "Ler rótulo".
  3. **Processando** — reaproveita o padrão de `AnalyzingStep` (upload → analisando).
  4. **Resultado** — abre o formulário de produto pré-preenchido em modo rascunho.
- **Rascunho, nunca gravação automática**: a IA só popula estado local do `ProductForm`; o produto só existe depois que o usuário toca em "Salvar".
- **Campos extraídos**: nome, marca, categoria (mapeada para a lista existente), NPK, quantidade, unidade, validade, descrição/uso e dose/instruções (concatenada em `notes` como bloco identificável). Campos não encontrados ficam vazios — nunca inventados.
- **Confiança sem falsa precisão**: por campo, apenas dois estados visuais — "lido do rótulo" (badge discreto no label) e "não encontrado" (campo vazio, placeholder normal). Um aviso único no topo: "Confira os dados antes de salvar." Sem percentuais.
- **Estados**: permissão/câmera indisponível (fallback para galeria), upload falhou (retry por foto), processando, erro do provider (retry quando `retryable`), rótulo ilegível, imagem não é rótulo de produto, cancelar (descarta e volta), nova foto (recomeça).

## 3. Backend e IA

- Nova server function `src/lib/product-label.functions.ts` → `readProductLabel`, `POST`, com `.middleware([requireSupabaseAuth])`, espelhando as travas de tenant de `plant-identification.functions.ts` (membership ativa + prefixo `{accountId}/` em todo path).
- Adapter `src/lib/ai/product-label.server.ts`: Gemini Flash via AI Gateway, `Output.object` com schema Zod estrito (todos os campos nullable), timeout de 45 s, temperatura baixa. Prompt exige JSON puro, proíbe inventar valores, exige `isLabel: false` quando a foto não é um rótulo e `unreadable: true` quando ilegível.
- Pós-validação no servidor, nunca confiar na IA: NPK só aceito se casar com `NPK_PATTERN`; `quantity` só se numérico ≥ 0; `unit` só se pertencer a `PRODUCT_UNITS`; `category` só se pertencer a `PRODUCT_CATEGORIES`; `expires_at` só se for data ISO válida; textos truncados. O que não passar vira `null`.
- Limites: 1–2 imagens, jpeg/png/webp, máx. 8 MB por arquivo, redimensionamento no cliente para lado maior de 1600 px antes do upload (reduz custo e latência).
- **Erros**: reutiliza `AiVisionError`/categorias existentes (`timeout`, `rate_limited`, `no_credits`, `provider_blocked`, `provider_unavailable`, `invalid_image`, `unknown`) e a semântica de retry do Gateway. JSON inválido → categoria `unknown`, sem retry automático.
- **`ai_usage_log`**: uma linha por tentativa, sucesso ou falha, com `feature: "product_label"`, provider/modelo, tokens, latência, custo/créditos quando reportados, e payload resumido (`image_count`, `fields_extracted`, `is_label`, `unreadable`, `error_category`). Nenhum texto de rótulo é persistido no log.
- Chaves de IA só no servidor (`process.env` dentro do handler), como já é hoje.

## 4. Dados e armazenamento

- **Decisão: foto temporária, descartada após a extração.** O valor do rótulo é o dado estruturado, não a imagem; guardar fotos de rótulo cria custo e superfície de dados sem uso no cenário atual (uso pessoal/profissional pequeno-médio). A imagem é apagada logo após a leitura, e também em cancelamento/erro (best-effort).
- **Bucket novo privado `product-labels`** (criado pela ferramenta de storage), com policies em `storage.objects` restritas a `is_account_member` sobre o primeiro segmento do path: `{account_id}/{uuid}.ext`. Nada de reuso de `plant-photos`.
- **Nenhuma migração em `products` ou `ai_usage_log`** — a única mudança de banco são as policies do bucket novo (aditivas). Limpeza: exclusão imediata pós-extração; sobras eventuais ficam isoladas por conta.

## 5. Entrega e QA

**Bloco A — Storage**: criar bucket privado `product-labels` + policies RLS por conta.

**Bloco B — Backend/IA**: `src/lib/ai/product-label.server.ts` (schema, prompt, mapeamento de erro), `src/lib/ai/usage-log.server.ts` (+`AI_FEATURE_PRODUCT_LABEL` e campos de payload), `src/lib/product-label.functions.ts`.

**Bloco C — Cliente/upload**: `src/lib/product-label.ts` (validação, redimensionamento, upload/delete de staging, tipos do rascunho).

**Bloco D — UI**: `src/routes/_authenticated/products.label.tsx` + passos em `src/components/products/label/` (captura, prévia, processando, erro); `ProductForm` ganha suporte a `draftFields` (badge "lido do rótulo"); CTAs em `products.index.tsx` e `products.new.tsx`.

**Bloco E — i18n e QA**: chaves pt/en/es em `src/i18n/translations.ts`, `head()` da rota nova, execução dos testes.

**Testes**
- Rótulo nítido: campos preenchidos coerentes.
- Frente + verso: uma única chamada, dados combinados.
- NPK `4-5-6` reconhecido; NPK fora do padrão descartado (campo vazio).
- Foto borrada → estado "rótulo ilegível"; foto que não é rótulo → estado "não é um rótulo".
- Produto sem NPK: salva normalmente.
- Falha de provider: mensagem correta e retry só quando aplicável.
- Nada é gravado em `products` antes do "Salvar".
- RLS: conta B não lê a foto nem os produtos da conta A.
- Exatamente uma linha em `ai_usage_log` por tentativa, inclusive nas falhas.
