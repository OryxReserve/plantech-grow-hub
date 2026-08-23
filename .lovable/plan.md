# Fase 2.1 — SQL de `plant_care_profile` (PLAN)

## 1. Schema real encontrado

### 1.1 `public.plants`
- Schema/tabela: `public.plants`
- PK: `plants_pkey` → `PRIMARY KEY (id)`, tipo `uuid`, default `gen_random_uuid()`
- `account_id uuid NOT NULL`
- UNIQUE composta existente: `plants_id_account_id_key → UNIQUE (id, account_id)` — é exatamente o alvo da FK composta usada pelas tabelas filhas
- FKs: `plants_account_id_fkey (account_id) → accounts(id) ON DELETE CASCADE`; `plants_created_by_fkey (created_by) → auth.users(id) ON DELETE SET NULL`
- CHECK: `plants_nickname_check` (1..120 chars no `nickname` após trim)
- Trigger: `trg_plants_updated_at BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()`

### 1.2 Vínculo usuário↔conta
- Tabela: `public.account_members` — colunas `user_id uuid`, `account_id uuid`, `role account_member_role`, `status account_member_status`
- As policies **não** consultam `account_members` diretamente; usam a função SECURITY DEFINER `public.is_account_member(_account_id uuid) returns boolean`, que valida `user_id = auth.uid() AND status = 'active'`
- Funções auxiliares disponíveis: `is_account_member`, `has_account_role`, `can_manage_account`, `is_platform_admin`

### 1.3 `updated_at`
- Função reutilizável já existe: `public.set_updated_at()` (`SET search_path TO 'public'`)
- Padrão do projeto: **reutilizar** essa função; cada tabela cria apenas o seu trigger (`trg_<tabela>_updated_at`). Não criar função nova.

### 1.4 Padrão real de RLS/grants
- Padrão de policy nas tabelas multi-tenant (`plants`, `plant_photos`, `plant_care_log`): 4 policies separadas (`_select`, `_insert`, `_update`, `_delete`), `TO authenticated`, com `USING (is_account_member(account_id))` e `WITH CHECK (is_account_member(account_id))`
- Grants reais hoje nessas tabelas: `anon`, `authenticated` e `service_role` com privilégios completos (o isolamento vem 100% da RLS). Para a nova tabela vou aplicar o padrão mais seguro e recomendado: **somente `authenticated` (SELECT/INSERT/UPDATE/DELETE) e `service_role` (ALL)** — sem `anon`, já que nenhuma policy permite acesso anônimo.

### 1.5 `public.plant_care_log`
- Nome exato confirmado: `public.plant_care_log`
- Possui `account_id uuid NOT NULL` e `plant_id uuid NOT NULL`, com FK composta `(plant_id, account_id) → plants(id, account_id) ON DELETE CASCADE`
- Demais colunas: `id`, `care_type`, `performed_at` (default `now()`), `performed_by`, `notes`, `created_at`
- Tipos de evento suportados hoje (enum `care_log_type`): `watering`, `fertilizing`, `pruning`, `repotting`, `treatment`, `note`
- Sem trigger de `updated_at` (a tabela não tem coluna `updated_at`) — nada a alterar aqui

## 2. Compatibilidade / riscos

- A FK composta `(plant_id, account_id) → plants(id, account_id)` é suportada pela UNIQUE existente; é o que impede troca de conta ou vínculo cruzado entre tenants.
- `UNIQUE (plant_id)` garante o 1:1 real. Como `plant_id` é único, `ON DELETE CASCADE` remove o perfil junto com a planta.
- `light_exposure` fica como `text` com CHECK de valores permitidos (`low`, `medium`, `bright_indirect`, `direct`) — evita criar enum Postgres e futura migração de enum. Nullable, para planta sem configuração.
- Intervalos com CHECK `> 0 AND <= 3650` para impedir valores absurdos/negativos; nullable enquanto o usuário não configurar.
- Nenhuma alteração em `plants`, `plant_care_log`, `ai_usage_log`; nada de IA; nada de UI.
- Risco baixo e reversível: tabela nova e isolada; nenhum código atual referencia esse nome.
- Após rodar o SQL, os tipos gerados do Supabase precisam ser regenerados antes do BUILD 2.1 usar a tabela.

## 3. SQL final pronto para colar no SQL Editor

```sql
-- Fase 2.1 — plant_care_profile (1:1 com plants, multi-tenant por account_id)

CREATE TABLE public.plant_care_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL UNIQUE,
  watering_interval_days integer,
  watering_amount_note text,
  light_exposure text,
  light_note text,
  fertilizing_interval_days integer,
  fertilizer_type text,
  fertilizing_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plant_care_profile_plant_id_account_id_fkey
    FOREIGN KEY (plant_id, account_id)
    REFERENCES public.plants(id, account_id) ON DELETE CASCADE,
  CONSTRAINT plant_care_profile_watering_interval_check
    CHECK (watering_interval_days IS NULL
           OR (watering_interval_days > 0 AND watering_interval_days <= 3650)),
  CONSTRAINT plant_care_profile_fertilizing_interval_check
    CHECK (fertilizing_interval_days IS NULL
           OR (fertilizing_interval_days > 0 AND fertilizing_interval_days <= 3650)),
  CONSTRAINT plant_care_profile_light_exposure_check
    CHECK (light_exposure IS NULL
           OR light_exposure IN ('low', 'medium', 'bright_indirect', 'direct'))
);

CREATE INDEX plant_care_profile_account_id_idx
  ON public.plant_care_profile (account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_care_profile TO authenticated;
GRANT ALL ON public.plant_care_profile TO service_role;

ALTER TABLE public.plant_care_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY plant_care_profile_select
  ON public.plant_care_profile FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY plant_care_profile_insert
  ON public.plant_care_profile FOR INSERT TO authenticated
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY plant_care_profile_update
  ON public.plant_care_profile FOR UPDATE TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY plant_care_profile_delete
  ON public.plant_care_profile FOR DELETE TO authenticated
  USING (public.is_account_member(account_id));

CREATE TRIGGER trg_plant_care_profile_updated_at
  BEFORE UPDATE ON public.plant_care_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Próximo passo após executar: regenerar os tipos do backend e só então iniciar o BUILD 2.1 (UI do perfil + abas), sem tocar em Fase 3.
