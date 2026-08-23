# Fase 2 — Perfil Individual da Planta (Plan)

## 1. Estado atual encontrado no código

Base já existente e reaproveitável:

- `src/routes/_authenticated/plants.$plantId.index.tsx` — tela de detalhe atual: lista simples de campos (`Field`), botão de re-identificar, galeria de fotos e exclusão. É a base direta do perfil.
- `src/components/plants/photo-gallery.tsx` — galeria com foto primária (`is_primary`) e signed URLs; serve para o card de topo.
- `src/components/plants/plant-form.tsx` + `plants.$plantId.edit.tsx` — edição dos campos básicos (apelido, espécie, científico, local, aquisição, notas).
- `src/components/plants/screen.tsx` — shell mobile-first com título/voltar/ação.
- `src/lib/plants.ts` — query keys e CRUD já 100% escopados por `account_id` (`plantsListQuery`, `plantDetailQuery`, `createPlant`, `updatePlant`, `deletePlant`).
- `src/lib/plant-photos.ts` — upload/signed URL/primary/delete.
- `src/lib/ai/*` — `AiVisionProvider`, gateway Lovable, `usage-log.server.ts` (insert server-side via admin), stub LogoriOn. Reutilizável para gerar texto de espécie/FAQ.
- `src/lib/plant-identification.functions.ts` — padrão pronto de server function com `requireSupabaseAuth` + validação de posse do `plant_id`.
- `src/i18n/translations.ts` — pt/en/es, chaves `plants.*`, `field.*`, `identify.*`.

Dados já existentes no banco: `plants` (nickname, species_name, scientific_name, location, acquired_at, notes, is_archived), `plant_photos`, `plant_care_log` (tabela existe, **sem nenhum uso no código hoje**), `products`, `ai_usage_log`.

## 2. Gaps de dados

Faltam para a UX mínima da Fase 2:

| Necessidade da Fase 2 | Existe? | Gap |
|---|---|---|
| Foto de capa + apelido + espécie no card | Sim | apenas UI |
| Indicador visual de status | Não | precisa de referência de rega (último evento + intervalo) |
| Aba Água (intervalo, volume, última rega) | Não | campos de cuidado por planta |
| Aba Luz (exposição, orientação) | Não | campos de cuidado por planta |
| Aba Fertilizante (tipo, intervalo, último) | Não | campos de cuidado por planta |
| "Sobre a espécie" (texto gerado 1x, cacheado) | Não | tabela de cache por espécie/planta |
| FAQ por planta gerada 1x por IA e cacheada | Não | tabela de cache + status de geração |
| Registro de rega/fertilização (para status) | Parcial | `plant_care_log` existe, sem camada de acesso nem UI |

## 3. Gaps de UI/UX

- Detalhe atual é uma lista plana, sem hierarquia de card/hero.
- Sem componente de abas (Água / Luz / Fertilizante) — `@/components/ui/tabs` do shadcn já está disponível.
- Sem edição granular por aba (hoje só um formulário único).
- Sem seção "Sobre a espécie" nem FAQ acordeão.
- Sem badge de status ("em dia" / "regar em breve" / "atrasada") derivado de dados.

## 4. O que é SQL Editor (antes do Build)

Apenas duas mudanças de estrutura, ambas multi-tenant por `account_id` com RLS e GRANTs no mesmo padrão das tabelas atuais:

1. `plant_care_profile` — 1:1 com `plants` (`plant_id` único, `account_id` obrigatório, FK composta `(plant_id, account_id)` como em `plant_photos`):
   - água: `watering_interval_days int`, `watering_amount_note text`
   - luz: `light_exposure text` (enum textual controlado na app: low/medium/bright_indirect/direct), `light_note text`
   - fertilizante: `fertilizing_interval_days int`, `fertilizer_type text`, `fertilizing_note text`
   - `created_at/updated_at` + trigger `set_updated_at`
2. `plant_ai_content` — cache de conteúdo gerado por IA, 1 linha por (planta, tipo):
   - `account_id`, `plant_id`, `kind text` ('species_overview' | 'faq'), `content jsonb`, `model text`, `generated_at`
   - `UNIQUE (plant_id, kind)` — garante geração única e impede repetir chamada
   - RLS: SELECT para membros da conta; INSERT/UPDATE **somente server-side** (service_role), igual ao padrão de `ai_usage_log`

`plant_care_log` já existe e **não precisa de alteração** — será só consumido.
`ai_usage_log` permanece inalterado (a geração de texto reaproveita o log existente).

## 5. O que é Build

Somente UI + camada de dados cliente/servidor:

- `src/lib/plant-care-profile.ts` — query/upsert escopado por `account_id`.
- `src/lib/plant-care-log.ts` — últimos eventos por tipo + registro rápido de rega/fertilização.
- `src/components/plants/profile/*` — hero card, badge de status, abas, editores por aba.
- `src/lib/plant-ai-content.functions.ts` — server function de geração 1x com leitura de cache antes de chamar IA.
- i18n pt/en/es das novas chaves.

## 6. Escopo mínimo recomendado para Fase 2.1

**Fase 2.1 (primeiro BUILD, sem IA):**
- SQL: criar `plant_care_profile`.
- Redesenhar `plants.$plantId.index.tsx` como perfil: hero card (foto primária + apelido + espécie + badge de status) e abas Água / Luz / Fertilizante.
- Ler/salvar `plant_care_profile` com edição granular por aba (sheet/dialog por aba, sem sair da tela).
- Badge de status derivado de `watering_interval_days` + último evento `watering` de `plant_care_log`, com ação "Registrar rega" (insert simples). Sem lembrete, sem agenda, sem push — apenas estado presente.

**Fase 2.2:** SQL `plant_ai_content` + seção "Sobre a espécie" gerada 1x e cacheada.

**Fase 2.3:** FAQ por planta (mesma tabela, `kind='faq'`), acordeão, geração 1x sob demanda.

## 7. Riscos e decisões pendentes

Riscos:
- **Fronteira com a Fase 3:** o badge de status é o ponto de contágio. Regra fixa: Fase 2 só calcula estado no momento da visualização; nada de agendamento, notificação ou job.
- **Acoplamento IA/perfil:** manter a geração isolada em server function com cache-first; falha de IA não pode quebrar o perfil (seção degrada para vazio).
- **Custo de IA:** `UNIQUE (plant_id, kind)` + leitura de cache antes da chamada evita regeneração; sem botão de "regenerar" na Fase 2.
- **Plantas sem espécie identificada:** "Sobre a espécie" e FAQ precisam de fallback quando `species_name` e `scientific_name` estão vazios.

Decisões pendentes (não bloqueiam a 2.1):
1. Cache de espécie por planta (mais simples, mais chamadas) ou por espécie compartilhada na conta (menos chamadas, mais complexidade). Recomendação: por planta na 2.2.
2. Registro rápido de rega/fertilização entra já na 2.1 (recomendado, é o que dá sentido ao badge) ou fica para depois.
3. Enum de luz como `text` validado na app (recomendado, evita migração de enum futura) ou enum Postgres.
