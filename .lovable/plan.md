# Plano — Badge/Chip (StatusBadge + CompletionBadge)

Criar uma família pequena e reutilizável de badges de status para o Plantech, incluindo um variant específico para checklist de completude. Sem schema, sem dados, sem animação, sem novas dependências.

## 1. Respostas às perguntas

1. **Nova componente ou extensão?** Recomendo **duas componentes**: `StatusBadge` como base genérica (mapeia um status para cor + ícone + rótulo traduzível) e `CompletionBadge` como wrapper fino que restringe o status a `"completed" | "pending"` e fornece rótulos de checklist. Isso mantém a base flexível para futuros estados (ex.: "ativo", "inativo", "erro") sem poluir a API do checklist com variantes genéricas.
2. **Arquivos**: criar `src/components/ui/status-badge.tsx` e `src/components/ui/completion-badge.tsx`; modificar `src/i18n/translations.ts` para adicionar as chaves de rótulo. Nenhuma outra alteração de rota ou componente existente.
3. **Onde vive o checklist de completude do perfil?** Ainda **não existe** no código. Os campos citados (tipo de planta, tamanho do vaso, distância da janela, luz direta) correspondem a colunas já existentes em `plants` e `plant_care_profile`, mas nenhum componente os lista como checklist. **Escopo deste plano: apenas o badge**. A UI do checklist é um plano futuro separado (polimento da Fase 1).
4. **Seguro para BUILD pequeno?** Sim. 2 arquivos novos, 1 arquivo de tradução editado, 0 dependências, 0 schema, 0 IA. Pode ser construído no mesmo turno do restante do trabalho Badge/StatusBadge.

## 2. Estado atual relevante

- `src/components/ui/badge.tsx` existe (primitive shadcn com `default`/`secondary`/`destructive`/`outline`). Será reutilizada como elemento base, não alterada.
- `src/components/plants/profile/health-badge.tsx` existe, mas usa cores hex/emerald/amber/red hardcoded. **Fora de escopo deste plano**; pode ser alinhado em plano futuro de consolidação de badges.
- Não existe `StatusBadge`, `CompletionBadge` nem checklist de completude.
- O plano atual em `.lovable/plan.md` era o `SegmentedTabs`, já implementado; este documento o substitui.

## 3. Arquivos

Criar:
- `src/components/ui/status-badge.tsx` — badge de status genérico, com mapa de status -> tokens de cor + ícone + chave de tradução.
- `src/components/ui/completion-badge.tsx` — wrapper de checklist sobre `StatusBadge`, status `"completed" | "pending"`.

Modificar:
- `src/i18n/translations.ts` — adicionar chaves `badge.status.*` e `badge.completion.*` em pt, en e es.

Não modificar:
- `src/components/ui/badge.tsx` (primitive intacto).
- Qualquer rota ou card existente (o checklist ainda não será construído).

## 4. API

```ts
// src/components/ui/status-badge.tsx
export type StatusBadgeStatus =
  | "completed"
  | "pending"
  | "active"
  | "inactive"
  | "error"
  | "warning";

export interface StatusBadgeProps {
  status: StatusBadgeStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps): JSX.Element;
```

```ts
// src/components/ui/completion-badge.tsx
export type CompletionStatus = "completed" | "pending";

export interface CompletionBadgeProps {
  status: CompletionStatus;
  className?: string;
}

export function CompletionBadge({ status, className }: CompletionBadgeProps): JSX.Element;
```

Uso futuro (não implementado neste plano):

```tsx
<CompletionBadge status={plant.species_name ? "completed" : "pending"} />
```

## 5. Comportamento e estilo

- Base: reutilizar `Badge` do shadcn (`rounded-full px-2.5 py-0.5 text-xs font-medium inline-flex items-center gap-1.5`).
- Cores 100% por tokens do design system; nenhuma classe hardcoded tipo `green-100`/`blue-100`.
- Mapa de tokens:
  - `completed`: `bg-primary text-primary-foreground` (o primary do Plantech já é verde; equivale ao "success" do reference).
  - `pending`: `bg-muted text-muted-foreground`.
  - Outros status genéricos (reservados para uso futuro):
    - `active`: `bg-primary text-primary-foreground`.
    - `inactive`: `bg-secondary text-secondary-foreground`.
    - `error`: `bg-destructive text-destructive-foreground`.
    - `warning`: `bg-accent text-accent-foreground`.
- Ícones (lucide-react):
  - `completed`: `CheckCircle2`.
  - `pending`: `Circle`.
  - Outros status genéricos recebem ícones apropriados (`AlertCircle`, `XCircle`, etc.).
- Sem animação de entrada, sem contador, sem gradiente, sem theme-switcher.
- Acessibilidade: o texto traduzido é o label visível; ícone tem `aria-hidden`. Sem necessidade de `aria-live` porque o badge é estático.
- Traduções:
  - pt: `"Concluído"` / `"Pendente"`
  - en: `"Completed"` / `"To Do"`
  - es: `"Completado"` / `"Pendiente"`

## 6. Riscos

Baixo. O único ponto de atenção é que `HealthBadge` já existe com cores hardcoded; este plano não o altera, mas a consolidação futura de badges deve considerar migrá-lo para a mesma base de tokens.
