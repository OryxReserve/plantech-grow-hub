# Fase 1.2 — Aceitação de resultados prováveis na identificação

Objetivo: parar de mandar identificações úteis (ex.: oliveira / *Olea europaea*) para a tela "Sem identificação confiável". Sem mudança de schema, sem chamada extra de IA, sem API externa.

## 1. Arquivos a alterar

- `src/lib/ai/lovable-vision.server.ts` — prompt e mapeamento do resultado
- `src/routes/_authenticated/plants.identify.tsx` — regra de decisão do passo final
- `src/components/plants/identify/result-step.tsx` — hierarquia visual (provável x amplo)
- `src/i18n/translations.ts` — ajustes de copy (pt/en/es)

Nada muda em storage, staging, RLS, `ai_usage_log` ou criação de planta.

## 2. Origem da rigidez (confirmado no código)

1. **Prompt induz a recusa.** `buildPrompt` instrui literalmente: "Return an empty candidates array when you cannot identify the plant with reasonable certainty" e "Never claim a cultivar without clear visual evidence". A primeira frase transforma incerteza em silêncio: o modelo prefere devolver zero candidatos a devolver "provavelmente *Olea europaea*, faltam detalhes da folha".
2. **Fallback de parser vira fracasso.** Em `NoObjectGeneratedError` o adapter retorna `candidates: []`. Se o modelo escreveu uma hipótese, mas fora do schema, o texto é descartado.
3. **Decisão binária na UI.** Em `plants.identify.tsx`, `result.candidates.length === 0` → passo `uncertain`. Não existe nível intermediário; qualquer coisa que zere a lista cai na tela de erro.
4. **Filtro de saneamento.** O `.filter(c => c.commonName?.trim())` descarta candidato que traz só `scientificName` (caso comum quando o modelo é cauteloso com nome popular).

Não confirmado como causa: `confidence` nula, `broadOnly` e `rank` **não** derrubam candidato hoje — nenhum código filtra por eles. A causa real é prompt + lista vazia + filtro de nome comum.

## 3. Regra mínima de aceitação

Um candidato é **útil** quando tem `commonName` OU `scientificName` não vazio. Nada além disso.

- lista útil não vazia → tela de resultado (`result`), sempre
- `broadOnly = true` → resultado válido, com aviso de amplitude
- `rank = genus` ou `species` → nunca rebaixa para falha
- `uncertain` só quando não sobra nenhum candidato útil
- `isPlant = false` continua sendo o único "não é planta" e mantém a tela atual

Quando faltar `commonName`, usar o `scientificName` como rótulo principal (e vice-versa) em vez de descartar.

## 4. Ajustes de prompt/provider

Em `buildPrompt`:

- remover a instrução de devolver lista vazia por falta de certeza
- passar a exigir: sempre devolver a melhor hipótese botânica plausível, com a incerteza explícita no `note`
- lista vazia só é permitida quando não há evidência botânica alguma (foto não mostra planta ou é inutilizável)
- manter a postura anti-alucinação: sem cultivar inventada, sem `confidence` numérica fabricada (continua `null` quando não houver estimativa real), sem nome científico chutado
- pedir que o `note` diga, em uma frase, que evidência adicional aumentaria a certeza (folha em detalhe, flor, fruto, casca, planta inteira)
- reforçar preferência por responder em gênero/espécie com `broadOnly = true` em vez de não responder

No mapeamento: aceitar candidato com apenas um dos nomes; manter `rank` default `species` e `broadOnly` default por `rank === "genus"`.

## 5. Hierarquia de estados na UI

| Caso | Estado | Tela |
| --- | --- | --- |
| Espécie/cultivar provável | sucesso | `result`, aviso padrão de incerteza |
| Gênero ou espécie com `broadOnly` | sucesso | mesma tela `result`, com destaque "identificação ampla" e o que falta na foto |
| Nenhum candidato útil | falha | `uncertain` |

- edição manual continua disponível em todos os casos (botões atuais preservados)
- `broadOnly` deixa de ser tratado como beco sem saída — nenhum roteamento novo, só a regra do item 3
- copy de resultado passa a "identificações prováveis", nunca afirmação categórica

## 6. Logging e segurança

Sem campo novo, sem requisição extra, uma linha por request em `ai_usage_log` como hoje. Staging, RLS e ciclo de criação de planta intactos.

## 7. Recomendação

Seguro para um BUILD pequeno: quatro arquivos, mudanças de prompt, de uma condição de estado e de copy. Sem migração, sem novo endpoint.
