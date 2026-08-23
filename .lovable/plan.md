# Fase 1.1 — Precisão da identificação (1–3 fotos + dica opcional)

Melhoria mínima e segura sobre a Fase 1: mais contexto para o modelo, sem prometer certeza de cultivar. Sem migração de schema, sem novas features de Fase 2, sem chamada extra de IA por imagem (continua **1 request = 1 linha em `ai_usage_log`**).

## 1. Arquivos a alterar

Contrato e provider:
- `src/lib/ai/vision-provider.ts` — `IdentifyPlantInput` passa a `{ images: {imageBase64, mimeType}[], hint?: string | null, language }`; novos campos no candidato: `rank` ("species" | "genus" | "cultivar") e `broadOnly`/nota; `MAX_IDENTIFY_IMAGES = 3`, `MAX_HINT_LENGTH = 280`.
- `src/lib/ai/lovable-vision.server.ts` — monta N blocos de imagem numa única mensagem, injeta a dica como contexto de apoio, ajusta prompt e timeout.
- `src/lib/ai/logorion.server.ts` — só ajusta a assinatura do stub (segue inativo).

Servidor:
- `src/lib/plant-identification.functions.ts` — `identifyPlantPhoto` aceita `storagePaths: string[]` (1..3) + `hint`; valida cada path com o prefixo da conta; baixa as imagens em paralelo; `createPlantFromIdentification` aceita `stagingPaths: string[]` + `primaryIndex`.
- `src/lib/ai/usage-log.server.ts` — payload ganha `image_count` e `hint_provided` (booleano; o texto da dica **não** é gravado).

Cliente:
- `src/lib/plant-identification.ts` — helpers para lista de staging (`uploadStagingPhotos`, `removeStagingPhotos`), validação de limite e de dica.
- `src/routes/_authenticated/plants.identify.tsx` — estado passa de foto única para array + `primaryIndex` + `hint`.
- `src/components/plants/identify/photo-step.tsx` — tira de miniaturas, adicionar/remover, marcar principal, campo de dica.
- `src/components/plants/identify/analyzing-step.tsx`, `result-step.tsx` — mostram a primeira/principal imagem e a linguagem de incerteza.
- `src/i18n/translations.ts` — novas chaves pt/en/es.

Inalterados: RLS, políticas de storage, `auth-middleware`, `plant-photos.ts` (reutilizado), `applyIdentificationToPlant`.

### Respostas técnicas pedidas
- **Múltiplas imagens num request**: sim. O gateway aceita vários blocos de mídia na mesma mensagem `user`. Hoje enviamos um bloco `file` com `mediaType`; a mudança é apenas repetir o bloco por imagem, mantendo uma só chamada. Como as fotos vêm em base64 (bytes baixados do bucket privado), não caímos no limite de "imagens por link".
- **Structured output**: continua adequado — mesmo schema raiz, apenas campos novos e todos obrigatórios/nullable (nada de `.optional()`, sem `min/max`), preservando o guard `NoObjectGeneratedError`.
- **Timeout**: 45 s fica curto com 3 imagens + raciocínio. Proposta: 75 s e chamada em streaming consumida no servidor (`streamText` + `await result.output`) para não ficar em silêncio de rede em requisições longas. `maxRetries: 0` permanece (evita cobrança dupla).

## 2. Fluxo de dados e limpeza

Staging continua em `{account_id}/_staging/{uuid}.{ext}` — um objeto por foto; a política de storage segue validando o primeiro segmento, então o isolamento por conta é preservado sem mudanças.

Planta nova:
1. Usuário escolhe 1–3 fotos; upload em staging (sequencial, com estado por item).
2. Análise: uma chamada com todas as imagens + dica.
3. Confirmação: `createPlantFromIdentification` recebe `stagingPaths` na ordem exibida e `primaryIndex`; cria a planta, promove cada objeto para `{account}/{plantId}/{arquivo}` e insere as linhas em `plant_photos` com `is_primary = true` apenas no índice escolhido.
4. Staging só é removido depois da promoção bem-sucedida de cada arquivo.

Planta existente: as fotos servem **só** para análise; após `applyIdentificationToPlant`, todo o staging é removido. Sem anexar à galeria nesta fase (mantém o slice mínimo).

