# Plano — dois novos padrões de UI no design system Plantech

Escopo: apenas os dois componentes genéricos (expansão de card e card de formulário). Sem schema, sem IA, sem mexer em identificação/staging nem nas regras de validação do formulário de cuidado.

## 1. ExpandablePlantDetail

Arquivos a criar:
- `src/components/ui/expandable-card.tsx` — primitivo genérico: `ExpandableCardProvider` não é necessário; exporta `ExpandableCard` (gatilho colapsado) e `ExpandableCardContent` (estado expandido em portal), com transição compartilhada por `layoutId`, overlay com blur, botão de fechar com rotação, Escape e clique fora.
- `src/components/plants/expandable-plant-detail.tsx` — wrapper de produto: recebe foto, título, subtítulo, slot de badge (ex.: status de saúde) e `children` livres.

Arquivos a modificar (integração mínima, uma tela de referência):
- `src/routes/_authenticated/plants.index.tsx` — cada item da lista vira gatilho expansível para o resumo da planta (navegação para a rota de perfil continua disponível dentro do conteúdo expandido).
- `src/i18n/translations.ts` — chaves `expandable.close` etc. nos três idiomas.

Comportamento:
- Mobile (<768px): expande para folha quase fullscreen, cantos superiores arredondados, conteúdo rolável com `overscroll-contain`.
- Desktop: card centralizado com largura máxima.
- Cores só por tokens (`bg-card`, `bg-background/80`, `text-muted-foreground`, `border-border`, `--radius`); nenhum `zinc-*`/`gray-*`.
- Overlay em `z-50` (mesmo nível de Dialog/Sheet) — Sonner renderiza acima disso por padrão, então não há conflito de empilhamento com os toasts.
- `useReducedMotion` respeitado: sem `layout` animation quando o usuário pede movimento reduzido.

## 2. PlantFormCard

Arquivos a criar:
- `src/components/ui/form-card.tsx` — casca genérica: `FormCard`, `FormCardHeader` (imagem/ícone opcional + título + subtítulo), `FormCardRow`, `FormCardFooter`, com entrada em fade escalonado controlada por prop `animate` (padrão `true`, desligada onde o form reabre com frequência).
- `src/components/plants/plant-form-card.tsx` — composição de produto: cabeçalho, bloco opcional de upload de foto, área de campos (`children`) e botão primário com estado de carregamento.
- `src/components/plants/photo-upload-row.tsx` — linha de upload que **apenas** consome as funções já existentes em `src/lib/plant-identification.ts` (`validateIdentifyFile`, `createStagedPhoto`, `uploadStagingPhotos`, `removeStagingPhotos`). Nenhum mecanismo novo de upload.

Arquivos a modificar (adoção visual, sem tocar em lógica):
- `src/components/plants/plant-form.tsx` — envolve o form atual no `PlantFormCard`; estado, `nullable()`, mensagem inline de apelido e foco no primeiro inválido permanecem idênticos.
- `src/components/plants/profile/care-profile-sheet.tsx` e `plant-context-sheet.tsx` — trocam só a estrutura visual pela do `FormCard` com `animate={false}` (reabrem com frequência); validação de intervalos (inteiro 1–3650), foco/scroll no primeiro campo inválido e toasts continuam exatamente como estão.
- `src/i18n/translations.ts` — chaves de upload/rótulos que ainda faltem.

Campos de texto livre (tipo de fertilizante, notas de luz e rega) seguem sem restrição.

## 3. Dependências

- `framer-motion` **não** está instalado. Instalar `motion` (pacote atual da Framer Motion v11+, import `motion/react`), única adição. Nada de ícones sociais, botões de auth ou assets das demos originais.
- shadcn `Button`, `Input`, `Label`, `Textarea` já existem — reutilizados, sem reinstalar.

## 4. Conflitos verificados

- **Toasts (Sonner)**: o `<Toaster />` do Sonner usa z-index próprio bem acima de 50; o overlay expansível fica em `z-50`. Sem sobreposição indevida.
- **Dialog/Sheet existentes**: o card expansível é independente do Radix Dialog para permitir `layoutId`; foco é gerenciado manualmente (foco inicial no botão de fechar, restauração ao fechar) e `aria-modal` aplicado. Nunca abrir os dois simultaneamente na mesma tela.
- **Upload/staging**: reutilização direta das funções existentes; nenhuma alteração em promoção de fotos, provider de IA ou `ai_usage_log`.
- **Validação de cuidado**: alteração puramente de casca; nenhuma regra de validação movida ou reescrita.

## 5. Interfaces propostas

```ts
type ExpandablePlantDetailProps = {
  id: string;                    // base do layoutId
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  badge?: React.ReactNode;       // ex.: <HealthBadge />
  trigger: React.ReactNode;      // conteúdo do card colapsado
  children: React.ReactNode;     // conteúdo expandido rolável
  footer?: React.ReactNode;
  open?: boolean;                // opcionalmente controlado
  onOpenChange?: (open: boolean) => void;
};

type PlantFormCardProps = {
  title: string;
  subtitle?: string;
  media?: React.ReactNode;       // imagem/ícone do topo
  animate?: boolean;             // padrão true; false em sheets recorrentes
  photoUpload?: {
    label: string;
    photos: StagedPhoto[];       // tipo de @/lib/plant-identification
    onChange: (photos: StagedPhoto[]) => void;
    max?: number;
  };
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
  children: React.ReactNode;     // campos
};
```

## 6. Segurança do BUILD

Sim, é um BUILD pequeno e contido: 5 arquivos novos, 5 modificados, 1 dependência (`motion`), zero mudança de banco, de isolamento por `account_id`, de IA ou de regras de validação.
