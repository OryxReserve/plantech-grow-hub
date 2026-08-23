# Plantech — Fase 0: Trava de Arquitetura (PLAN)

## Seção 1: Decisões que aprovo como estão

- **1. Modelo de execução backend** — Correto. Nesta stack o runtime de servidor do TanStack Start (`createServerFn` + rotas em `src/routes/api/public/*`) é o caminho nativo. Supabase Edge Functions seriam uma segunda infraestrutura paralela sem ganho. Manter como "opcional, nunca padrão".
- **2. Bootstrap no signup** — Correto e essencial. Trigger `AFTER INSERT ON auth.users` (`SECURITY DEFINER`, `search_path` fixo) criando `profiles` + `accounts` pessoal + `account_members` com `owner`. Nenhum usuário autenticado sem contexto de conta.
- **3. Modelo de autorização** — Correto. `profiles` sem role, `account_members` como fonte única de verdade, três papéis (`owner`, `admin`, `member`). Ressalva técnica na Seção 2 (item A) sobre recursão de RLS.
- **5. Escopo de autenticação v1** — Correto. E-mail/senha só. Social login depois é aditivo, não quebra nada.
- **6. Escopo de produtos** — Correto. `products` por conta. Catálogo global é decisão de produto que ainda não temos dados para tomar.
- **7. Política de log de IA** — Correto. Complemento na Seção 2 (item C) sobre retenção e escrita server-side.
- **9. Padrão de storage** — Correto. Bucket privado, caminho `account_id/plant_id/arquivo`, política validando membership ativo pelo primeiro segmento do caminho.
- **10. Disciplina de entrega** — Correto e é a regra mais importante da lista. Schema sem caminho vertical real é exatamente como nascem tabelas órfãs.

## Seção 2: Decisões que eu ajustaria

### A. Item 3 — RLS não pode consultar `account_members` diretamente

Política em `account_members` que consulta `account_members` gera recursão infinita e derruba a tabela inteira. Ajuste obrigatório: toda checagem passa por funções `SECURITY DEFINER` com `search_path = public`:

- `is_account_member(_account_id uuid) → boolean` — membro com status `active`.
- `has_account_role(_account_id uuid, _role account_member_role) → boolean`.
- `is_platform_admin(_user_id uuid) → boolean`.

As políticas das tabelas de negócio chamam apenas essas funções. Isso também mantém as policies curtas e auditáveis.

Segundo ajuste: `status` de membership deve ser enum (`invited`, `active`, `suspended`) e `is_account_member` exige `active`. Sem isso, um convite pendente já dá acesso aos dados.

### B. Item 4 — Super admin não deve ser resolvido por e-mail em runtime

Concordo com o conceito de super admin de plataforma separado dos papéis de conta. Discordo do e-mail como mecanismo de autorização. E-mail em `auth.users` é mutável e comparar string de e-mail dentro de policy é frágil.

Alternativa mais segura:

- Tabela dedicada `platform_admins` (`user_id` PK → `auth.users`, `granted_at`, `granted_by`). Nada de coluna `is_admin` em `profiles` — isso é o vetor clássico de escalonamento de privilégio.
- Autorização sempre via `is_platform_admin(auth.uid())`, nunca via e-mail.
- O e-mail `br61982407140@gmail.com` entra **só como semente de bootstrap**: o trigger de signup verifica esse e-mail uma única vez e insere a linha em `platform_admins`. Depois disso o e-mail deixa de ter qualquer significado no sistema.
- `platform_admins` sem policy de INSERT/UPDATE/DELETE para `authenticated` — só `service_role` escreve. Ninguém se auto-promove.

### C. Item 7 — Duas correções em `ai_usage_log`

- **Escrita apenas server-side.** Se o cliente puder inserir em `ai_usage_log`, a telemetria de custo é falsificável. Sem policy de INSERT para `authenticated`; a escrita acontece na server function que chama o LogoriOn, com `service_role`. O cliente só lê (agregado da própria conta).
- **Retenção definida agora.** Sem TTL, essa tabela vira a maior do banco em meses. Definir na Fase 0: `created_at` indexado e uma política de expurgo (ex.: 90 dias) executada por job. Pode ser implementada depois, mas a decisão fica travada agora.
- Reforço da separação que você citou: `ai_usage_log` guarda métrica e custo. Debug profundo (prompt completo, resposta bruta) fica em log de servidor efêmero, nunca no banco.

### D. Item 8 — Concordo, com uma exceção que precisa entrar agora

Concordo em não construir infraestrutura de tradução por entidade na Fase 0. Duas coisas, porém, precisam existir desde já porque doem caro depois:

- `profiles.preferred_language` (`pt`, `en`, `es`) — barato agora, evita migração e permite e-mails/notificações no idioma certo.
- Todo texto de sistema (categorias, tipos de cuidado, status) deve ser **enum/chave em inglês no banco**, traduzido só na camada de UI. Nunca guardar rótulo já traduzido em coluna.

Conteúdo livre do usuário (apelido da planta, notas) fica no idioma que ele escreveu. Sem tradução, sem `_pt`/`_en`/`_es` em coluna.

### E. Item 10 — Adição ao caminho vertical

