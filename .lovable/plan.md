# Plantech — Indicador de saúde da planta no perfil individual

## Respostas às 5 perguntas de pré-planejamento

### 1. Campos de `plants` relacionados a cuidados

A tabela `plants` não possui campos diretos de acompanhamento de cuidados. Os únicos campos temporais/contextuais são:

- `acquired_at` (date) — data de aquisição, apenas informativa.
- `is_archived` (boolean) — estado de arquivamento.
- `created_at` / `updated_at` — metadados de auditoria.

Todo o acompanhamento de cuidados está na tabela `plant_care_profile` (1:1 com `plants`) e no histórico `plant_care_log`.

### 2. Campos e eventos de `plant_care_log`

A tabela `plant_care_log` registra eventos pontuais de cuidado:

- `care_type` (enum `care_log_type`): `watering`, `fertilizing`, `pruning`, `repotting`, `treatment`, `note`.
- `performed_at` (timestamptz) — quando o cuidado foi realizado.
- `performed_by` (uuid) — usuário que registrou.
- `notes` (text) — observação livre.

Atualmente o `CareTimeline` já lê esses dados, mas não há cálculo de status ou atraso baseado nos eventos.

### 3. Onde calcular o health score

**Recomendação: client-side, derivado dos dados já carregados.**

Motivos:

- `plant_care_profile` já traz `watering_interval_days`, `fertilizing_interval_days` e `last_watered_at`.
- `plant_care_log` já traz o histórico de regas/fertilizações.
- Calcular no cliente evita uma nova coluna/cached score que precisaria ser invalidada a cada novo log ou alteração de perfil.
- A lógica é pequena: comparar `last_watered_at` + `watering_interval_days` com `hoje`, e similar para fertilização.

Se no futuro o score for usado em listagens, filtros ou notificações, aí sim vale persistir (ex.: coluna `health_status` em `plants` atualizada por trigger em `plant_care_log`). Para o perfil individual, client-side é suficiente.

### 4. Componente visual recomendado

Dado o design atual do perfil (cards arredondados com bordas sutis, ícones do Lucide, tipografia pequena e semântica), o indicador mais adequado é:

- **Badge discreto com cor semântica + ícone** no topo do `PlantHero`.
- Estados sugeridos:
  - `healthy` — verde suave (`text-emerald-foreground`/`bg-emerald`) + ícone `CheckCircle2`.
  - `needs_attention` — âmbar suave + ícone `AlertCircle`.
  - `overdue` — vermelho suave (`text-destructive-foreground`/`bg-destructive`) + ícone `AlertTriangle`.
  - `unknown` — cinza neutro + ícone `HelpCircle` (quando faltam dados).

Não recomendo progress bar (implica precisão numérica que não temos) nem emoji scale (quebra a consistência visual do Lucide). O badge pode ser expandido futuramente para um tooltip com a justificativa textual.

### 5. Utilitários de data existentes

- O projeto já depende de `date-fns@^4.1.0`, portanto `differenceInDays`, `addDays`, `isPast`, etc. estão disponíveis.
- `src/lib/utils.ts` contém apenas `cn(...)` para Tailwind; não há helpers de data customizados.
- O `CareTimeline` já usa `new Date(event.performed_at).toLocaleString(locale)` para formatação local.

## Direção de implementação proposta

1. Criar um helper puro `getPlantHealthStatus(profile, careLog)` em `src/lib/plant-health.ts` que retorne um dos estados acima e, opcionalmente, a justificativa (ex.: "última rega há X dias", "falta Y dias para a próxima rega").
2. Adicionar as chaves de tradução `health.*` em `src/i18n/translations.ts` para pt/en/es.
3. Inserir um `HealthBadge` dentro do `PlantHero`, logo abaixo do nome da espécie, sem alterar a estrutura dos outros cards.
4. Garantir que o cálculo seja defensivo: quando `last_watered_at` ou `watering_interval_days` forem nulos, retornar `unknown`.
5. Não criar novas tabelas ou colunas nesta fase.

## Escopo explícito fora desta fase

- Não calcular score numérico (0-100).
- Não persistir o status no banco.
- Não usar IA para inferir saúde.
- Não adicionar notificações/push.
