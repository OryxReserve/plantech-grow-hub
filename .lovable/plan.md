# Reconexão ao Supabase próprio (PlanTech App) — plano e QA

Antes do passo a passo, um bloqueio real que muda a forma do plano. Prefiro dizer agora do que você descobrir no meio do Build.

## O bloqueio: este projeto não pode ser repontado

Este projeto tem Lovable Cloud ativo. Uma vez ativado, o Cloud **não pode ser desconectado nem apontado para um Supabase externo** — não existe tela de "Connect your own Supabase project" para um projeto que já roda no Cloud. Restaurar uma versão anterior também não remove o Cloud.

Isso não é uma questão de preferência ou de UI escondida; é estrutural, e o código confirma:

- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts` e o `.env` são **arquivos auto-gerados pela integração do Cloud**. O `.env` é reescrito pela plataforma a cada rebind — um commit meu apontando para `umttqvgapxvcgtjkjeyn` é sobrescrito na próxima operação de backend.
- `SUPABASE_*` é um **prefixo reservado**: a ferramenta de secrets deste ambiente não consegue gravar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` nem `SUPABASE_SERVICE_ROLE_KEY`. Esses três valores são derivados automaticamente do projeto Cloud vinculado. Não há caminho por onde eu injete os seus valores.

Ou seja: os itens 1, 2 (parte Supabase) e 4 da sua Parte 1 não têm execução possível dentro **deste** projeto. Não vou planejar passos que vão falhar.

## Os dois caminhos que realmente funcionam

O código já está no GitHub (`OryxReserve/plantech-grow-hub`) e o Supabase novo já está restaurado e validado. O que falta é escolher onde o app roda.

### Caminho A — Projeto Lovable novo, criado a partir do repo, sem Cloud
Você cria um projeto Lovable novo importando o repositório e **não** ativa o Lovable Cloud nele. Como não há Cloud, o prefixo `SUPABASE_*` deixa de ser gerenciado pela plataforma e os valores do seu projeto entram como variáveis normais. Este projeto atual permanece intacto, com o Cloud antigo ligado, como rede de segurança — reversibilidade total, porque nada aqui é tocado.

O custo: os arquivos hoje auto-gerados (`client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`) passam a ser arquivos comuns do seu repo, mantidos por você. Na prática o conteúdo deles já é genérico — leem `SUPABASE_URL`/`VITE_SUPABASE_URL` etc. — então é adoção, não reescrita.

### Caminho B — Hospedar fora da Lovable
Deploy do mesmo repo em Cloudflare Workers ou Vercel, com as variáveis definidas no painel do host. O app é TanStack Start e já tem o alvo edge configurado. A Lovable deixa de ser runtime e vira só editor.

Nos dois caminhos, nenhuma linha de código precisa mudar para a troca de backend: o grep abaixo prova que tudo é lido de variável de ambiente.

## Onde o código lê cada variável (grep real)

