# Fase 1 — Relatório de validação (sem novas features)

## 1. Arquivos criados/alterados

Criados:
- `src/lib/ai/vision-provider.ts` — contrato tipado `AiVisionProvider`, categorias de erro, `MAX_CANDIDATES`, tipos aceitos.
- `src/lib/ai/ai-gateway.server.ts` — provider do Lovable AI Gateway (header `Lovable-API-Key`, captura do run id).
- `src/lib/ai/lovable-vision.server.ts` — adaptador real (`google/gemini-3-pro`), prompt por idioma, timeout de 45s, mapeamento de erros.
- `src/lib/ai/logorion.server.ts` — stub isolado do futuro adaptador.
- `src/lib/ai/provider-registry.server.ts` — seleção do provider ativo.
- `src/lib/ai/usage-log.server.ts` — escrita de `ai_usage_log` via service role.
- `src/lib/plant-identification.functions.ts` — `identifyPlantPhoto`, `createPlantFromIdentification`, `applyIdentificationToPlant`.
- `src/lib/plant-identification.ts` — validação de arquivo e ciclo de vida do staging no cliente.
- `src/routes/_authenticated/plants.identify.tsx` — máquina de estados do fluxo.
- `src/components/plants/identify/` — `photo-step.tsx`, `analyzing-step.tsx`, `result-step.tsx`, `error-step.tsx`, `confirm-step.tsx`.

Alterados:
- `src/i18n/translations.ts` — chaves `identify.*` em pt/en/es.
- `src/routes/_authenticated/app.tsx`, `plants.index.tsx`, `plants.$plantId.index.tsx` — pontos de entrada.
- `src/lib/plant-photos.ts` — `extensionFor` compartilhado com o staging.
- `package.json` — `ai`, `@ai-sdk/openai-compatible`.

## 2. Limpeza do staging

Caminho do objeto temporário: `{account_id}/_staging/{uuid}.{ext}` (a política de storage valida o primeiro segmento = conta).

Pontos de limpeza:
- Troca de foto (`handleSelectFile`) e "trocar foto" (`resetPhoto`): remove o objeto anterior.
- Desmontagem da rota (`useEffect` de cleanup com `stagingRef`): remove se `persistedRef` for falso — cobre navegação/abandono no meio do fluxo.
- Planta existente: após `applyIdentificationToPlant`, o staging é removido (a foto não é anexada nesse caminho) e `persistedRef` vira true.
- Planta nova: o servidor copia staging → `{account}/{plantId}/{arquivo}` e só então remove o staging; se o insert em `plant_photos` falhar, a cópia é revertida (`remove([finalPath])`) e retorna `photoAttached: false`.
- Toda remoção é best-effort: falha só gera `console.error`, nunca bloqueia o usuário.

Lacuna conhecida: fechar a aba/matar o app durante a análise não dispara o cleanup (não há `beforeunload` nem job de varredura). O objeto órfão fica no bucket, isolado por conta.

## 3. Comportamento do `ai_usage_log`

`ai_usage_log` nega INSERT a `authenticated`; a escrita ocorre só no servidor com service role.

- Sucesso do provider + log ok: 1 linha `status='success'` com provider, model, tokens, `latency_ms`, `cost_usd` (null) e payload `{request_id, candidate_count, is_plant, usage_reported, plant_context}`. Resposta traz `usageLogged: true`.
- Sucesso do provider + falha do log: `logAiUsage` captura o erro, loga no servidor e retorna `false`; o resultado da IA é entregue normalmente com `usageLogged: false`, e a UI mostra aviso de auditoria (`usageWarning`). Nada é revertido.
- Erro do provider: 1 linha `status='error'`, tokens 0, `model: null`, payload `{error_category, plant_context}`; a server function retorna `{ok:false, errorCategory, retryable}` em vez de lançar. Erros anteriores ao provider (conta/planta inválida, foto ausente) lançam e não geram linha de log.

Payload é serializado e truncado para `{truncated:true}` acima de 3500 bytes (trigger rejeita >4096).

## 4. Ausência de token usage

Quando o gateway não reporta tokens, gravamos `tokens_in`/`tokens_out` como `0` e marcamos `usage_reported: false` no payload — os zeros são explicitamente placeholders, nunca estimativas. `cost_usd` é sempre `null` (nenhum custo é inventado no cliente ou no servidor).

## 5. HEIC

Bloqueado explicitamente. `IDENTIFY_ACCEPTED_TYPES = image/jpeg | image/png | image/webp` alimenta tanto o `accept` dos inputs quanto `validateIdentifyFile`, que rejeita antes do upload com a mensagem `identify.fileTypeError`. Limite de tamanho: 8 MB. Não há conversão HEIC → JPEG nesta fase.

## 6. QA manual pendente (do seu lado)

1. Fluxo real de câmera em iPhone/Android (o Playwright não injeta arquivo em input com `capture`), confirmando o bloqueio amigável de HEIC no iOS.
2. Uma identificação ponta a ponta com foto real: verificar candidatos, confiança e nota no idioma ativo (pt/en/es).
3. Criar planta a partir do resultado e confirmar a foto promovida na galeria + `is_primary`.
4. Aplicar identificação a uma planta existente e confirmar que o staging não ficou no bucket.
5. Abandonar o fluxo (voltar/trocar foto) e conferir ausência de objetos em `_staging`.
6. Conferir as linhas em `ai_usage_log` (sucesso e erro) escopadas pela conta correta.
7. Caso de erro: rodar com foto que não é planta (estado "incerto") e validar o fallback manual.
