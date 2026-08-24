# Restauração no Supabase próprio + troca de LOVABLE_API_KEY por Gemini direto

Plano de execução. Nada será alterado no projeto atual até aprovação, e a remoção do Lovable Cloud **não** faz parte deste plano.

Uma observação importante antes de tudo: este ambiente de build não tem credenciais do seu projeto `umttqvgapxvcgtjkjeyn`, então a execução dos passos de restauração é feita por você (ou por mim, se você fornecer uma connection string/service key temporária de trabalho). O que entrego aqui é o runbook exato, os scripts a criar e o método de verificação de cada etapa.

## Achados do export que mudam a ordem de execução

Inspecionei `public_schema_data.sql` (1696 linhas). A ordem real do dump é:

```text
L40    CREATE TYPE (4 enums)
L87    CREATE FUNCTION (9 funções)
L266   CREATE TABLE (12 tabelas)
L506   COPY ... FROM stdin (dados de todas as tabelas)
L659   ALTER TABLE ONLY (PK, UNIQUE e FKs — inclusive as para auth.users)
L909   CREATE TRIGGER (9 triggers, todos em public)
L1156  ENABLE ROW LEVEL SECURITY + 38 CREATE POLICY
L1600+ GRANT (até L1696)
```

Três consequências:

1. **A ordem interna do dump já é correta** — funções antes de triggers, dados antes das FKs. Nenhum reordenamento manual é necessário *dentro* do arquivo.
2. **Os usuários precisam existir antes da linha 659**, não antes da 506. As FKs para `auth.users` só são validadas no `ALTER TABLE ADD CONSTRAINT`, e são validadas contra as linhas já carregadas. Como não vale a pena partir o arquivo, a regra prática é: **usuários primeiro, dump inteiro depois**.
3. **Risco crítico encontrado:** o trigger `on_auth_user_created` (em `auth.users` → `handle_new_user()`) cria automaticamente `profiles` + `accounts` + `account_members` para cada usuário novo. O dump traz a *função*, e o trigger em `auth` você recria manualmente. Se o trigger existir quando você rodar `createUser()`, cada um dos 4 usuários gera uma conta duplicada que colide com os dados restaurados. **O trigger em `auth.users` é o último passo de todos**, depois do restore completo.

Achado menor: o dump contém `GRANT ... TO "sandbox_exec"` (role interno do Lovable, ex.: L1696). Esse role não existe no seu projeto e o `GRANT` falha. Essas linhas precisam ser removidas antes de aplicar.

Também há um prefixo `_staging/` no bucket (3 dos 12 objetos são fotos de staging da identificação, não anexadas a plantas) — eles não têm linha em `plant_photos` e podem ser reenviados ou descartados; recomendo reenviar para manter paridade byte a byte.

## Parte 1 — Runbook de restauração

### Passo 1 — Preparar o SQL (local, sem tocar em nada)
1.1. Extrair `plantech-export.tar.gz` num diretório de trabalho.
1.2. Gerar `public_schema_restore.sql` a partir de `public_schema_data.sql` removendo apenas as linhas `GRANT ... TO "sandbox_exec"`. Nenhuma outra edição.
1.3. Conferir que o arquivo ainda tem 4 `CREATE TYPE`, 9 `CREATE FUNCTION`, 12 `CREATE TABLE`, 9 `CREATE TRIGGER`, 38 `CREATE POLICY` — contagem por `grep -c`, comparada com o original.

### Passo 2 — Recriar os 4 usuários com UUID preservado
2.1. Script Node (`scripts/restore-users.ts`, executado localmente com a service key do projeto novo) que lê `auth_users.json` e, para cada usuário, chama:
```ts
await admin.auth.admin.createUser({
  id: u.id,                      // UUID original — obrigatório
  email: u.email,
  email_confirm: true,           // preserva email_confirmed_at
  user_metadata: u.user_metadata,
});
```
2.2. Senhas **não migram** (o hash não é exportável). Logo após criar, o mesmo script gera, para cada usuário, um link de recuperação:
```ts
await admin.auth.admin.generateLink({ type: 'recovery', email: u.email });
```
Os 4 links são impressos e entregues a você. Nenhum usuário fica em estado quebrado silencioso: ou ele recebe o link, ou é recriado com senha temporária definida por você via `password:` no `createUser`.
2.3. **Não** criar o trigger `on_auth_user_created` ainda.