| Variável | Lida em | Observação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` → fallback `SUPABASE_URL` | `client.ts:34` | Browser + SSR |
| `VITE_SUPABASE_PUBLISHABLE_KEY` → fallback `SUPABASE_PUBLISHABLE_KEY` | `client.ts:35` | Browser + SSR |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts:33-34` | Cliente admin |
| `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` | `auth-middleware.ts:36-37` | Server fns autenticadas |
| `GOOGLE_API_KEY` | `push.functions.ts:13` | Firebase Web Key |
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` | `push/fcm.server.ts` | Assinatura RS256 |
| `KINDWISE_API_KEY` | `ai/kindwise.server.ts:110` | Identificação Fase 1 |
| `LOVABLE_API_KEY` | `ai/lovable-vision.server.ts:149`, `ai/species-care.server.ts:70` | A descontinuar |
| `AI_VISION_PROVIDER` | `ai/provider-registry.server.ts:12` | Opcional |
| `LOVABLE_CRON_SECRET` | `integrations/supabase/cron-auth.ts` | Fase 3.3, ainda não usada |

`VITE_SUPABASE_PROJECT_ID` não é lido por nenhum código da aplicação — só existe no `.env` como metadado. Não é bloqueante.

Confirmação do seu item 3: **a troca de valores é suficiente**. Nenhuma mudança de código é necessária para trocar de backend.

Sobre `LOVABLE_CRON_SECRET`: gere um novo. Não tem impacto funcional (a Fase 3.3 não existe ainda) e é higiene não carregar segredo de ambiente antigo.

## Parte 2 — O que acontece sem `LOVABLE_API_KEY`

Resposta curta: **nada quebra de forma dura, e você não precisa fazer a troca de provider antes.**

Detalhe por fase, lido do código:

**Fase 1 — identificação.** Não é afetada. O provider padrão em `provider-registry.server.ts` é Kindwise, que usa só `KINDWISE_API_KEY`. O caminho Gemini/gateway só é acionado se você setar `AI_VISION_PROVIDER=lovable` explicitamente. Sem a chave e sem essa variável, o fluxo de identificação funciona igual.

**Fase 2 — guia de cuidados.** Degrada de forma controlada, não trava. `generateSpeciesCare()` lança `Missing LOVABLE_API_KEY` logo na primeira linha; esse throw cai no `try/catch` de `species-care.functions.ts` (linha 81), que registra a falha em `ai_usage_log` com `status='error'` e retorna `{ ok: false, reason: "unavailable" }`. A UI mostra o estado de guia indisponível e o resto da tela da planta continua funcionando normalmente. E há um detalhe favorável: **espécies já geradas continuam funcionando**, porque o cache `species_care_guide` é lido antes de qualquer chamada de IA — o dump trouxe essas linhas junto. Só espécies novas ficam sem guia até a troca.

Conclusão prática: a janela de indisponibilidade é parcial e silenciosamente tratada. Ordem recomendada é reconectar primeiro, validar a Parte 3, e trocar o provider depois.

## Parte 3 — Método de verificação de cada item

Tudo abaixo roda contra o ambiente novo (Caminho A ou B), com Playwright a partir deste sandbox quando envolve UI, e SQL direto quando envolve banco.

**1. Login dos 4 usuários sem eu saber as senhas.**
Não preciso das senhas reais. Duas vias: (a) `admin.auth.admin.generateLink({ type: 'magiclink', email })` com a service key, seguindo o link no Playwright — isso exercita o mesmo caminho de sessão que o login por senha e prova que o usuário existe e autentica no projeto novo; (b) para provar especificamente o fluxo **senha**, crio um 5º usuário descartável com senha conhecida, logo com ele pela tela `/auth`, e depois apago. Combinando os dois, fica provado que os 4 usuários autenticam e que o formulário de senha funciona, sem você revelar credencial nenhuma. Você disse que as senhas foram preservadas no `pg_restore` — nesse caso, se me passar a senha de um usuário de teste (`testes@ifound.click`), o teste (b) roda direto nele e fica ainda mais forte.

**2. Leitura de dados batendo com o pré-migração.**
Baseline: `SELECT id, nickname, species_name, scientific_name FROM plants ORDER BY id` no banco novo, comparado com as mesmas linhas do `public_schema_data.sql` exportado (10 plantas). Depois, logado na UI, abro `/plants` e confirmo que a contagem e os apelidos na tela batem com essa baseline — screenshot anexado.

**3. Escrita persistindo no banco certo.**
Edito o apelido de uma planta pela UI para um valor único e rastreável (ex.: `QA-<timestamp>`). Em seguida rodo `SELECT nickname, updated_at FROM plants WHERE nickname LIKE 'QA-%'` **no Supabase novo** — tem que aparecer — e a mesma query **no Cloud antigo**, que tem que retornar zero linhas. Essa dupla checagem é justamente a prova de que não sobrou escrita indo para o backend velho. Depois reverto o apelido.

**4. RLS com 2 usuários.**
Logo como usuário da conta A e capturo os `plants.id` visíveis; deslogo, logo como usuário da conta B e capturo os dele — os conjuntos têm que ser disjuntos. Complemento no banco: com `set_config('request.jwt.claims', ...)` para o `sub` do usuário A e `role authenticated`, `SELECT count(*) FROM plants WHERE account_id = '<conta de B>'` tem que dar 0. Isso testa a política, não só a UI.

**5. Push (Fase 3.2).**
Chromium headless não conclui a obtenção de token FCM, então valido em duas partes: (a) a server function `registerPushToken` é chamada com um token sintético autenticado, e confirmo com `SELECT * FROM push_subscriptions` no banco novo que a linha nasceu com o `account_id` e `user_id` certos, e que um segundo envio do mesmo token só atualiza `last_seen_at` (o `onConflict: fcm_token`); (b) abro `/settings/notifications` na UI e confirmo que a tela carrega, lê as preferências da tabela `accounts` do banco novo e salva timezone e hora. O envio real de push só é testável no domínio publicado.

**6. Identificação Fase 1 sem regressão.**
Subo uma foto de planta pelo fluxo `/plants/identify` logado, confirmo que voltam candidatos com nome científico, e verifico que nasceu uma linha em `ai_usage_log` com `provider='kindwise'`, `status='success'` e `credits_used=1` **no banco novo**. Testo também o caminho de erro com chave inválida, esperando a tela de erro traduzida com a opção de cadastro manual, sem travamento.

**7. Zero resíduo do projeto antigo.**
`rg -n "fbcvxqotiyqnlehxsebr|sb_publishable_LKXvXXGhbGcp8g4rbpZ0Vg_ZaKOrBBM"` em `src/`, `public/`, `supabase/`, `.env*`, `package.json` e nos arquivos de config do host — tem que retornar zero. Repito o mesmo grep no bundle de produção gerado (`dist/`), que é a prova que conta, porque pega qualquer valor embutido em build time pelo Vite. Complemento em runtime: capturo o log de rede do Playwright durante a sessão de QA e confirmo que nenhuma requisição sai para `fbcvxqotiyqnlehxsebr.supabase.co`.

## O que preciso de você vs. o que consigo sozinho

**Você fornece** (não tenho acesso ao projeto `umttqvgapxvcgtjkjeyn`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do projeto novo, e os valores reutilizados `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `GOOGLE_API_KEY`, `KINDWISE_API_KEY`. Também a decisão entre Caminho A e Caminho B.

