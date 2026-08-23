# Fase 1 — Identificação de planta por foto (PLAN)

Opção B confirmada: implementação real contra o Lovable AI Gateway por trás de uma interface tipada `AiVisionProvider`, com adaptador `logorion` isolado e inativo.

## 1. O que já existe (verificado no projeto)

**Auth e conta ativa**
- `src/routes/_authenticated/route.tsx`: `ssr: false`, `beforeLoad` checa `supabase.auth.getUser()` e redireciona para `/auth`; envolve tudo em `ActiveAccountProvider`.
- `src/context/active-account.tsx`: carrega usuário, `profiles` e `account_members` com `status = 'active'`, resolve `activeAccountId` (persistido em `localStorage`, multi-conta pronto) e expõe `useActiveAccount` / `useRequiredAccountId`.
- `src/start.ts` já registra `attachSupabaseAuth` em `functionMiddleware` — ou seja, server functions protegidas já recebem o bearer token automaticamente.
- `src/integrations/supabase/auth-middleware.ts` expõe `requireSupabaseAuth`, que entrega `supabase` (RLS como o usuário), `userId` e `claims`.

**Dados**
- `plants` / `plant_photos` acessados só pelo cliente, em `src/lib/plants.ts` e `src/lib/plant-photos.ts`, sempre com `.eq("account_id", accountId)`.
- `plant_photos.storage_path` é `UNIQUE`; bucket privado `plant-photos`; caminho `{account_id}/{plant_id}/{uuid}.ext`; leitura por signed URL de 1h.
- Policies de `storage.objects` validam `is_account_member(foldername(name)[1]::uuid)` — a conta é o **primeiro segmento** do caminho; o segundo segmento não é validado. Isso é o que torna um caminho de staging viável sem nova migration.
- `ai_usage_log`: existe, com RLS **somente SELECT** para membros da conta. INSERT/UPDATE/DELETE negados a `authenticated` → só `service_role` escreve. Trigger `validate_ai_usage_payload` rejeita `summarized_payload` acima de 4096 bytes. Hoje a tabela **não é usada por nenhum código**.

**Servidor**
- Nenhum `createServerFn` existe ainda no projeto (`rg` não encontrou nenhum). Esta será a primeira função de servidor — o padrão a seguir é `*.functions.ts` fora de `src/server/`, com `requireSupabaseAuth`.
- Nenhuma Edge Function.

**i18n e rotas**
- `src/i18n/translations.ts`: dicionários planos pt/en/es com chaves em ponto; `src/i18n/i18n.tsx` provê `t()` e persiste locale.
- Rotas de plantas: `plants.index.tsx`, `plants.new.tsx`, `plants.$plantId.index.tsx`, `plants.$plantId.edit.tsx`, todas sob `_authenticated`.

## 2. Realidade do provedor de IA

- **Confirmado:** `LOVABLE_API_KEY` existe no ambiente do projeto. O Lovable AI Gateway está disponível em `https://ai.gateway.lovable.dev/v1`, autenticado pelo header `Lovable-API-Key`, e aceita entrada multimodal por blocos `image_url` (URL https ou data URL base64) em `/v1/chat/completions`. Modelo multimodal caro adequado à tarefa: `google/gemini-3-pro`.
- **Confirmado:** os pacotes `ai` e `@ai-sdk/openai-compatible` **não estão instalados** hoje. Precisam ser adicionados (chamada não-streaming, saída estruturada).
- **Confirmado:** `SUPABASE_SERVICE_ROLE_KEY` está disponível no servidor via `src/integrations/supabase/client.server.ts` — necessário para escrever em `ai_usage_log`.
- **Não existe:** LogoriOn. Sem URL base, sem chave, sem contrato. Só a string `'logorion'` como default de `ai_usage_log.provider`. O adaptador nasce como stub que lança erro explícito de configuração ausente; nada é inventado.
- **Assumido (a validar em runtime na fase BUILD):** que o gateway devolve `usage.prompt_tokens` / `completion_tokens` para este modelo. Se não vier, gravamos 0 e registramos isso em `summarized_payload` — sem inventar custo.
- **Assumido:** confiança numérica. Só será exibida se o modelo devolver o campo no JSON estruturado que pedirmos; se vier vazio ou incoerente, a UI mostra apenas a nota de incerteza textual.

## 3. Plano arquivo a arquivo

