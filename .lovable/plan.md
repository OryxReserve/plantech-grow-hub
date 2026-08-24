# Plantech — Auditoria de estado (somente leitura)

Nenhum arquivo foi modificado. Typecheck e build executados apenas para verificação.

## 1. Status dos botões (Parte 1)

**1.1 BackButton — NÃO existe.** Não há `src/components/ui/back-button.tsx` nem arquivo equivalente. O Plan do BackButton + auditoria de tokens de botão nunca virou BUILD. Navegação "voltar" hoje é feita com `Button variant="ghost"` + `ArrowLeft` inline dentro das rotas.

**1.2 `src/components/ui/button.tsx` — já usa tokens semânticos, sem azul/zinc do shadcn:**

| Variante | Classes atuais |
|---|---|
| default | `bg-primary text-primary-foreground shadow hover:bg-primary/90` |
| destructive | `bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90` |
| outline | `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground` |
| secondary | `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80` |
| ghost | `hover:bg-accent hover:text-accent-foreground` |
| link | `text-primary underline-offset-4 hover:underline` |

Conclusão: nenhum ajuste de token é necessário no primitivo — o mapeamento sage/olive/clay vem das variáveis CSS em `src/styles.css`. Observação de acessibilidade: os tamanhos padrão (`h-9`, `sm: h-8`, `icon: h-9 w-9`) ficam abaixo do alvo de toque de 44px; as telas compensam manualmente com `h-12`/`size-11` caso a caso.

**1.3 Blast radius — 24 arquivos importam `Button`:**
App/rotas: `app-header.tsx`, `routes/auth.tsx`, `_authenticated/app.tsx`, `plants.index.tsx`, `plants.identify.tsx`, `plants.$plantId.index.tsx`, `plants.$plantId.edit.tsx`.
Plants: `identify/confirm-step`, `identify/error-step`, `identify/photo-step`, `identify/result-step`, `photo-gallery`, `photo-upload-row`, `plant-form-card`, `profile/care-profile-sheet`, `profile/initial-care-card`, `profile/plant-context-card`, `profile/plant-context-sheet`, `profile/plant-details-card`.
UI internos: `alert-dialog`, `calendar`, `carousel`, `pagination`, `sidebar`.

## 2. Inventário do design system

| Componente | Status | Arquivos |
|---|---|---|
| ExpandablePlantDetail | Construído e em uso (`plants.index.tsx`) | `ui/expandable-card.tsx`, `plants/expandable-plant-detail.tsx` |
| PlantFormCard | Construído e em uso | `ui/form-card.tsx`, `plants/plant-form-card.tsx`, `plants/photo-upload-row.tsx` |
| SegmentedTabs | Construído; em uso apenas em `profile/care-summary.tsx` | `ui/segmented-tabs.tsx` |
| StatusBadge / CompletionBadge | Construídos, **sem consumidor** (zero uso fora dos próprios arquivos) | `ui/status-badge.tsx`, `ui/completion-badge.tsx` |
| BackButton | Não construído | — |
| HealthBadge | Construído; confirmado uso de escalas fixas `emerald-*`, `amber-*`, `red-*` (dívida técnica conhecida, não corrigida aqui) | `plants/profile/health-badge.tsx` |

## 3. Superfícies de UI faltantes ou incompletas

- **Empty states**: existe apenas o de plantas (`plants.empty.title/body/cta`), além de vazios menores para fotos, timeline e contexto. **Não existem** empty states de produtos/inventário nem de tarefas de cuidado do dia — não há sequer telas para esses domínios.
- **Skeletons**: já cobertos em `plants.index`, perfil da planta, edição, `photo-gallery`, `care-timeline`, `plant-hero`, `initial-care-card` e no `analyzing-step` (skeleton só quando não há preview; caso normal usa a foto + spinner). Sem lacuna relevante.
- **Timeline de `plant_care_log`**: já renderizada por `plants/profile/care-timeline.tsx` (83 linhas) no perfil da planta.
- **Navegação primária**: **não existe**. Só há `AppHeader` (logo → `/app`, seletor de idioma, sair). Nenhuma bottom nav nem tab bar; a navegação entre seções é apenas por rota/links de tela. Produtos e Configurações não têm rota alguma (`src/routes/_authenticated/` tem só `app`, `plants.*`).
- **Checklist de completude do perfil da planta**: não construído. Só existe o `CompletionBadge` isolado, sem UI que o consuma.

## 4. Consistência e regressões

- **Tokens**: nenhuma violação nos componentes do design system. A busca por `zinc-*`, `gray-*`, hex, `emerald/amber/red` em ExpandableCard, FormCard, SegmentedTabs, StatusBadge, CompletionBadge, PlantFormCard, PhotoUploadRow e ExpandablePlantDetail retornou apenas um falso positivo (`z-10` casando com o padrão). Única exceção real do projeto continua sendo `health-badge.tsx`.
- **layoutId**: sem colisão. `segmented-tabs-${groupId}` e `expandable-card-${layoutId}` são namespaces disjuntos, ambos gerados em um único ponto por componente.
- **Biblioteca de animação**: `motion@^13.1.1` é a única dependência direta. `framer-motion@13.1.1` aparece no lockfile e nos chunks do build apenas como dependência interna do próprio `motion` — não foi instalada diretamente e não há duplicidade de versão.
- **Typecheck e build**: ambos limpos (`tsgo --noEmit` sem saída; `bun run build` concluído; log de build registra `build OK`).

## 5. Cross-check de fases

- **Fase 0 — implementada.** Tabelas em `public`: `accounts`, `account_members`, `profiles`, `platform_admins`, `plants`, `plant_photos`, `plant_care_log`, `plant_care_profile`, `products`, `ai_usage_log`, `species_care_guide`. Duas além do escopo original (`plant_care_profile` da Fase 2 e `species_care_guide` da Fase 2A) — esperado.
- **Fases 1.0/1.1 — implementadas.** Multi-foto até 3, hint opcional, staging e foto primária estão em `photo-step.tsx` / `plant-identification.ts`.
- **Fase 1.2 — implementada** (estava marcada como incerta). Em `plants.identify.tsx` a regra de aceitação já trata identificação ampla/gênero como sucesso, com comentário explícito de que nem `broadOnly`, nem rank, nem confiança ausente rebaixam para falha. A 1.2.1 também está lá, via estado `isNotPlant` com copy própria.
- **Fase 2 — implementada.** Abas água/luz/fertilizante, edição do perfil de cuidado com validação e toasts, contexto físico e detalhes da planta.
- **Fases 3–7 — nenhum trabalho inesperado.** `products` existe só como tabela, sem lib nem rota. Nenhum código de tarefas, diagnóstico ou armário de produtos.

**Discrepâncias relevantes:** (a) Fase 1.2 estava marcada como pendente mas já está pronta; (b) BackButton nunca foi construído; (c) StatusBadge/CompletionBadge existem sem consumidor.

## 6. Próxima ação recomendada

Fechar as duas lacunas que já estão bloqueando a UX antes de abrir nova fase, em um BUILD pequeno:

1. `BackButton` conforme o spec (label some no hover/active, ícone expande, alvo ≥44px, `prefers-reduced-motion`) e substituição dos botões de voltar inline nas rotas de planta.
2. Checklist de completude do perfil da planta usando o `CompletionBadge` já pronto, dando finalmente um consumidor ao componente.

Deixar como itens separados e posteriores: navegação primária persistente (só faz sentido quando Produtos/Configurações existirem) e a migração do `HealthBadge` para tokens.
