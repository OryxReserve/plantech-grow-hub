# Fase 2A — PLAN — Cuidado inicial pós-identificação

Sem Build. Estado verificado no código: o fluxo de identificação termina em `navigate({ to: "/plants/$plantId" })` (`src/routes/_authenticated/plants.identify.tsx:262`), ou seja, o usuário sempre cai no perfil da planta logo após identificar/cadastrar.

## 1. Ponto de encaixe

**No detalhe da planta**, não na tela final da identificação.

Motivos:
- A tela de identificação já é multi-step e efêmera; um bloco de cuidados ali seria visto uma vez e perdido.
- O perfil já é o destino automático pós-identificação, então o usuário vê a orientação no mesmo instante — sem duplicar tela.
- O mesmo bloco serve para plantas cadastradas manualmente e para plantas antigas, sem código extra.

Posição na página: um card **"Cuidados iniciais"** logo abaixo do `PlantHero` e **acima** do `CareSummary`. O `CareSummary` continua sendo "o que você configurou"; o novo card é "o que se recomenda para esta espécie". Hierarquia visual deixa claro que um é sugestão e o outro é a configuração real do usuário.

## 2. Origem do conteúdo — recomendação

**IA 1x por espécie, com cache no banco** (`species_care_guide`), chave = nome científico normalizado + idioma.

Comparação:
- *Estático por espécie*: zero custo, mas exige curadoria manual e cobre uma fração das espécies que a Kindwise devolve. Inútil na cauda longa.
- *IA 1x por planta*: custo linear no número de plantas; dez usuários com a mesma Monstera pagam dez vezes o mesmo texto.
- *IA 1x por espécie com cache*: a primeira planta de uma espécie gera; todas as seguintes, em qualquer conta, leem do cache. Custo cai rápido, o texto fica estável e revisável, e o `ai_usage_log` continua registrando cada geração real.

O cache é **global** (não por conta): é conhecimento botânico público, não dado do tenant. A tabela não tem `account_id` — leitura liberada para `authenticated`, escrita só via service role dentro do server fn. `plants`, `plant_care_profile` e tudo mais continuam intocados no isolamento por conta.

Sem nome científico (identificação só com nome comum, ou cadastro manual sem espécie): o card não aparece e mostra um estado vazio curto convidando a preencher a espécie. Nada de gerar guia a partir de apelido.

## 3. Schema

Precisa de **uma tabela nova**, via SQL Editor:

`species_care_guide`
- `id uuid pk`
- `species_key text not null` — nome científico normalizado (minúsculas, sem acento, espaços colapsados)
- `language app_language not null`
- `scientific_name text not null` — como veio, para exibição
- `water text`, `light text`, `fertilizing text`, `notes text` — textos curtos
- `source text not null default 'ai'`, `model text`, `generated_at timestamptz`
- `created_at` / `updated_at`
- `unique (species_key, language)`
- GRANT `SELECT` para `anon`/`authenticated` conforme política; `ALL` para `service_role`; RLS on com policy de leitura para `authenticated` e nenhuma policy de escrita (só service role).

Nenhuma alteração em `plants`, `plant_care_profile`, `ai_usage_log` ou RLS existentes.

## 4. Arquivos afetados

Criar:
- `src/lib/species-care.ts` — tipos + `queryOptions` de leitura do cache.
- `src/lib/species-care.functions.ts` — `getSpeciesCareGuide` (`createServerFn` + `requireSupabaseAuth`): normaliza a chave, lê o cache, e só em miss chama o gerador.
- `src/lib/ai/species-care.server.ts` — geração via Lovable AI Gateway (texto, não visão), saída em JSON estrito com os quatro campos, cada um limitado a ~240 caracteres.
- `src/components/plants/profile/initial-care-card.tsx` — o card.

Alterar:
- `src/routes/_authenticated/plants.$plantId.index.tsx` — montar o card entre `PlantHero` e `CareSummary`.
- `src/lib/ai/usage-log.server.ts` — aceitar `feature: 'species_care_guide'` (hoje a feature é constante fixa) e os campos de payload novos.
- `src/i18n/translations.ts` — chaves em pt/en/es.

Não muda: fluxo de identificação, `kindwise.server.ts`, provider registry, `plant-care-profile`, Stripe.

## 5. Menor escopo viável

- Só leitura + geração sob demanda. Nada de job, nada de pré-aquecimento.
- Quatro campos de texto, nada estruturado (sem `interval_days`, sem enum de luz). Estruturar agora criaria dívida: a Fase 2 completa vai querer converter sugestão em configuração, e é melhor decidir o formato quando essa conversão existir.
- Sem edição, sem versionamento, sem feedback do usuário sobre o texto.
- Falha de geração = card não aparece, com uma linha de erro discreta e botão de tentar de novo. Nunca bloqueia o perfil.
- Telemetria: uma linha em `ai_usage_log` por geração real (miss de cache), com `feature = 'species_care_guide'`. Cache hit não gera linha — é exatamente o sinal de economia que a monetização vai querer ler depois.

## 6. UX/UI mobile-first

Card no mesmo estilo dos existentes (`rounded-2xl border bg-card`), com:
- Título "Cuidados iniciais" e uma linha de subtítulo deixando explícito que é orientação geral para a espécie, não rotina da sua planta.
- Quatro linhas com ícone: gota (água), sol (luz), folha (fertilização), alerta (sinais de atenção). Cada uma com rótulo curto e uma a duas frases.
- Estado de carregamento com skeleton das quatro linhas.
- Rodapé com o nome científico usado como base e uma nota curta de que condições locais mandam mais que a média.
- Sem tabs, sem accordion, sem CTA para agenda. O botão de configurar cuidado que já existe permanece onde está e continua sendo o único caminho para a configuração real.

## 7. Relação com Fase 2 completa e Fase 3

- **Fase 2A (esta)**: conhecimento genérico por espécie, só leitura, sem estado por planta.
- **Fase 2 completa**: transformar sugestão em configuração real — um "aplicar ao meu cuidado" que preenche `plant_care_profile`, e o registro de eventos em `plant_care_log`. Depende dos campos estruturados, que ficam para lá de propósito.
- **Fase 3**: agenda, lembretes, diagnóstico de saúde, produtos. Nada disso lê `species_care_guide` diretamente — lê o `plant_care_profile` que o usuário confirmou. A fronteira é essa: 2A informa, 2 configura, 3 automatiza.

## 8. Ponto que precisa de decisão antes do Build

O guia gerado é armazenado por idioma. Se a mesma espécie for aberta em pt e en, são duas gerações (dois créditos). A alternativa é gerar num idioma e traduzir, o que economiza mas adiciona um segundo passo de IA. Recomendação: **gerar por idioma**, simples e direto, já que o volume real de idiomas por espécie tende a ser 1.