Limpeza por cenário:
- Remover uma foto na UI → remove aquele objeto do staging.
- Cancelar/voltar/desmontar sem persistir → o cleanup de unmount remove todos os objetos do array (mesmo padrão `stagingRef`/`persistedRef` de hoje, aplicado à lista).
- Falha parcial de upload → as que subiram continuam válidas; o item que falhou aparece com erro e opção "tentar de novo"; nada bloqueia a análise das demais (mínimo 1).
- Falha de promoção no servidor → por foto: se a cópia falhar, pula aquela foto; se o insert em `plant_photos` falhar, a cópia é revertida. A planta é criada mesmo assim e o retorno informa `photosAttached: n` de `n` enviadas, com aviso na UI.
- Garantia de "exatamente um primary": se a foto escolhida como principal falhar na promoção, a primeira foto anexada com sucesso assume `is_primary`; se nenhuma anexar, nenhuma linha é criada.

## 3. Provider e prompt

- Uma única chamada multimodal com todos os blocos de imagem, ordenados como o usuário os organizou.
- Dica do usuário entra num bloco de texto separado, rotulada explicitamente como contexto **não verificado**: o modelo deve usá-la para desempatar, nunca como fato; se a imagem contradiz a dica, prevalece a evidência visual e isso vira nota.
- Instruções adicionais: não afirmar cultivar sem sinal visual claro; quando só houver segurança em nível de gênero, retornar o gênero com `rank: "genus"` e uma nota do que falta na foto (folha, flor, fruto, escala) para estreitar.
- `confidence` continua nullable e nunca sintetizada; sem valor numérico inventado no cliente ou servidor.
- Caso "amplo demais": não é erro — resultado normal com nota + caminho de edição manual em destaque.
- `ai_usage_log`: exatamente uma linha por request, agora com `image_count` e `hint_provided`.

## 4. UI e i18n

- Picker: mantém os dois inputs (câmera com `capture`, galeria). Galeria passa a aceitar `multiple`, respeitando o teto de 3 (excedente é descartado com aviso).
- Tira de miniaturas: cada item com botão remover (alvo ≥44 px, `aria-label` com o índice) e ação "usar como principal" (estado visual + `aria-pressed`). Botão "adicionar foto" desaparece ao chegar em 3.
- Dica: `textarea` opcional, rótulo associado, contador até 280 caracteres, texto de ajuda dizendo que é opcional e melhora o resultado.
- Validação: JPEG/PNG/WEBP por arquivo, 8 MB cada; HEIC continua bloqueado com a mesma mensagem explícita (sem conversão nesta fase).
- Resultado: título "Identificação provável" + aviso permanente de incerteza; quando o candidato for só gênero, nota específica sugerindo folhas/flores/frutos.

Chaves novas (pt/en/es), com o pt como base:
- `identify.probableTitle`: "Identificação provável"
- `identify.uncertaintyNotice`: "A foto e a dica ajudam, mas esta identificação pode não ser definitiva."
- `identify.addHint`: "Adicionar uma dica opcional"
- `identify.hintHelp`: "Ex.: pimenta roxa cultivada em vaso. A dica é opcional e melhora o resultado."
- `identify.morePhotosHint`: "Adicione fotos de folhas, flores e frutos para melhorar a precisão."
- `identify.photoLimit`, `identify.setPrimary`, `identify.primaryBadge`, `identify.removePhoto`, `identify.uploadPartialError`, `identify.createdPartialPhotos`, `identify.genusOnlyNote`.

## 5. Riscos e bloqueios

- Latência maior com 3 imagens: mitigada por timeout de 75 s e streaming consumido no servidor.
- Payload maior em base64: fotos até 8 MB × 3 pesam; se o gateway devolver 400 por tamanho, o passo seguinte é reduzir no cliente antes do upload (fora do escopo agora, mas é o plano B).
- Sem migração: `plant_photos` já suporta múltiplas linhas e `is_primary`; nada novo é necessário.
- Aceitar `multiple` no input de galeria varia por navegador Android; o teto e o descarte de excedente cobrem o caso.
- LogoriOn segue inativo: só a assinatura do stub muda.

## 6. Verificação (runtime, após o BUILD)

1. Uma foto, sem dica — comportamento igual ao de hoje.
2. Três fotos com dica ("pimenta roxa em vaso") — resultado mais específico ou gênero com nota honesta.
3. Falha parcial de upload — as demais seguem, item com erro reexecutável.
4. Criar planta — todas as fotos promovidas, exatamente uma `is_primary`, staging vazio.
5. Planta existente — espécie aplicada e staging totalmente removido.
6. Resultado incerto — fallback manual preserva as fotos no fluxo de criação.
7. `ai_usage_log` — uma linha por request, com `image_count` e `hint_provided`, conta correta.
8. Android câmera/galeria e iPhone com HEIC bloqueado com mensagem clara.

## Recomendação

Seguro para BUILD. O escopo se resume a contrato do provider, uma server function ampliada, ciclo de vida de staging em lista e UI/i18n — sem mudança de schema, de RLS ou de política de storage.
