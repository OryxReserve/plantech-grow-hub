# Fase 1.3A — Auditoria de schema e telemetria antes da Kindwise

Sem Build, sem SQL escrito. Tudo abaixo foi verificado no banco real (colunas, índices, policies) e no código atual.

## 1. Achados do schema atual

### `ai_usage_log` (13 colunas, verificadas)

| Necessidade Kindwise | Coluna atual | Situação |
| --- | --- | --- |
| conta | `account_id` uuid NOT NULL | OK |
| usuário | `user_id` uuid | OK |
| tipo de tarefa | `feature` text NOT NULL (hoje `plant_identification`) | OK — serve para separar Onda 1 e Onda 2 |
| provider | `provider` text NOT NULL (default `logorion`) | OK — aceita `kindwise` |
| modelo/serviço | `model` text | OK — cabe `plant.id/v3` |
| status | `status` text NOT NULL (`success`/`error`) | OK |
| latência | `latency_ms` integer | OK |
| custo | `cost_usd` numeric | Existe, mas ver lacuna de créditos abaixo |
| tokens | `tokens_in` / `tokens_out` integer NOT NULL default 0 | Existem; Kindwise não usa tokens (ficam 0) |
| qtd. de imagens | `summarized_payload.image_count` (jsonb) | Já gravado hoje |
| hint fornecida | `summarized_payload.hint_provided` (jsonb, booleano; o texto nunca é salvo) | Já gravado hoje |
| referência à planta | — | **Ausente** como coluna; hoje só existe `plant_context: "new" \| "existing"` no jsonb |
| referência a scan | — | **Ausente** |
| timestamps | `created_at` NOT NULL default now() | OK |

Outros fatos verificados:
- Índice `idx_ai_usage_log_account_time (account_id, created_at DESC)` — já é o índice certo para medição por conta e por período.
- RLS ativa: única policy é `ai_usage_log_select` para `authenticated`, com `is_account_member(account_id) OR is_platform_admin(auth.uid())`. INSERT/UPDATE/DELETE negados ao cliente; a escrita ocorre só via service role em `src/lib/ai/usage-log.server.ts`.
- Trigger `validate_ai_usage_payload` limita `summarized_payload` a 4096 bytes (o código já corta em 3500).

### Histórico de identificações / "Meus Scans"

Não existe. Nenhuma tabela de scans, tentativas ou resultados de identificação. O que existe hoje:
- `ai_usage_log` — telemetria de uso, sem resultado nem foto vinculada.
- `plants.species_name` / `scientific_name` — só o resultado **aceito**, sobrescrito a cada nova identificação, sem histórico.
- `plant_photos` — fotos já vinculadas a `plant_id` + `account_id`.
- Fotos de identificação ficam em `plant-photos/{account_id}/_staging/...` e são **apagadas** após a criação da planta (promovidas ou removidas). Ou seja: hoje uma identificação que não vira planta não deixa nenhum rastro recuperável.

### Pontos de vínculo com plantas/fotos

Existem e são naturais: `plant_photos.plant_id`, `plant_photos.id` e `account_id` em ambas as tabelas, com FKs compostas `(plant_id, account_id)` que impedem cruzamento entre contas. Qualquer registro futuro de scan pode se ancorar em `account_id` + `plant_id` opcional + `plant_photos.id` opcional pelo mesmo padrão.

### RLS e monetização

- Isolamento por conta está correto e consistente; um scan novo seguiria exatamente o mesmo padrão (`is_account_member(account_id)`).
- Medição por conta/plano na Fase 6 é viável hoje: `account_id` + `feature` + `created_at` + índice já existente respondem "quantas identificações a conta X fez no mês". O que falta é a unidade de cobrança da Kindwise (créditos), não a estrutura de agregação.

## 2. Lacunas reais para Kindwise

Onda 1 (identificação botânica):
1. **Créditos**. Kindwise cobra por crédito, não por token nem por dólar. `cost_usd` é aproximação e `tokens_*` não se aplicam. Sem um campo de créditos, o consumo real não é auditável.
2. **Vínculo com a planta**. Hoje só existe `plant_context` textual no jsonb. Para responder "quais chamadas de IA esta planta gerou" não há caminho consultável.

Onda 2 (diagnóstico de saúde):
3. Mesmas duas lacunas, mais o fato de que diagnóstico **precisa de histórico**: comparar estado da planta ao longo do tempo exige guardar resultado e foto, o que `ai_usage_log` não faz e não deve fazer (o payload é propositalmente mínimo e limitado a 4096 bytes).
4. Não há vínculo com a foto analisada, e as fotos de staging são deletadas.

"Meus Scans": não há nada reutilizável. `ai_usage_log` é telemetria, não histórico de produto — usá-lo como fonte de "Meus Scans" significaria inflar `summarized_payload` com resultados, colidindo com o trigger de 4096 bytes e com a decisão de manter o log mínimo.

## 3. Mudança mínima recomendada

Mínimo **antes** da integração Onda 1 — apenas `ai_usage_log`:

- Tabela afetada: `public.ai_usage_log`
- Colunas faltantes: `credits_used` (numérico, nulo permitido, default 0) e `plant_id` (uuid, nulo permitido, FK para `plants`)
- Nova tabela: **não**
- Índice: **não** — `(account_id, created_at DESC)` já cobre a medição por conta; um índice por `plant_id` só se justifica quando existir uma tela que consulte por planta
- Policy: **não** — a policy de SELECT por conta já cobre as colunas novas; escrita continua só por service role

Adiável para **depois** do primeiro Build da Onda 1, junto com a Onda 2:

- Nova tabela de scans (`plant_scans` ou nome equivalente): `account_id`, `plant_id` opcional, `photo_id`/`storage_path`, tipo de scan (identificação / saúde), resultado estruturado, provider, `created_at`, com RLS por `is_account_member(account_id)`.
- Justificativa para ela ser tabela nova e não reuso: guarda resultado e imagem persistente com ciclo de vida próprio, enquanto `ai_usage_log` é append-only mínimo, sem escrita pelo cliente e com limite rígido de payload. Misturar os dois quebra o limite do trigger e a separação telemetria × dado de produto.
- Só faz sentido criá-la quando "Meus Scans" ou o diagnóstico entrarem no escopo — não agora.

Também adiável: retenção das fotos de staging (hoje deletadas). Vira requisito junto com a tabela de scans, não antes.

## 4. Decisão objetiva

**Executar SQL Editor mínimo antes da integração.**

Escopo do SQL: duas colunas em `ai_usage_log` (`credits_used`, `plant_id`). Sem tabela nova, sem índice novo, sem policy nova.

O que é estritamente SQL Editor: as duas colunas.
O que **não** é SQL Editor: passar a gravar `credits_used` e `plant_id`, mapear a resposta da Kindwise e trocar o provider — tudo isso é Build, no `AiVisionProvider` e em `usage-log.server.ts`.

Sem essas duas colunas dá para integrar mesmo assim, mas as primeiras chamadas Kindwise ficariam sem consumo de crédito auditável — retrabalho garantido na Fase 6.
