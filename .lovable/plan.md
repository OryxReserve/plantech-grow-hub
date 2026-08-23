# Auditoria Plantech — estado atual vs. Master Plan

Observação de método: o documento "Master Plan v0.1" não está no repositório nem foi colado nesta conversa. A auditoria compara o código real com as fases acordadas no histórico do projeto (Fase 0 fundação, Fase 1 identificação por foto, Fase 2 perfil individual). Se o v0.1 tiver itens diferentes, me envie o texto e eu reconcilio.

## Fase atual

Fase 2.2 concluída. O projeto está no fim da Fase 2 (perfil individual da planta), com Fase 0 e Fase 1 entregues e em uso.

Verificado no código:
- Migrations aplicadas: 2 arquivos em `supabase/migrations/` (fundação + `plant_care_profile`).
- Rotas autenticadas: `plants.index`, `plants.new`, `plants.$plantId.index`, `plants.$plantId.edit`, `plants.identify`.
- Camadas de dados: `plants.ts`, `plant-photos.ts`, `plant-care-profile.ts`, `plant-care-log.ts`, `plant-identification.ts` + `.functions.ts`.
- Perfil montado por componentes: hero, care-summary, care-profile-sheet, care-timeline, plant-details-card, plant-details-sheet.
- i18n com 724 linhas cobrindo pt/en/es.

## Aderência ao master plan

Fase 0 — aderente:
- Enums, 9 tabelas, RLS com helpers `SECURITY DEFINER`, GRANTs, trigger de signup e bucket privado `plant-photos` existem no banco.
- Todo acesso a dados passa por `activeAccountId` (`src/context/active-account.tsx`), e as query keys são escopadas por conta em `plantKeys`, `plantCareLogKeys`.

Fase 1 — aderente:
- Identificação por foto com provider abstrato (`AiVisionProvider`), rota multi-etapas, staging de upload, múltiplas fotos + hint, tratamento de "não é planta".
- `ai_usage_log` é escrito somente server-side via service role (`src/lib/ai/usage-log.server.ts`), nunca pelo cliente.

Lacunas em relação à fundação prometida:
- `products`: tabela existe no banco, mas não há camada de dados nem tela. O shell (`app.tsx`) já mostra o card "Produtos" sem destino real.
- `plant_care_log`: existe leitura (timeline), não existe escrita. Nenhum caminho no app grava rega/adubação, então a timeline nasce sempre vazia.
- `platform_admins`: tabela e função `is_platform_admin` existem, sem nenhuma superfície de uso.
- `account_members` com status `invited`: schema-ready, sem fluxo de convite (decidido assim na Fase 0).
- PWA: não há `manifest.webmanifest` nem service worker em `public/`. O produto é mobile-first no layout, mas ainda não é instalável.

## Riscos estruturais

1. Timeline sem escrita é o risco de produto mais visível: o perfil promete histórico e nenhuma ação do app alimenta `plant_care_log`.
2. Card "Produtos" no shell aponta para um recurso inexistente — expectativa quebrada na navegação.
3. Sem PWA manifest, "app mobile-first, PWA" ainda não é verdade tecnicamente.
4. Duplicidade de edição da planta: `/plants/$plantId/edit` e o `PlantDetailsSheet` fazem a mesma coisa. Baixo risco hoje (ambos usam `updatePlant`/`PlantInput`), mas é divergência esperando acontecer.
5. Fotos e identificação não se cruzam: a foto usada na identificação não vira `plant_photos` primária automaticamente (a confirmar no build seguinte, não é bug de fundação).

Nada disso é falha de isolamento multi-tenant. O escopo por `account_id` está consistente em todas as camadas verificadas.

## Débitos técnicos críticos

Críticos (bloqueiam coerência do produto):
- Escrita de `plant_care_log` (registrar rega/adubação/poda a partir do perfil).

Importantes (não bloqueiam, mas acumulam):
- CRUD de `products` ou remoção temporária do card do shell.
- Manifest PWA + ícones.

Não críticos:
- Unificar `/edit` com o Sheet de detalhes.
- Painel de platform admin.

## Integração de APIs futuras sem refatoração grande

Sim, a estrutura suporta. Motivos concretos:
- A identificação já está atrás de uma interface (`AiVisionProvider`) com registry por ambiente (`provider-registry.server.ts`), então trocar/adicionar LogoriOn ou outro provedor é implementar um módulo, não refatorar o fluxo.
- Toda chamada de IA passa por `createServerFn` com middleware de auth, e o log de uso é centralizado em `logAiUsage`.
- Uma futura API de cuidado (espécie → recomendações) encaixa no mesmo padrão: novo `*.server.ts` provider + server function + gravação em `plant_care_profile`, que já existe 1:1 com `plants`.

Ressalva única: dados de cuidado vindos de API precisarão de colunas de origem/confiança em `plant_care_profile` (ex.: `source`, `confidence`, `generated_at`) para separar o que o usuário escreveu do que a IA sugeriu. É uma migration aditiva pequena, não refatoração.

## O que está bom para continuar

- Fundação multi-tenant e RLS.
- Contexto de conta e padrão de query keys.
- Camada de provider de IA e logging de uso.
- i18n pt/en/es consistente.
- Composição por componentes do perfil da planta.
- Padrão de feedback (toasts + validação inline) já estabelecido no `care-profile-sheet`.

## O que está comprometido ou frágil

- `plant_care_log` sem escrita.
- `products` como promessa vazia na navegação.
- Ausência de PWA real.
- Dois caminhos de edição da mesma entidade.

## Recomendação

**Continuar como está e implementar as APIs em paralelo** — com uma correção pequena antes: fechar a escrita de `plant_care_log`. A fundação não precisa ser ajustada nem refatorada; o que falta é superfície de produto, não estrutura.

Ordem sugerida:
1. Fase 2.3 — registrar cuidado (escrita em `plant_care_log` a partir do perfil, alimentando a timeline).
2. Fase 2.4 — CRUD de `products` (armário da conta).
3. Fase 3 — API de cuidado por espécie, com migration aditiva de origem/confiança em `plant_care_profile`.
4. PWA (manifest, ícones, instalabilidade) quando o app estiver pronto para uso em campo.

## O que pode esperar

- Fluxo de convite de membros.
- Painel de platform admin.
- Unificação de `/edit` com o Sheet.
- Notificações e lembretes.
- Diagnóstico por foto.

## O que não deve esperar

- Escrita de `plant_care_log` — sem ela o perfil mostra uma promessa vazia.
- Decisão sobre o card "Produtos": implementar ou esconder até existir.
- Definir o contrato de origem/confiança em `plant_care_profile` antes de a primeira API de cuidado gravar dados lá.
