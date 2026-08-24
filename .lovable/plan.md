# Fase 4.1 — Produtos e Insumos (cadastro manual)

Seção "Produtos" para registrar o estoque de adubos, fertilizantes e insumos da conta. Sem IA, sem foto de rótulo, sem recomendação, sem pagamentos.

## 1. Schema atual de `products` (verificado)

Colunas hoje:

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| id | uuid | não | gen_random_uuid() |
| account_id | uuid | não | — |
| created_by | uuid | sim | — |
| name | text | não | — |
| category | text | sim | — |
| brand | text | sim | — |
| quantity | numeric | sim | — |
| unit | text | sim | — |
| notes | text | sim | — |
| created_at | timestamptz | não | now() |
| updated_at | timestamptz | não | now() |

RLS já ativa e correta, 4 políticas para `authenticated`, todas via `is_account_member(account_id)` (SELECT/UPDATE/DELETE em `qual`, INSERT/UPDATE em `with_check`). Trigger `trg_products_updated_at` já mantém `updated_at`. Isolamento por conta já garantido — nada muda aqui.

Já suportam o cadastro manual: nome, marca, categoria, quantidade, unidade, observações.

Faltam (migração aditiva, sem tocar em `account_id` nem em RLS):

- `is_archived boolean not null default false` — arquivamento em vez de exclusão física
- `npk text` — texto validado no app no formato `N-P-K` (ex.: `10-10-10`)
- `description text` — descrição/uso
- `expires_at date` — validade opcional
- Constraints: `quantity >= 0`; `npk` com CHECK de formato (`^\d{1,2}(\.\d)?-\d{1,2}(\.\d)?-\d{1,2}(\.\d)?$`) permitindo NULL
- Índice: `(account_id, is_archived, created_at desc)` para a listagem

Sem novos GRANTs (tabela já existente e já concedida).

## 2. Fluxo de interface

Navegação: o card "Produtos" hoje está em `/app` na seção "Em breve" com badge `soon`. Ele passa a ser um link ativo para `/products`, no mesmo grupo dos links Plantas/Tarefas/Notificações, com o ícone `Package` já usado.

Telas (todas usando o padrão existente `PlantScreen`-like, renomeado/reutilizado como chrome mobile-first, e `FormCard`/`PlantFormCard`):

- `/products` — lista. Header com título e botão "+" de ação. Cada item é uma linha compacta: nome + marca, chip de categoria, quantidade+unidade à direita, e badge discreto de validade quando vencida/próxima. Filtro segmentado (`SegmentedTabs`, já existe) com "Ativos" / "Arquivados".
- Vazio: bloco ilustrado com ícone, frase curta e CTA "Adicionar produto" — não é card stacking genérico, segue o padrão das telas de plantas.
- Carregando: skeletons de linha. Erro: mensagem inline com botão "Tentar novamente".
- `/products/new` e `/products/$productId/edit` — mesmo formulário, campos: nome (obrigatório), marca, categoria (select: adubo, fertilizante, substrato, defensivo, ferramenta, outro), NPK, descrição/uso, quantidade + unidade (select: g, kg, ml, L, un), validade, observações.
- Detalhe: nesta subetapa o item da lista abre direto a edição (mantém o app enxuto); arquivamento e exclusão ficam no rodapé do formulário.
- Arquivar/desarquivar: ação primária. Exclusão física existe, mas atrás de `AlertDialog` de confirmação com texto explícito.
- Toasts `sonner` para sucesso/erro, como no restante do app.

Todo o texto entra em `translations.ts` nos três idiomas (pt/en/es).

## 3. Regras de negócio

- Todo produto pertence a `account_id` (o `activeAccountId` do contexto); `created_by` é apenas auditoria.
- Leitura/escrita somente por membros ativos da conta — já garantido pelas políticas existentes.
- Validações no cliente: nome obrigatório (1–120), quantidade numérica ≥ 0 e opcional, NPK no formato `N-P-K` quando preenchido, validade sendo data válida (permite passado, mas exibe badge "vencido").
- Produtos arquivados são excluídos da listagem padrão; visíveis no filtro "Arquivados" e restauráveis.
- Nenhuma IA, nenhuma recomendação, nenhuma ligação com plantas nesta subetapa.

## 4. Blocos de implementação

**Bloco A — Schema/RLS (migração)**
Adiciona `is_archived`, `npk`, `description`, `expires_at`, CHECKs e índice. RLS e `account_id` intocados.

**Bloco B — Camada de dados**
`src/lib/products.ts`: chaves de query escopadas por conta, `productsListQuery(accountId, { archived })`, `productDetailQuery`, `createProduct`, `updateProduct`, `setProductArchived`, `deleteProduct` — sempre com `.eq("account_id", accountId)`, espelhando `src/lib/plants.ts`.

**Bloco C — Listagem**
`src/routes/_authenticated/products.index.tsx` + `src/components/products/product-list-item.tsx` + estados vazio/carregando/erro. Ativa o link em `src/routes/_authenticated/app.tsx`.

**Bloco D — Formulário**
`src/components/products/product-form.tsx` sobre `PlantFormCard`/`FormCard`, mais `products.new.tsx` e `products.$productId.edit.tsx`, incluindo arquivar/restaurar e diálogo de exclusão.

**Bloco E — i18n e QA**
Chaves pt/en/es; `head()` próprio em cada rota nova.

Arquivos criados: `src/lib/products.ts`, `src/components/products/product-form.tsx`, `src/components/products/product-list-item.tsx`, `src/routes/_authenticated/products.index.tsx`, `products.new.tsx`, `products.$productId.edit.tsx`.
Arquivos modificados: `src/routes/_authenticated/app.tsx`, `src/i18n/translations.ts`.

**Testes sugeridos**
- Leitura: lista vazia, lista com itens, filtro arquivados.
- Escrita: criar, editar, arquivar, restaurar, excluir com confirmação.
- Validação: nome vazio, quantidade negativa, NPK inválido, data inválida.
- Isolamento RLS: com uma segunda conta, confirmar que produtos da conta A não aparecem nem são editáveis pela conta B (via query direta com id conhecido).
- Arquivamento: produto arquivado some da lista padrão e volta ao restaurar.
