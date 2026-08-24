# Levantamento de arquitetura de IA + QA (pré-migração)

Levantamento somente de leitura, feito sobre o código real. Nenhum arquivo foi alterado.

## Parte 1 — Respostas

### 1. LOVABLE_API_KEY
Usada em dois lugares, ambos server-only:
- `src/lib/ai/lovable-vision.server.ts` (linha 149) — provedor de visão alternativo para identificação de planta (Fase 1), modelo `google/gemini-3-pro`.
- `src/lib/ai/species-care.server.ts` (linha 70) — geração do guia de cuidados por espécie (Fase 2, "Initial Care"), modelo `google/gemini-3.7-flash`.

Ambas passam por `src/lib/ai/ai-gateway.server.ts`, que aponta para `https://ai.gateway.lovable.dev/v1` via provider OpenAI-compatible. É uma API HTTP externa, mas a chave é emitida e faturada pela Lovable — fora do ambiente Lovable ela só continua funcionando enquanto a chave for válida e a conta Lovable existir. Na prática, é a dependência mais forte de plataforma que sobra depois da migração.

### 2. KINDWISE_API_KEY
Usada só em `src/lib/ai/kindwise.server.ts` (linha 110), chamando `https://plant.id/api/v3/identification`. Kindwise é o **provedor padrão** de identificação botânica (Fase 1): `src/lib/ai/provider-registry.server.ts` retorna Kindwise a menos que `AI_VISION_PROVIDER` seja `lovable` ou `logorion`.

Ou seja: Kindwise **substituiu** o caminho Gemini para identificação de espécie, mas o caminho Lovable/Gemini **coexiste** como rollback por variável de ambiente (não por deploy). O adapter Kindwise é deliberadamente só identificação — nenhum parâmetro `health`/diagnóstico é enviado (comentado explicitamente no arquivo, porque cada modificador é cobrado à parte).

### 3. GOOGLE_API_KEY
Único uso: `src/lib/push/push.functions.ts` linha 13, devolvido ao browser como `apiKey` do Firebase Web (Fase 3.2). **Não há nenhuma chamada a Gemini/Vertex/Generative Language usando essa chave** — todo Gemini deste projeto passa pelo gateway Lovable com `LOVABLE_API_KEY`. Não é chave compartilhada entre dois propósitos.

Observação de postura: esse valor é servido a qualquer visitante autenticado por design (Firebase web keys são públicas), então ele precisa ter restrição de referrer/API no console Google — não é segredo de verdade.

### 4. LogoriOn
**Não implementado, deliberadamente.** `src/lib/ai/logorion.server.ts` existe como placeholder registrado no registry, e lança `not_configured` com a mensagem de que faltam base URL, credenciais e contrato de request/response. Foi uma decisão explícita de não adivinhar o contrato — o slot está pronto, mas nada foi construído. Hoje é uma lacuna documentada entre o briefing original e o build.

### 5. Server-side + ai_usage_log
Todas as chamadas de IA rodam em `.server.ts`, importados dinamicamente dentro de handlers de `createServerFn`. Registro:
- Identificação (Fase 1): `src/lib/plant-identification.functions.ts` grava em `ai_usage_log` no sucesso **e** no erro (feature `plant_identification`, com `credits_used` do Kindwise).
- Guia de cuidados (Fase 2): `src/lib/species-care.functions.ts` grava no sucesso e no erro, feature `species_care_guide`, **só em cache miss** (cache hit não gera custo, logo não gera linha).

`cost_usd` hoje é sempre `null` (nem Kindwise nem o gateway devolvem custo); o que existe é `credits_used`, `tokens_in/out` e `model`.

## Tabela de cobertura