### Passo 3 — Aplicar schema + dados
3.1. Rodar `public_schema_restore.sql` inteiro, numa transação, contra o projeto novo (via `psql` na connection string, ou via migration no painel).
3.2. Se qualquer FK falhar, a transação inteira reverte — o erro apontará exatamente qual usuário/registro está faltando.
3.3. Como "Automatically expose new tables" está desabilitado no seu projeto, expor explicitamente as 12 tabelas na Data API depois do restore (os `GRANT` do dump cobrem os privilégios; a exposição do schema na Data API é configuração de projeto, à parte).

### Passo 4 — Recriar o trigger de auth
Só agora, depois que os dados estão dentro:
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
A partir daqui, cadastros novos voltam a criar conta pessoal automaticamente.

### Passo 5 — Storage
5.1. Criar o bucket `plant-photos` como **privado** (mesma config do `storage_metadata.sql`: sem `public`, sem limite de tamanho declarado).
5.2. Recriar as políticas de `storage.objects` do projeto antigo (escopo pelo primeiro segmento do path = `account_id`), aplicadas por SQL.
5.3. Script de reupload que percorre `storage/plant-photos/**` e envia cada arquivo com o **path relativo idêntico** (`{account_id}/{plant_id}/{uuid}.jpg`, incluindo `_staging/`), com `contentType: image/jpeg` e `upsert: false`.
5.4. Nenhuma alteração em `plant_photos.storage_path` — os paths continuam resolvendo.

### Passo 6 — Secrets e variáveis
Ver tabela na Parte 3.

### Passo 7 — Troca do provider de IA (código)
Ver Parte 2.

### Passo 8 — QA completo
Ver Parte 4. Só depois disso se discute remover o Lovable Cloud do projeto original.

## Parte 2 — Troca de LOVABLE_API_KEY por Gemini direto

### O que muda
- Instalar `@ai-sdk/google` (hoje o projeto só tem `@ai-sdk/openai-compatible` e `ai@^7`).
- Substituir `src/lib/ai/ai-gateway.server.ts` por `src/lib/ai/google-ai.server.ts`, exportando um `createGoogleProvider()` que usa `createGoogleGenerativeAI({ apiKey: process.env['GOOGLE_GENERATIVE_AI_API_KEY'] })`.
- O helper de run-id (`X-Lovable-AIG-Run-ID`) deixa de existir: é um cabeçalho do gateway Lovable, sem equivalente no Google. `requestId` passa a ser `null` nos dois call sites, e `ai_usage_log.summarized_payload.request_id` fica nulo nessas linhas.

### O que NÃO muda
Este é o ponto tranquilizador: `lovable-vision.server.ts` e `species-care.server.ts` **não falam formato OpenAI-compatible**. Eles falam AI SDK (`streamText`, `Output.object`, `messages` com partes `text`/`file`, `await stream.output`, `await stream.usage`). O formato OpenAI-compatible está encapsulado dentro do provider. Trocar o provider por `@ai-sdk/google` mantém toda a lógica de prompt, schema Zod, parsing, `salvageCandidates`, timeout e categorias de erro **intactos**. A mudança real é de uma linha por arquivo: qual factory produz o `model`.

O que precisa de atenção pontual:
- A parte `{ type: 'file', mediaType, data: base64 }` é suportada pelo provider Google, mas vale confirmar no primeiro teste real com imagem (é exatamente o QA 5).
- Mapeamento de erro: `categorizeStatus`/`AiVisionError` hoje interpreta status do gateway. Os status do Google (`400` inválido, `403` chave, `429` quota, `5xx`) mapeiam para as mesmas categorias, mas o wrapper de erro do AI SDK precisa ser lido de `error.statusCode` em vez do fetch cru — ajuste localizado em `lovable-vision.server.ts`.

### Nomes de modelo
`google/gemini-3-pro` e `google/gemini-3.7-flash` são ids **do gateway**. A API direta do Google usa ids sem prefixo e com sufixo próprio. Não vou chutar o id: o primeiro passo do Build é listar os modelos disponíveis na sua chave (`GET https://generativelanguage.googleapis.com/v1beta/models`) e escolher o par correspondente (um pro multimodal para visão, um flash para texto). Os ids escolhidos ficam em constantes exportadas, como já estão hoje.

