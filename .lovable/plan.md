# Fase 2.1 — Perfil Individual da Planta (UI)

Transformar a tela de detalhe atual (lista simples de campos) em um perfil de acompanhamento: cabeçalho com foto, abas de cuidado (Água, Luz, Fertilizante), edição dos cuidados e timeline de leitura.

## 1. Rotas e arquivos

Rota mantida: `/plants/$plantId` (`src/routes/_authenticated/plants.$plantId.index.tsx`). Sem rotas novas — a edição de cuidados acontece em um Sheet na própria tela.

Alterar:
- `src/routes/_authenticated/plants.$plantId.index.tsx` — nova composição (hero + abas + timeline), mantendo estados de loading/erro/404 e o fluxo de excluir/editar já existentes.
- `src/i18n/translations.ts` — novas chaves pt/en/es para abas, campos de cuidado, tipos do log, estados vazios e mensagens de sucesso/erro.

Criar:
- `src/lib/plant-care-profile.ts` — query + upsert do `plant_care_profile`.
- `src/lib/plant-care-log.ts` — query somente leitura da timeline.
- `src/components/plants/profile/plant-hero.tsx` — foto principal, apelido, espécie/nome científico, estado vazio de foto.
- `src/components/plants/profile/care-summary.tsx` — abas Água / Luz / Fertilizante com valores ou "ainda não configurado".
- `src/components/plants/profile/care-profile-sheet.tsx` — formulário de edição.
- `src/components/plants/profile/care-timeline.tsx` — lista de eventos + estado vazio.

## 2. Busca e junção de dados

Quatro queries React Query independentes, todas com chave prefixada por `accountId` e filtro explícito `.eq("account_id", activeAccountId)`, seguindo o padrão de `src/lib/plants.ts`. Nenhum `account_id` vem da URL — sempre do provider `useActiveAccount`; RLS continua sendo a barreira real.

- `plants` — `plantDetailQuery` (já existe).
- `plant_photos` — reutiliza o módulo atual; o hero usa a foto `is_primary`, com fallback para a mais recente e, na ausência, ilustração/ícone de estado vazio.
- `plant_care_profile` — `maybeSingle()` por `plant_id`, retornando `null` quando não existir.
- `plant_care_log` — `select` por `plant_id`, `order performed_at desc`, `limit 20`.

Sem joins no banco: a composição é feita no cliente, o que evita acoplar o shape do PostgREST e mantém cada bloco com seu próprio estado de loading/erro.

## 3. Create-or-update seguro

`upsertPlantCareProfile(accountId, plantId, input)` usa `upsert` com `onConflict: "plant_id"`, gravando sempre `account_id: activeAccountId` e `plant_id` a partir do registro carregado da planta. A FK composta `(plant_id, account_id) -> plants(id, account_id)` já impede combinação de conta/planta inválida, e a RLS bloqueia contas de terceiros. O cliente nunca aceita `account_id` externo.

Validação no cliente (espelho leve do schema, sem duplicá-lo):
- intervalos: inteiro entre 1 e 3650, ou vazio → `null`.
- `light_exposure`: `low | medium | bright_indirect | direct`, ou `null`, via Select tipado a partir do union já gerado nos tipos.
- textos: `trim`, vazio → `null`.

Erro do banco é exibido inline no Sheet (não só toast); sucesso mostra confirmação inline e invalida a query do perfil de cuidado.

## 4. Ausência do perfil de cuidado

`null` é estado normal, não erro. Cada bloco mostra "ainda não configurado" com a ação primária "Configurar cuidados"; havendo perfil, a ação vira "Editar cuidados". O Sheet abre em branco no caso de ausência e o primeiro salvamento cria o registro.

## 5. Fora do escopo da Fase 2.1

- Cálculo de próxima rega, status ou atraso de cuidado.
- Lembretes, notificações, jobs, agendamento.
- Registro/edição/exclusão de eventos em `plant_care_log` (leitura apenas).
- Conteúdo de IA: "Sobre a espécie", FAQ, recomendações.
- Qualquer alteração de schema, novas tabelas ou colunas.
- Refactor de rotas de identificação, listagem ou formulário de planta.

## 6. Riscos e dependências

- Tipos gerados já contêm `plant_care_profile` — confirmado; sem dependência de migração.
- `plant_care_log` não tem UI de escrita ainda, então a timeline provavelmente aparecerá vazia; o estado vazio precisa ser explicativo e não parecer bug.
- Fotos usam URLs assinadas de 1h; o hero reaproveita a query de fotos existente para não duplicar assinatura.
- Crescimento da tela: mitigado dividindo em componentes por bloco em vez de inflar o arquivo da rota.
- Sem `light_exposure` como enum no banco (é CHECK), então a lista de opções vive em uma constante única compartilhada entre Select e validação.

## 7. Plano de BUILD e critérios de aceite

Ordem: dados (`plant-care-profile.ts`, `plant-care-log.ts`) → i18n → componentes → rota.

Aceite:
- `/plants/$plantId` mostra hero com foto principal ou estado vazio, apelido e espécie/nome científico, com botão voltar.
- Abas Água, Luz e Fertilizante mostram valores salvos ou "ainda não configurado".
- "Configurar/Editar cuidados" abre o Sheet, salva e reflete na tela sem reload; erro aparece inline.
- Perfil inexistente é criado no primeiro salvamento; existente é atualizado.
- Timeline lista eventos existentes com rótulos traduzidos ou estado vazio claro.
- Estados de loading, 404/sem acesso e erro seguem o padrão atual.
- Toda a copy em pt/en/es; nomes técnicos em inglês.
- Typecheck e build limpos.
