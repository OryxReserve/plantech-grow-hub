# Fase 1.2 — QA dirigido pós-BUILD

Revisão apenas de leitura dos quatro arquivos do escopo. Resultado: **implementação consistente em 5 dos 6 itens do checklist; há 1 gap real (item 2, `isPlant === false`) e 2 edge cases menores.**

## 1. Candidato útil — OK

Regra aplicada em dois pontos, coerentes entre si:
- Provider (`mapCandidates`): filtra por `commonName || scientificName` após `trim`, com `commonName` normalizado para `""` e `scientificName` para `null`.
- Rota (`runAnalysis`): re-filtra por `commonName?.trim() || scientificName?.trim()`.

Nenhum outro atributo (confiança, rank, `broadOnly`, `note`) participa do descarte.

## 2. Roteamento final — GAP REAL

- Lista com ≥1 candidato útil vai para `result`: OK.
- `broadOnly`, `rank` e `confidence: null` não derrubam para `uncertain`: OK (não são lidos na decisão).
- **`isPlant === false` não existe como fluxo próprio.** O provider retorna `isPlant`, a server function o repassa (`plant-identification.functions.ts`), mas `plants.identify.tsx` nunca lê `result.isPlant`. Consequências:
  - Foto sem planta hoje só cai em `uncertain` por efeito colateral de a lista vir vazia, com copy genérica ("Sem identificação confiável" / "tente outra foto"), não "isto não parece uma planta".
  - Se o modelo marcar `isPlant: false` e ainda assim devolver algum candidato (possível: o schema permite), a tela mostra `result` com hipótese botânica sobre uma foto não vegetal.

Correção mínima sugerida (sem schema novo, sem IA extra): na rota, tratar `result.isPlant === false` antes do cálculo de `useful` — descartar candidatos e ir para `uncertain` usando um par de chaves de copy específicas (`identify.notPlantTitle` / `identify.notPlantBody`) nas três línguas.

## 3. Fallback visual e confirmação — OK

- `result-step.tsx`: `primaryLabel = commonName || scientificName`; `secondaryLabel` só aparece quando o científico difere do rótulo primário, portanto candidato só-científico não duplica a linha.
- `goToConfirm`: mesmo fallback; `scientificName` preenchido com `""` quando ausente. Não há acesso não guardado — não quebra com apenas um dos nomes.
- Edge case menor: quando existe só `scientificName`, ele é copiado para `nickname` e `speciesName`. É aceitável e editável, mas o apelido nasce em latim. Não é bug.

## 4. Identificação ampla — OK

- `broad = broadOnly || rank === "genus"`, mesma tela `result`.
- Sinalização dupla: bloco de nota `identify.genusOnlyNote` + badge `identify.broadBadge` (presente em pt/en/es).
- `broadOnly` também é inferido no provider quando o modelo omite o campo e o rank é `genus`.
- Edição manual continua disponível pelo botão `identify.rejectAll` → `handleManualFallback`.

## 5. Fallback de parse (`NoObjectGeneratedError`) — OK

- `salvageCandidates` extrai do primeiro `{` ao último `}`, faz `JSON.parse` dentro de `try/catch` e valida com `ResultSchema.partial()`. Texto solto ou prosa não vira candidato: sem `{...}` válido → `[]`.
- Não há segunda chamada de IA; o caminho é puramente local.
- Sem JSON aproveitável → `candidates: []` → a rota cai em `uncertain`. Conservador, como pedido.
- Risco de "lixo textual" é baixo: qualquer candidato salvo ainda precisa passar por `mapCandidates` (nome não vazio) e o Zod rejeita tipos errados.
- Edge case menor: o retorno de salvamento fixa `isPlant: true` e `usage` zerada. Aceitável, mas significa que um salvamento nunca poderá acionar o fluxo "não é planta" do item 2, e o `ai_usage_log` registra 0 tokens nesse caminho (já era assim na Fase 1).

## 6. QA por cenários (validação lógica)

| Cenário | Resultado esperado | Hoje |
| --- | --- | --- |
| Espécie provável com nome popular + científico | `result`, rótulo popular, científico em itálico | OK |
| Espécie provável só com científico | `result`, científico como rótulo, sem linha duplicada | OK |
| Resultado amplo por gênero | `result` + badge "Identificação ampla" + nota | OK |
| Não planta (lista vazia) | mensagem clara de "não é planta" | Parcial — cai em `uncertain` com copy genérica |
| Não planta com candidato devolvido | não mostrar hipótese | **Falha** — vai para `result` |
| Texto malformado sem JSON útil | `uncertain` | OK |

## Conclusão

Único ajuste que vale um BUILD cirúrgico: consumir `result.isPlant` na rota e adicionar a copy de "não é planta" em pt/en/es. Os demais itens do checklist estão cobertos; os dois edge cases apontados são cosméticos e não exigem mudança.

Arquivos afetados por esse ajuste: `src/routes/_authenticated/plants.identify.tsx`, `src/i18n/translations.ts`. Sem schema novo, sem chamada extra de IA, sem refactor.
