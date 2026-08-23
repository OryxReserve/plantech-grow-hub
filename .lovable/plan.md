# Fase 2B — Perfil contextual da planta

Complementa o guia geral da espécie (Fase 2A) com dados do ambiente real onde aquela planta específica vive. Nada de agenda, lembretes, IA ou recomendação nesta fase.

## 1. Diagnóstico do que já existe

- `plant_care_profile` já existe, é 1:1 com a planta, é escopada por `account_id` + `plant_id`, tem RLS por conta e trigger de `updated_at`. Hoje guarda apenas rega/luz/adubo em nível de intenção de cuidado (intervalos e notas).
- `plants` guarda identidade e histórico: apelido, espécie, nome científico, local (texto livre), data de aquisição, notas.
- `plant_care_log` existe com tipo `watering` e já é lido pela Timeline, mas ainda não tem caminho de escrita no app (a escrita é a Fase 2.3, fora daqui).
- UI do perfil já é composta por cartões independentes: Hero, Cuidados iniciais (2A), Resumo de cuidados, Timeline, Detalhes da planta, Galeria. Cada bloco tem seu próprio cartão + Sheet de edição, então adicionar um bloco novo é incremental e não toca nos outros.

Conclusão: a separação "guia geral da espécie" (`species_care_guide`, global) x "contexto individual" (por planta) já está estruturalmente clara. Falta apenas onde guardar o contexto físico do ambiente.

## 2. O schema atual basta?

Não. `plant_care_profile` não tem nenhuma coluna para solo, drenagem, vaso, janela, luz percebida, ambiente ou data da última rega. `plants.notes` é texto livre e não serve como dado estruturado para a Fase 3.

## 3. Menor mudança possível

Estender a tabela `plant_care_profile` que já existe, sem criar tabela nova e sem tocar em RLS, grants ou políticas (as políticas atuais já cobrem colunas novas automaticamente).

Colunas adicionadas (todas opcionais):

- `soil_type` — texto curto controlado (ex.: substrato comum, cactos, orquídeas, terra de jardim, outro)
- `drainage` — poor / medium / good
- `pot_size_cm` — número inteiro pequeno (diâmetro em cm)
- `window_distance_cm` — número inteiro
- `window_orientation` — norte / sul / leste / oeste / sem janela
- `perceived_light` — muito baixa / baixa / média / alta
- `environment` — interno / externo / varanda ou estufa
- `last_watered_at` — data informada manualmente pelo usuário
- `context_note` — observação livre curta (limite ~280 caracteres)

Todas com valores controlados por CHECK, todas anuláveis, sem default. `last_watered_at` é declarativo agora; na Fase 3 ele vira semente do cálculo, e o histórico real continuará vindo de `plant_care_log`.

## 4. Arquivos que mudam

- `src/lib/plant-care-profile.ts` — adicionar as listas de valores, incluir as novas colunas no select e no tipo de input do upsert (mesma função de upsert já existente)
- `src/components/plants/profile/plant-context-card.tsx` (novo) — cartão de leitura
- `src/components/plants/profile/plant-context-sheet.tsx` (novo) — formulário de edição
- `src/routes/_authenticated/plants.$plantId.index.tsx` — encaixar o cartão logo abaixo do bloco de cuidados
- `src/i18n/translations.ts` — chaves em pt/en/es

Nada em `species-care.*`, identificação, provider de IA, timeline ou galeria.

## 5. UX mínima

Cartão "Ambiente da planta" abaixo do botão de configurar cuidados e acima da Timeline.

```text
Ambiente da planta                [Editar]
Solo: substrato comum · Drenagem: boa
Vaso: 18 cm · Ambiente: interno
Janela: leste, a 80 cm · Luz percebida: média
Última rega informada: 21/08/2026
"Fica na cozinha, pega sol da manhã"
```

- Sem dados: estado vazio com uma linha explicativa e botão "Preencher ambiente".
- Edição em Sheet de tela cheia mobile, campos agrupados em Solo e vaso / Luz e posição / Rega e observação.
- Selects para os campos controlados, campos numéricos com teclado numérico, data com input nativo, textarea curto com contador.
- Salvamento reaproveita o padrão atual: validação leve, toast de sucesso/erro, foco no primeiro campo inválido.
- O cartão de Cuidados iniciais (espécie) mantém a legenda de "orientação geral"; o novo cartão é rotulado como dados desta planta específica, deixando a distinção explícita para o usuário.

## 6. Riscos de escopo e o que fica fora

Riscos:
- Tentação de calcular "próxima rega" a partir de `last_watered_at` — não nesta fase.
- Tentação de alimentar a IA com o contexto — não nesta fase.
- Duplicidade entre `plants.location` (texto livre) e os novos campos: mantemos `plants.location` como está e o novo bloco como dado estruturado; sem migração de dados.
- Crescimento de formulário: todos os campos são opcionais e o cartão só mostra o que estiver preenchido.

Fora desta fase: agenda, lembretes, notificações, tarefas recorrentes, inferência de frequência, engine de recomendação, nova chamada de IA, escrita em `plant_care_log`, produtos/insumos, diagnóstico por imagem e qualquer alteração em `species_care_guide` ou no fluxo de identificação.

## Ponte para a Fase 3

Ao final da 2B, a Fase 3 terá tudo em uma única linha por planta: intenção de cuidado (intervalos já existentes), contexto físico (novas colunas) e uma âncora temporal (`last_watered_at`), sem precisar de novo schema para começar o cronograma.

## Detalhes técnicos

- Uma migração aditiva com `ALTER TABLE public.plant_care_profile ADD COLUMN ... NULL` e CHECKs por valor; sem novas policies, sem novos grants, sem alterar `is_account_member`.
- O upsert continua usando `onConflict: "plant_id"` e recebendo `account_id` do contexto ativo, nunca da URL.
- A query key `plant-care-profile/{accountId}/{plantId}` já existente é reutilizada; um único fetch alimenta os dois cartões.