| Funcionalidade | API/serviço hoje | Chave env | Arquivo | ai_usage_log | Só server-side |
| --- | --- | --- | --- | --- | --- |
| Fase 1 — identificação de espécie (padrão) | Kindwise plant.id v3 | `KINDWISE_API_KEY` | `src/lib/ai/kindwise.server.ts` | sim | sim |
| Fase 1 — identificação (rollback por env) | Lovable AI Gateway → `google/gemini-3-pro` | `LOVABLE_API_KEY` | `src/lib/ai/lovable-vision.server.ts` | sim | sim |
| Fase 1 — slot alternativo | LogoriOn (placeholder, lança erro) | nenhuma | `src/lib/ai/logorion.server.ts` | n/a | sim |
| Fase 2 — guia de cuidados por espécie | Lovable AI Gateway → `google/gemini-3.7-flash` | `LOVABLE_API_KEY` | `src/lib/ai/species-care.server.ts` | sim (cache miss) | sim |
| Fase 2 — diagnóstico de saúde por foto | **não existe** | — | — | — | — |
| Fase 4 — leitura de rótulo de produto | **não existe** | — | — | — | — |
| Fase 3.2 — push (não é IA) | Firebase Web / FCM | `GOOGLE_API_KEY` + `FCM_*` | `src/lib/push/*` | não (correto) | chave lida no servidor; devolvida ao browser por design |

## Parte 2 — Achados de QA

**Bloqueador:** nenhum.

**Médio**
1. `LOVABLE_API_KEY` é dependência de plataforma. Depois da migração, o guia de cuidados (Fase 2) e o rollback de identificação param se a chave for revogada. Não há fallback para chamada direta ao Gemini.
2. `GOOGLE_API_KEY` é exposta ao browser por `getFirebaseWebConfig`, que é uma server function **sem** `requireSupabaseAuth` — ou seja, endpoint público. Aceitável para uma Firebase web key, mas só se as restrições de referrer estiverem ativas no console Google. Precisa ser confirmado antes de considerar fechado.
3. Roteamento caro-vs-barato do briefing: parcialmente implementado. Existe separação de modelo (`gemini-3-pro` para visão, `gemini-3.7-flash` para texto), mas não os dois caminhos previstos (diagnóstico caro / rótulo barato), porque Fases 2-diagnóstico e 4 não foram construídas. Simplificação em relação ao plano, não defeito.
4. `cost_usd` sempre `null` no `ai_usage_log`. A monetização futura vai precisar de uma tabela de preço por modelo, ou os números não fecham.

**Cosmético**
5. `logorion.server.ts` é código morto seletável por env; se ninguém for implementar o contrato, vale remover para não sugerir uma capacidade que não existe.
6. `species-care.server.ts` não classifica categorias de erro como o caminho de visão faz — qualquer falha vira `unavailable` genérico na UI.

**Chamadas de IA no cliente:** nenhuma. O grep por `gateway.lovable.dev`, `plant.id/api`, `generativelanguage`, `api.openai`, `anthropic` fora de `.server.ts` não retornou nada. Requisito atendido.

**Tratamento de erro:** sólido no caminho de identificação — `AiVisionError` com 8 categorias, timeout com `AbortController` (75s no gateway, 30s no Kindwise), `error-step.tsx` traduz cada categoria e sempre oferece cadastro manual como saída. A tela não trava. O caminho do guia de cuidados degrada para `{ ok: false, reason: "unavailable" }` sem quebrar a página.

## Recomendação por chave, para o Supabase novo

| Chave | O que fazer na migração |
| --- | --- |
| `KINDWISE_API_KEY` | Recadastrar o mesmo valor no novo ambiente. Independente da Lovable, continua funcionando sem mudança de código. |
| `LOVABLE_API_KEY` | Recadastrar para manter o comportamento atual. Decidir em seguida se troca por chave própria do Google (Gemini direto) — seria trocar o provider em `ai-gateway.server.ts` por `@ai-sdk/google`, mudança pequena e localizada. |
| `GOOGLE_API_KEY` | Recadastrar. Confirmar restrições de domínio no console Firebase/Google antes de publicar no domínio novo. |
| `AI_VISION_PROVIDER` | Opcional; sem ela o padrão é Kindwise, que é o comportamento desejado. |
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` | Recadastrar. `FCM_PRIVATE_KEY` precisa manter as quebras de linha `\n` exatas ou a assinatura RS256 falha. |
| `SUPABASE_SERVICE_ROLE_KEY` / URL / publishable | Valores **novos**, do projeto próprio. Não reaproveitar os atuais. |
| `RESEND_API_KEY` / `REMINDER_FROM_EMAIL` | Ainda não existem; só na Fase 3.3. |

## Próximo passo sugerido

Nada a implementar agora. Quando a migração avançar, a única decisão de IA em aberto é se `LOVABLE_API_KEY` continua ou vira chave Google própria — e isso pode ser decidido depois do restore, sem bloquear.