**Criar**
- `src/lib/ai/vision-provider.ts` — tipos puros compartilhados (`AiVisionProvider`, `PlantIdentificationCandidate`, `IdentificationOutcome`, categorias de erro). Sem código de servidor, para poder ser importado pela UI.
- `src/lib/ai/ai-gateway.server.ts` — helper do provider do gateway (`createOpenAICompatible`, `name: "lovable"`, header `Lovable-API-Key`), lido de `process.env` **dentro** do handler.
- `src/lib/ai/lovable-vision.server.ts` — implementação real: monta a mensagem com bloco de texto + `image_url` data URL, pede saída estruturada (até 3 candidatos: `commonName`, `scientificName`, `note`, `confidence` anulável), timeout de 45s via `AbortController`, mapeia status do gateway para categorias seguras (`rate_limited`, `no_credits`, `provider_blocked`, `provider_unavailable`, `invalid_image`, `unknown`) conforme a semântica de erro do gateway (só 429/5xx são retentáveis).
- `src/lib/ai/logorion.server.ts` — stub que lança `LogorionNotConfiguredError` enquanto URL/chave/contrato não existirem.
- `src/lib/ai/provider-registry.server.ts` — escolhe o provider por env (`AI_VISION_PROVIDER`, default `lovable`).
- `src/lib/ai/usage-log.server.ts` — escrita em `ai_usage_log` com `supabaseAdmin`, payload resumido e limitado.
- `src/lib/plant-identification.functions.ts` — `identifyPlantPhoto`, `createPlantFromIdentification`, `applyIdentificationToPlant`, todas com `.middleware([requireSupabaseAuth])` e validação Zod.
- `src/lib/plant-identification.ts` — client-side: upload de staging, query keys, tipos de estado do fluxo.
- `src/routes/_authenticated/plants.identify.tsx` — fluxo novo (aceita `?plantId=` opcional via search params validados).
- `src/components/plants/identify/` — `photo-step.tsx`, `analyzing-step.tsx`, `result-step.tsx`, `confirm-step.tsx`, `error-step.tsx`.

**Alterar**
- `package.json` — adicionar `ai` e `@ai-sdk/openai-compatible`.
- `src/lib/plant-photos.ts` — extrair `extensionFor`/validação para reuso e adicionar helpers de staging (upload, remoção, promoção a foto de planta).
- `src/i18n/translations.ts` — chaves `identify.*` em pt/en/es.
- `src/routes/_authenticated/plants.index.tsx` — CTA "Identificar planta" no estado vazio e no topo da lista.
- `src/routes/_authenticated/plants.$plantId.index.tsx` — ação "Identificar espécie" no contexto de planta existente.
- `src/routes/_authenticated/app.tsx` — entrada primária no shell.

## 4. Como cada garantia é cumprida

**Segredo fora do client** — `LOVABLE_API_KEY` só é lido dentro do `.handler()`; os arquivos `.server.ts` são bloqueados do bundle do cliente por nome; nenhuma URL ou chave de provedor cruza a fronteira RPC. O cliente recebe apenas o DTO de resultado.

**Tenant validado no servidor** — a função resolve as contas do usuário por `context.supabase` (RLS como o usuário) em `account_members` com `status = 'active'`. O `accountId` vindo do cliente é aceito **apenas** se estiver nesse conjunto; caso contrário a chamada falha. Se houver `plantId`, a planta é lida com `context.supabase` filtrando por `account_id` resolvido — um id vazado de outro tenant retorna vazio e a chamada para antes de qualquer leitura de foto.

**Ciclo de vida do arquivo temporário** — no fluxo "nova planta" a foto vai para `{account_id}/_staging/{uuid}.ext`, compatível com a policy existente (conta no primeiro segmento). Na confirmação, o objeto é copiado para `{account_id}/{plant_id}/{uuid}.ext`, a linha em `plant_photos` é criada como `is_primary`, e o objeto de staging é removido. Em cancelamento, troca de foto, falha de persistência ou saída da tela, o objeto de staging é removido imediatamente. Se a criação da planta falhar após a cópia, a cópia é desfeita — sem órfãos e sem linha órfã (a foto só é registrada depois que a planta existe).

**Integridade do `ai_usage_log`** — uma linha por tentativa real, gravada com `supabaseAdmin` (`feature = 'plant_identification'`, `provider`, `model`, `status`, `tokens_in`, `tokens_out`, `latency_ms`, `cost_usd` quando disponível, `summarized_payload` com categoria de erro / request id / nº de candidatos, sempre abaixo de 4096 bytes). Sucesso do provedor + falha de log: o resultado é entregue ao usuário, o erro sobe como `console.error` no servidor e o DTO retorna `usageLogged: false`, exibido como aviso discreto na UI. Falha nunca silenciosa. Erro do provedor também gera linha, com `status = 'error'`.

## 5. Estados da UI

`select` → `preview` (trocar/remover) → `uploading` → `analyzing` → `result` | `uncertain` | `error(retry)` → `confirm` → detalhe da planta. Fallback manual leva à criação manual mantendo a foto de staging já enviada. Um único botão primário por estado, alvos ≥44px, rótulos de leitor de tela, skeletons, `prefers-reduced-motion` respeitado, paleta verde já estabelecida — sem efeitos de "mágica de IA".

## 6. Riscos e bloqueios

**Bloqueio confirmado:** LogoriOn é inexecutável hoje (sem URL, chave, contrato ou IDs de modelo). Resolvido pela Opção B; o adaptador fica isolado e inativo.

**Assunções a validar durante o BUILD (com chamada real, não simulada):**
- disponibilidade de `usage` de tokens e custo na resposta do gateway;
- se o modelo devolve confiança utilizável;
- HEIC: o gateway pode recusar `image/heic`. Se recusar, o BUILD restringe a identificação a JPEG/PNG/WEBP com mensagem clara, sem conversão de imagem no servidor (o runtime não suporta `sharp`).

**Fora de escopo, sem mudança de schema:** care log, lembretes, produtos, abas avançadas, diagnóstico. Nenhuma tabela ou coluna nova; nenhuma migration necessária.

**Recomendação:** seguro prosseguir para BUILD sob a Opção B.
