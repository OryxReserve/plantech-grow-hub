# Fase 2.2 — Detalhes da planta no perfil individual

## 1. Schema/estado atual encontrado

Campos existentes hoje em `plants` (verificados no schema e em `src/lib/plants.ts`):

| Campo | Tipo | Usado hoje |
| --- | --- | --- |
| `nickname` | text (obrigatório) | criar, editar, hero, lista de campos |
| `species_name` | text | criar, editar, hero, lista |
| `scientific_name` | text | criar, editar, hero, lista |
| `location` | text livre | criar, editar, lista |
| `acquired_at` | date | criar, editar, lista |
| `notes` | text | criar, editar, lista |
| `is_archived` | boolean | apenas filtro na listagem (sem UI) |
| `created_at` / `updated_at` | timestamp | `created_at` exibido como "adicionado em" |

Onde esses campos aparecem hoje:
- `src/routes/_authenticated/plants.$plantId.index.tsx` — bloco final de leitura (`Field`) com apelido, espécie, nome científico, localização, data de aquisição, notas e data de criação.
- `src/routes/_authenticated/plants.$plantId.edit.tsx` — formulário de edição em rota separada.
- `src/routes/_authenticated/plants.new.tsx` — criação.
- `src/components/plants/profile/plant-hero.tsx` — apelido + espécie/científico.
- Fase 2.1 (`care-summary`, `care-profile-sheet`, `care-timeline`) trata só `plant_care_profile` e `plant_care_log`.

Campos pedidos que **não existem** no schema atual e não podem entrar no BUILD 2.2 sem SQL futuro: indoor/outdoor, tamanho do vaso, tipo de vaso, drenagem, tipo de solo, distância da janela, orientação da janela, data da última rega (só derivável de `plant_care_log`, que está fora de escopo).

## 2. Escopo recomendado para Fase 2.2 (sem SQL)

Bloco novo "Detalhes da planta" na própria rota `/plants/$plantId`, logo abaixo da timeline, substituindo o bloco `Field` solto atual:

- Card com título, resumo dos detalhes em pares rótulo/valor e botão "Editar detalhes".
- Edição em **Sheet** (mesmo padrão visual e de feedback do `CareProfileSheet`: toast de sucesso, toast de erro, sheet permanece aberto em falha).
- Campos editáveis agora: `nickname` (obrigatório), `species_name`, `scientific_name`, `location`, `acquired_at`, `notes`.
- Somente leitura no card: `created_at`.
- A rota `/plants/$plantId/edit` continua existindo e funcionando (sem remoção), para não quebrar links; o Sheet passa a ser o caminho principal a partir do perfil.

Explicitamente fora de escopo: qualquer campo estruturado de vaso/solo/janela/indoor-outdoor, última rega, arquivar planta, IA, FAQ, "sobre a espécie", cálculo de saúde, próxima rega, lembretes, alterações em `plant_care_log` e `plant_care_profile`.

## 3. Arquivos e abordagem

Criar:
- `src/components/plants/profile/plant-details-card.tsx` — leitura dos detalhes + botão de edição (reaproveita o componente `Field` movido para cá).
- `src/components/plants/profile/plant-details-sheet.tsx` — formulário em Sheet reusando `updatePlant`/`PlantInput` de `src/lib/plants.ts` e o padrão de toasts do `care-profile-sheet.tsx`.

Alterar:
- `src/routes/_authenticated/plants.$plantId.index.tsx` — trocar o bloco `Field` inline pelos dois componentes novos (incremento pequeno, sem refactor da rota).
- `src/i18n/translations.ts` — chaves novas em pt/en/es: título da seção, botão editar detalhes, toasts de sucesso/erro, mensagem de apelido obrigatório. Reusar as chaves `field.*` já existentes.

Sem novas queries: `plantDetailQuery` e `updatePlant` já cobrem tudo; após salvar, invalidar `plantKeys.all(accountId)`.

## 4. Dependências e riscos

- **Dá para fazer agora, sem SQL:** todo o escopo da seção 2.
- **Exige SQL futuro (Fase 2.3+, fora desta rodada):** indoor/outdoor, tamanho e tipo de vaso, drenagem, tipo de solo, distância e orientação da janela — todos exigiriam colunas ou enums novos em `plants`. Não entram no BUILD 2.2.
- **Derivável, mas fora de escopo:** "última rega" viria de `plant_care_log`, que esta fase não toca.
- Risco baixo de duplicidade entre o Sheet e a rota `/edit`: mitigado mantendo as duas sobre a mesma função `updatePlant` e o mesmo tipo `PlantInput`.
- Risco de a tela ficar longa: mitigado removendo o bloco `Field` antigo ao introduzir o card.

## 5. Critérios de aceite

1. `/plants/$plantId` mostra um card "Detalhes da planta" com apelido, espécie, nome científico, localização, data de aquisição, notas e data de criação; valores vazios usam o traço padrão.
2. O botão "Editar detalhes" abre um Sheet preenchido com os valores atuais.
3. Salvar com apelido válido: persiste, fecha o Sheet, mostra toast de sucesso e o card reflete os novos valores sem reload.
4. Salvar com apelido vazio: bloqueia, mostra erro inline + toast e mantém o Sheet aberto.
5. Erro de rede: toast de erro e o Sheet permanece aberto com os dados digitados.
6. Todas as operações continuam filtradas por `activeAccountId`; nenhuma chamada nova ignora o contexto de conta.
7. Todo texto novo existe em pt, en e es; nenhum schema, `plant_care_profile` ou `plant_care_log` é alterado.