### Renomear ou não o `AI_VISION_PROVIDER=lovable`
Recomendo **renomear para `google`**. Manter `"lovable"` significando "Gemini direto" é uma armadilha de leitura para qualquer um que abrir o arquivo depois. A mudança é: `lovable-vision.server.ts` → `google-vision.server.ts`, provider `name: "google"`, e o registry passa a aceitar `google` (com `lovable` aceito como alias silencioso, para não quebrar nada que já esteja setado). O padrão continua sendo Kindwise.

Consequência em telemetria: `ai_usage_log.provider` passa a gravar `"google"` nas linhas novas. As linhas antigas com `"lovable"` continuam lá, historicamente corretas. **Nenhuma mudança de schema** — a coluna é `text` e a chamada a `logAiUsage()` é idêntica.

### Sobre o `logorion.server.ts`
Aproveitar a troca para removê-lo. É um placeholder que só lança erro e sugere uma capacidade inexistente.

## Parte 3 — Variáveis de ambiente no ambiente novo

| Variável | Origem | Ação |
| --- | --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | **novo** | Do projeto `umttqvgapxvcgtjkjeyn` |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | **novo** | Do projeto novo |
| `SUPABASE_SERVICE_ROLE_KEY` | **novo** | Do projeto novo. O valor antigo é descartado |
| `VITE_SUPABASE_PROJECT_ID` | **novo** | `umttqvgapxvcgtjkjeyn` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | **novo** | Chave da Generative Language API. Sem restrição de referrer (é chamada de servidor) |
| `KINDWISE_API_KEY` | reaproveitado | Mesmo valor |
| `GOOGLE_API_KEY` | reaproveitado | Firebase Web Key. Continua restrita por referrer — adicionar o domínio novo |
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` | reaproveitado | Mesmo valor |
| `FCM_PRIVATE_KEY` | reaproveitado | Preservar os `\n` exatos, ou a assinatura RS256 quebra |
| `LOVABLE_CRON_SECRET` | **novo** | Gerar segredo próprio para o cron da Fase 3.3 |
| `AI_VISION_PROVIDER` | opcional | Omitir; padrão é Kindwise |
| `LOVABLE_API_KEY` | **removido** | Não recadastrar |
| `AWS_ACCESS_KEY_ID` | ignorar | Não é referenciado por nenhum código do projeto |

## Parte 4 — Como cada item de QA será verificado

**1. UUIDs idênticos, zero FK órfã.**
Depois do Passo 2, rodar no projeto novo `SELECT id, email FROM auth.users ORDER BY id` e comparar com `jq -r '.[].id' auth_users.json | sort` — as duas listas têm que ser byte a byte iguais. A prova forte é o Passo 3: se algum UUID divergisse, o `ALTER TABLE ADD CONSTRAINT ... REFERENCES auth.users` da linha 659 falharia e a transação inteira reverteria. Restore que completa = zero FK órfã, por construção. Complemento: um `LEFT JOIN` de `accounts.created_by`, `plants.created_by`, `plant_photos.uploaded_by`, `push_subscriptions.user_id` contra `auth.users` retornando 0 linhas nulas.

**2. As 38 políticas ativas e isolando de verdade.**
Duas camadas. Estrutural: `SELECT count(*) FROM pg_policies WHERE schemaname='public'` = 38, e `SELECT relname FROM pg_class WHERE relrowsecurity = false` sem nenhuma das 12 tabelas. Comportamental — que é o que realmente prova: abrir uma sessão como o usuário da conta A (via `set_config('request.jwt.claims', ...)` com o `sub` do usuário real, ou logando no app), rodar `SELECT count(*) FROM plants` e conferir que retorna só as plantas da conta A; repetir para a conta B; e tentar `SELECT * FROM plants WHERE account_id = '<conta alheia>'` esperando 0 linhas. Existem 2 contas com plantas no dump, então o teste cruzado é possível com dados reais. Também testar que `ai_usage_log` nega INSERT como `authenticated`.

**3. Os 9 triggers funcionando, não só presentes.**
Cada um é exercitado com uma operação real, em transação revertida (`BEGIN; ...; ROLLBACK;`):
- `validate_account_timezone`: `UPDATE accounts SET timezone='Nao/Existe'` **tem que** levantar `invalid IANA timezone`; `UPDATE ... SET timezone='America/Sao_Paulo'` tem que passar.
- `validate_ai_usage_payload`: inserir (como service_role) uma linha com `summarized_payload` > 4096 bytes tem que ser rejeitada.
- os 7 `set_updated_at`/`handle_updated_at`: `UPDATE` numa linha e verificar que `updated_at` avançou em relação ao valor anterior.
- `on_auth_user_created` (Passo 4): criar um usuário descartável e conferir que nasceram 1 `profiles`, 1 `accounts` e 1 `account_members` com role `owner`; depois apagar o usuário.

**4. As 12 fotos abrindo na UI.**
Nível bucket: comparar `SELECT count(*), name FROM storage.objects WHERE bucket_id='plant-photos'` com os 12 caminhos do diretório local, e comparar tamanho em bytes de cada objeto com o arquivo de origem. Nível aplicação — o que conta: com o app rodando apontado para o projeto novo e logado como o dono da conta com fotos, abrir a lista de plantas e o detalhe de cada planta que tem foto, e confirmar visualmente que as 9 fotos anexadas renderizam (as 3 de `_staging/` não aparecem na UI por definição). Isso exercita a geração de URL assinada + as políticas de `storage.objects` de uma vez. Faço isso com Playwright e entrego os screenshots.

**5. Fases 1 e 2 continuam funcionando após a troca de provider.**
Fase 2 (guia de cuidados, é o caminho que muda de provider) é o teste decisivo: apagar do cache uma linha de `species_care_guide` para uma espécie existente, abrir o detalhe dessa planta no app e confirmar que o guia é regerado, com texto em português, e que nasce uma linha nova em `ai_usage_log` com `feature='species_care_guide'`, `provider='google'`, `status='success'` e `tokens_in/out` preenchidos.
Fase 1 tem dois caminhos: o padrão (Kindwise) **não é afetado** pela troca e é validado subindo uma foto pelo fluxo de identificação; o caminho Gemini é validado setando `AI_VISION_PROVIDER=google` temporariamente e repetindo a mesma identificação, conferindo que voltam candidatos com nome científico e que a linha em `ai_usage_log` registra `provider='google'`. Testar também o caminho de erro: com a chave inválida de propósito, a tela tem que mostrar a mensagem de `not_configured` e oferecer cadastro manual, sem travar.

**6. Nenhum secret antigo referenciado.**
`rg -n "LOVABLE_API_KEY|ai\.gateway\.lovable\.dev|fbcvxqotiyqnlehxsebr|sb_publishable_LKXvXXGhbGcp8g4rbpZ0Vg_ZaKOrBBM" src/ public/ supabase/ .env* package.json` tem que retornar zero. Complemento: `grep -r` no bundle de produção gerado (`dist/`) pelas mesmas strings, para provar que nada de servidor vazou para o cliente, e conferir que `getFirebaseWebConfig` continua sendo a única coisa que devolve chave ao browser.

## Riscos remanescentes

| Risco | Mitigação |
| --- | --- |
| Trigger `on_auth_user_created` criando contas duplicadas durante o Passo 2 | Trigger só é criado no Passo 4, depois do restore. Se ainda assim duplicar, os `ON CONFLICT DO NOTHING` de `profiles`/`account_members` absorvem, mas `accounts` não — daí a ordem ser obrigatória |
| Senhas não migram | Links de recovery gerados e entregues no próprio Passo 2 |
| Id de modelo Gemini errado | Listar modelos da chave antes de escrever o código; nada é chutado |
| `GRANT ... TO sandbox_exec` quebrando o restore | Removido no Passo 1.2, com contagem conferida |
| Rate limit / cota da Generative Language API diferente do gateway | Só aparece sob uso real; o tratamento de erro atual já cobre `429` com mensagem clara |

## O que só pode ser validado depois de publicar no domínio novo

- Push (Fase 3.2): o service worker exige HTTPS e origem estável, e a Firebase Web Key precisa do domínio novo na lista de referrers. Só testável após o deploy.
- OAuth/redirect de recovery: os links de recuperação apontam para a URL configurada no projeto novo — ajustar `Site URL` e `Redirect URLs` antes de enviar os links aos usuários.
- O cron da Fase 3.3 continua fora de escopo até a migração estar fechada.