O caminho listado está certo, mas falta uma peça: **seletor / contexto de conta ativa no frontend**. Sem ele, o dia em que um usuário pertencer a duas contas o app quebra ou vaza dados entre tenants. Não precisa de UI elaborada na Fase 0 — precisa do estado de conta ativa existindo e sendo usado em todas as queries.

## Seção 3: Riscos ainda em aberto antes do SQL

1. **`GRANT` em toda tabela nova.** O Data API do Supabase não concede privilégios por padrão no schema `public`. RLS sem `GRANT` = erro de permissão em runtime. Toda migration precisa de `GRANT` explícito para `authenticated` e `service_role`.
2. **Convite de membro ainda não modelado.** `account_members.status = 'invited'` implica um fluxo de convite (por e-mail, por link?). Se não entregarmos o fluxo na Fase 0, o status existe sem uso — pequena órfã aceitável, mas precisa ser decisão consciente.
3. **LogoriOn sem contrato conhecido.** Não temos URL base, autenticação nem formato de resposta. `ai_usage_log` vai nascer com campos genéricos (`model`, `tokens_in`, `tokens_out`, `latency_ms`, `status`, `cost`) e pode precisar de ajuste quando o contrato real aparecer. Aceitável, mas é retrabalho previsto.
4. **Deleção de conta / usuário.** `ON DELETE CASCADE` a partir de `auth.users` e de `accounts` precisa ser decidido junto com o schema, não depois. Deletar um `owner` sem regra deixa conta órfã sem dono.
5. **Limpeza de storage.** Deletar uma planta não apaga o arquivo no bucket. Precisamos de uma regra (deleção no server function que remove a linha) ou o bucket acumula lixo pago.
6. **Confirmação de e-mail no signup.** Se a confirmação estiver ligada, todo teste manual trava esperando e-mail. Recomendo desligar durante o desenvolvimento e reavaliar antes de publicar.
7. **PWA e mobile-first ainda não configurados.** É um item de Fase 0 do produto que não aparece nas 10 decisões. Não bloqueia o SQL, mas precisa entrar no backlog imediato.

## Seção 4: Arquitetura travada para a Fase 0

**Execução:** TanStack Start server functions para lógica de aplicação; rotas `api/public/*` só para webhooks. Sem Edge Functions.

**Enums:** `account_member_role` (`owner`, `admin`, `member`), `account_member_status` (`invited`, `active`, `suspended`), `care_log_type` (`watering`, `fertilizing`, `pruning`, `repotting`, `treatment`, `note`), `app_language` (`pt`, `en`, `es`).

**Tabelas (9):**

| Tabela | Escopo | Papel |
| --- | --- | --- |
| `accounts` | tenant | unidade de isolamento |
| `profiles` | usuário (1:1 `auth.users`) | dados de perfil + `preferred_language`, sem role |
| `account_members` | tenant × usuário | fonte única de autorização de conta |
| `platform_admins` | plataforma | super admin, escrita só por `service_role` |
| `plants` | `account_id` | entidade central |
| `plant_photos` | `account_id` + `plant_id` | referência ao storage |
| `plant_care_log` | `account_id` + `plant_id` | histórico de cuidados |
| `products` | `account_id` | armário compartilhado da conta |
| `ai_usage_log` | `account_id` | telemetria e custo, escrita server-side |

**Regra invariável:** toda tabela de negócio tem `account_id NOT NULL`. Nenhuma tabela de negócio é dona de `user_id` como chave de isolamento.

**Autorização:** três funções `SECURITY DEFINER` (`is_account_member`, `has_account_role`, `is_platform_admin`). Policies só chamam funções. Sem acesso `anon` em nenhuma tabela. `GRANT` explícito em toda migration.

**Bootstrap:** trigger em `auth.users` → `profiles` + `accounts` pessoal + `account_members` (`owner`, `active`); se o e-mail for a semente de bootstrap, também insere em `platform_admins`.

**Storage:** bucket privado `plant-photos`, caminho `account_id/plant_id/arquivo`, policies validando membership ativo pelo primeiro segmento.

**i18n:** UI em pt/en/es; banco só em inglês, com enums e `profiles.preferred_language`. Sem tabela de tradução na Fase 0.

**Entrega vertical obrigatória depois do SQL:** auth → contexto de conta ativa → lista/detalhe de planta → upload de foto → registro de cuidado → CRUD de produtos.

## Seção 5: Estamos prontos para o SQL?

**Sim, com uma dependência de bloqueio e três confirmações rápidas.**

Bloqueio: **o Lovable Cloud precisa ser habilitado antes de qualquer migration.** Não existe banco provisionado ainda; esse é o primeiro passo do BUILD.

Confirmações necessárias antes de eu escrever o SQL:

1. Aceita substituir "admin por e-mail" pela tabela `platform_admins` + e-mail apenas como semente de bootstrap? (Seção 2.B)
2. `ai_usage_log` fica sem INSERT pelo cliente, escrita só pela server function? (Seção 2.C)
3. Fluxo de convite de membro entra na Fase 0 ou o status `invited` fica reservado para a Fase 1?

Respondidas essas três, o próximo passo é: habilitar Lovable Cloud → uma migration única com enums, 9 tabelas, `GRANT`s, RLS, funções `SECURITY DEFINER`, trigger de signup e bucket de storage → em seguida o caminho vertical no frontend.