**Eu gero**: `LOVABLE_CRON_SECRET` novo. E consigo derivar `VITE_*` a partir dos valores que você passar (são os mesmos valores, outro nome).

**Cuidado com a `FCM_PRIVATE_KEY`**: cole o valor com os `\n` literais preservados exatamente como estão hoje. Se o painel do host converter em quebras reais ou comer os escapes, a assinatura RS256 falha com erro de chave inválida — e o sintoma aparece só no primeiro envio de push, não no boot.

## Risco mais provável

O mais provável não é técnico, é de expectativa: **tentar reconectar este projeto e descobrir no meio que não dá**, perdendo tempo e possivelmente mexendo em secrets à toa. Mitigação: decidir Caminho A ou B antes de qualquer Build, e manter este projeto exatamente como está — com o Cloud ligado — até a Parte 3 fechar no ambiente novo.

O segundo risco mais provável é a `FCM_PRIVATE_KEY` corrompida na transcrição, pelo motivo acima. Mitigação: validar a assinatura logo no início do QA, antes de dar a migração por concluída — eu testo o `fcm.server.ts` contra o Google OAuth e confirmo que a troca por access token passa.

## Pendente para depois

- Troca de `LOVABLE_API_KEY` por `@ai-sdk/google` (etapa separada, já planejada).
- Push real e restrição de referrer da Firebase Web Key: só no domínio publicado.
- Remoção do Lovable Cloud deste projeto: fora de escopo, e vale lembrar que ela não é o que libera o Supabase próprio — o que libera é o app rodando no ambiente novo.
