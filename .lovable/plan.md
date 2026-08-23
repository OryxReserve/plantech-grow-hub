# Plantech — Fase 0 (PLAN)

## Seção 1: Situação atual do backend/banco

Inspeção feita agora no projeto:

- Não existe Lovable Cloud (Supabase) habilitado. Não há `src/integrations/supabase/`, não há pasta `supabase/`, e não há variáveis de conexão de banco disponíveis na sessão.
- Consequência direta: **não existem** tabelas, views, enums, funções, triggers, políticas RLS, buckets de storage nem estruturas de auth. O inventário pedido nos itens 2, 3, 4, 5, 6, 7, 8 e 9 é vazio — não por omissão, mas porque o backend ainda não foi provisionado.
- Frontend: template TanStack Start v1 (React 19 + TypeScript + Vite 7 + Tailwind v4) intocado. Única rota é `src/routes/index.tsx`, ainda com o placeholder em branco. Nenhum componente de produto, nenhuma i18n, nenhum PWA configurado.

Respostas objetivas:

| Pergunta | Resposta |
| --- | --- |
| Fundação multi-tenant segura? | Não existe |
| Perfil de usuário / membership? | Não existe |
| Bootstrap de admin? | Não existe |
| RLS habilitado / políticas? | Não existe |
| Tabelas órfãs, vazias ou suspeitas? | Nenhuma (banco inexistente) |
| Estruturas irrelevantes a limpar? | Nenhuma |

Lado positivo: partimos de zero, sem dívida técnica nem tabelas legadas para migrar.

## Seção 2: Riscos e inconsistências

1. **Edge Functions vs. stack real.** O contexto do produto assume Supabase Edge Functions, mas este projeto roda TanStack Start, que já tem runtime de servidor próprio. Nesta stack a lógica de servidor deve usar `createServerFn` (chamadas internas) e rotas de servidor em `src/routes/api/public/*` (webhooks e chamadas externas). Criar Edge Functions aqui gera duplicidade e código desconectado. Recomendação: manter todo o backend de aplicação em server functions.
2. **Gateway de IA LogoriOn.** Não há credencial nem documentação do LogoriOn no projeto. Precisamos de URL base, formato de autenticação e contrato de request/response antes de modelar `ai_usage_log` e o fluxo de identificação.
3. **Risco clássico de multi-tenant tardio.** Se qualquer tabela de negócio nascer com `user_id` em vez de `account_id`, a correção depois é migração dolorosa. Regra fechada desde a primeira migration: toda tabela de negócio tem `account_id NOT NULL`.
4. **Risco de tabela órfã.** Sem CRUD e tela real, uma tabela criada na Fase 0 vira peso morto. Mitigação: a Fase 0 entrega schema + telas mínimas ligadas a ele, não schema isolado.
5. **Bootstrap de admin.** Definir admin por e-mail no frontend é vulnerabilidade. Deve ser resolvido no banco (trigger/função `SECURITY DEFINER` no cadastro), nunca no cliente.
6. **`ai_usage_log` como vetor de vazamento.** Sem regra explícita, payloads de IA acabam guardando base64 e URLs assinadas. Regra: só JSON estruturado mínimo (modelo, tokens, latência, tipo de tarefa, resultado resumido, custo).
7. **Idiomas.** PT/EN/ES desde o início exige decidir se textos de catálogo (ex.: `products`, nomes de plantas) são traduzidos em coluna JSONB ou tabela de tradução. Definir na Fase 0 evita retrabalho.

## Seção 3: O que falta para uma Fase 0 correta

- Habilitar Lovable Cloud (provisiona banco, auth e storage).
- Autenticação por e-mail/senha e a estrutura de rotas protegidas.
- Todo o schema base, RLS, grants e funções auxiliares.
- Bucket de storage para fotos de plantas com políticas por `account_id`.
- Camada de i18n no frontend (PT/EN/ES) e configuração PWA mobile-first.
- Um fluxo vertical completo funcionando (cadastro → conta criada → criar planta → foto → log de cuidado) para provar que o schema é realmente usado.

## Seção 4: Direção mínima recomendada de schema (sem SQL ainda)

Enums: `account_member_role` (`owner`, `admin`, `member`), `account_member_status` (`invited`, `active`, `suspended`), `care_log_type` (`watering`, `fertilizing`, `pruning`, `repotting`, `treatment`, `note`).

Tabelas:

- **accounts** — id, name, created_by, timestamps. Unidade de tenant.
- **profiles** — id = `auth.users.id` (1:1), display_name, avatar_url, preferred_language, timestamps. Dado de usuário, sem role.
- **account_members** — id, account_id, user_id, role, status, timestamps, único por (account_id, user_id). Fonte única de autorização.
- **plants** — id, account_id, nickname, species_name, scientific_name, location, acquired_at, notes, timestamps.
- **plant_photos** — id, account_id, plant_id, storage_path, is_primary, taken_at.
- **plant_care_log** — id, account_id, plant_id, type, performed_at, performed_by, notes.
- **products** — id, account_id, name, category, brand, quantity, unit, notes (armário compartilhado por conta).
- **ai_usage_log** — id, account_id, user_id, feature, model, tokens_in, tokens_out, latency_ms, status, summarized_payload (JSONB mínimo), created_at.

Funções auxiliares (`SECURITY DEFINER`, `search_path` fixo) para evitar recursão de RLS:
- `is_account_member(account_id)` — usuário atual é membro ativo.
- `has_account_role(account_id, role)` — checagem de papel.

Padrão de RLS: toda tabela de negócio libera SELECT/INSERT/UPDATE/DELETE apenas para `authenticated` quando `is_account_member(account_id)`; DELETE e escrita sensível restritos a `owner`/`admin`. `profiles` só do próprio usuário (+ leitura entre colegas de conta, se quisermos). Todo `CREATE TABLE` acompanhado dos `GRANT` correspondentes. Sem acesso `anon`.

Automação no cadastro (trigger em `auth.users`): cria `profiles`, cria uma `accounts` pessoal e insere `account_members` com role `owner`. Bootstrap de admin: o e-mail `br61982407140@gmail.com` recebe role elevado por lógica do banco na criação, nunca por verificação no frontend.

Storage: bucket privado `plant-photos`, caminho `account_id/plant_id/arquivo`, políticas checando membership pelo primeiro segmento do caminho.

Escopo de UI da Fase 0 (para nada nascer órfão): auth, seleção/contexto de conta, lista e detalhe de planta com fotos, registro de cuidado, CRUD de produtos. Identificação por IA e diagnóstico ficam para a Fase 1 — `ai_usage_log` já nasce pronto mas será preenchido lá.

## Seção 5: Perguntas em aberto

1. Confirma usar server functions do TanStack Start no lugar de Edge Functions do Supabase?
2. LogoriOn: qual a URL base, o método de autenticação e o contrato de resposta? Já existe chave para guardarmos como secret?
3. Cada usuário nasce com uma conta pessoal automática, ou a conta é criada explicitamente em um onboarding?
4. Convite para conta é por e-mail (fluxo de invite) ou só adicionamos membros já cadastrados por enquanto?
5. `products` é sempre por conta, ou existe também um catálogo global de produtos mantido por admin?
6. Traduções de conteúdo: JSONB por linha ou tabela de tradução separada?
7. O bootstrap de admin deve dar acesso a uma área administrativa global (super admin acima das contas) ou só role elevado dentro da conta dele?
8. Fase 0 já entrega login social (Google/Apple) ou apenas e-mail/senha?
