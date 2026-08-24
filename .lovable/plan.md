# Plano — SegmentedTabs (controle segmentado animado)

Substituir a barra de abas Água/Luz/Fertilizante por um controle segmentado polido, reutilizável depois em Hoje/Próximos (Fase 3). Sem mudança de conteúdo, dados ou validação.

## 1. Respostas às perguntas

1. **shadcn Tabs já está instalado** — `src/components/ui/tabs.tsx` existe com `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` sobre `@radix-ui/react-tabs`. Nenhum comando de CLI é necessário; nenhuma dependência nova.
2. **Único consumidor atual**: `src/components/plants/profile/care-summary.tsx`.
3. **Indicador deslizante**: reutiliza o mesmo padrão do `ExpandableCard` (`motion/react`, `layoutId`, `useReducedMotion`). Sem conflito: o `layoutId` será namespaced (`segmented-tabs-${groupId}`), diferente de `expandable-card-*`, e os dois nunca compartilham árvore de layout animada.
4. **Seguro para BUILD pequeno**: 1 arquivo novo, 1 arquivo modificado, 0 dependências, 0 schema, 0 IA.

## 2. Arquivos

Criar:
- `src/components/ui/segmented-tabs.tsx` — wrapper genérico em cima do shadcn Tabs.

Modificar:
- `src/components/plants/profile/care-summary.tsx` — troca `TabsList`/`TabsTrigger` pelo novo componente; `TabsContent` e todo o corpo das abas ficam idênticos.

Não modificar:
- `src/components/ui/tabs.tsx` (primitivo acessível intacto).
- `src/i18n/translations.ts` — as chaves `care.tab.water|light|fertilizer` já existem nos três idiomas e serão reutilizadas.

## 3. API do componente

```ts
type SegmentedTabItem = {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>; // opcional, prefixo
};

type SegmentedTabsProps = {
  items: SegmentedTabItem[];
  value?: string;                    // controlado
  defaultValue?: string;             // não controlado
  onValueChange?: (value: string) => void;
  groupId: string;                   // base do layoutId
  className?: string;
  children: React.ReactNode;         // TabsContent
  "aria-label"?: string;
};
```

Uso em `care-summary.tsx`:

```tsx
<SegmentedTabs groupId="care" defaultValue="water" items={[...]}>
  <TabsContent value="water">…igual ao atual…</TabsContent>
  …
</SegmentedTabs>
```

## 4. Comportamento e estilo

- Container: `bg-muted` arredondado (`rounded-full`), padding 1, borda `border-border` sutil.
- Indicador: `motion.span` absoluto atrás do gatilho ativo, `bg-primary` (rótulo ativo em `text-primary-foreground`), `layoutId={`segmented-tabs-${groupId}`}`, spring curto (~250ms, `stiffness 380 / damping 32`).
- Inativo: `text-muted-foreground`, hover para `text-foreground`. Nenhum `zinc-*`/`gray-*`, nenhum hex.
- Ícone opcional `size-4` antes do texto; nunca só ícone.
- Toque: altura mínima 44px no mobile (`min-h-11`), 40px em `md`.
- Responsivo: `flex` com `flex-1` quando cabem até 4 itens; acima disso ou em telas estreitas, `overflow-x-auto` com `scrollbar-none` e `snap-x` — sem quebra de layout em 375px.
- `useReducedMotion`: sem indicador animado; o estado ativo usa fundo estático (`data-[state=active]`), troca instantânea.
- Foco: mantém o anel de foco do Radix; navegação por setas e roles ARIA vêm do primitivo, não são reimplementados.

## 5. Riscos

Baixo. O único ponto de atenção é o indicador precisar ficar sob o texto (`z-0` no indicador, `z-10` no conteúdo do gatilho) para não cobrir o rótulo.
