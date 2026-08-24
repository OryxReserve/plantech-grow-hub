# Checklist de setup — projeto Lovable novo (Caminho A)

Guia para você levar junto ao criar o projeto novo a partir de `OryxReserve/plantech-grow-hub`, conectado ao Supabase `umttqvgapxvcgtjkjeyn`. Este projeto atual permanece intacto, com o Cloud ligado, como rede de segurança.

## Antes de começar — o que ter em mãos

- JSON da service account do Firebase (você já tem): `project_id`, `client_email`, `private_key`.
- Do projeto Supabase novo: Project URL, chave publishable/anon, service role key.
- `GOOGLE_API_KEY` (Firebase Web Key) e `KINDWISE_API_KEY`, recuperáveis nos respectivos painéis.

## Passo 1 — Criar o projeto sem Lovable Cloud

1.1. Novo projeto Lovable importando o repositório `OryxReserve/plantech-grow-hub`.
1.2. **Não ativar o Lovable Cloud.** Este é o ponto sem volta do caminho: se o Cloud for ativado, o projeto novo fica preso ao mesmo problema deste aqui, e o prefixo `SUPABASE_*` volta a ser gerenciado pela plataforma.
1.3. Confirmar que o build inicial passa antes de configurar qualquer variável — ele vai reclamar de Supabase ausente em runtime, o que é esperado nesta etapa.

## Passo 2 — Variáveis de ambiente

Cadastrar todas antes do primeiro teste funcional.

| Variável | Valor | Origem |
| --- | --- | --- |
| `SUPABASE_URL` | `https://umttqvgapxvcgtjkjeyn.supabase.co` | Painel Supabase |
| `VITE_SUPABASE_URL` | idem acima | mesmo valor |
| `SUPABASE_PUBLISHABLE_KEY` | chave publishable/anon | Painel Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | idem acima | mesmo valor |
| `SUPABASE_SERVICE_ROLE_KEY` | service role | Painel Supabase — **nunca em variável `VITE_`** |
| `VITE_SUPABASE_PROJECT_ID` | `umttqvgapxvcgtjkjeyn` | metadado, não é lido por código |
| `FCM_PROJECT_ID` | `project_id` do JSON | Firebase |
| `FCM_CLIENT_EMAIL` | `client_email` do JSON | Firebase |
| `FCM_PRIVATE_KEY` | `private_key` do JSON, **com os `\n` literais** | Firebase |
| `GOOGLE_API_KEY` | Firebase Web Key | Google Cloud Console |
| `KINDWISE_API_KEY` | chave plant.id | painel Kindwise |
| `LOVABLE_CRON_SECRET` | gerar novo | eu gero no projeto novo |
| `LOVABLE_API_KEY` | **não cadastrar** | descontinuada |
| `AI_VISION_PROVIDER` | omitir | padrão já é Kindwise |

Detalhe que costuma quebrar: cole a `private_key` exatamente como está no JSON — uma única linha com `\n` como dois caracteres. Se o editor converter em quebras reais, o boot passa e o push falha só no primeiro envio.

## Passo 3 — Adotar os arquivos hoje auto-gerados

Sem o Cloud, cinco arquivos deixam de ser gerenciados pela plataforma e passam a ser do repo: `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts` e `types.ts`. O conteúdo atual já é genérico e lê tudo de env, então a ação é apenas remover os comentários de "arquivo gerado, não editar" e passar a mantê-los normalmente. Nenhuma mudança de lógica.

`src/integrations/supabase/previewAuthStorage.ts` é específico do preview da Lovable com Cloud; verificar se ainda se comporta bem sem Cloud e, se atrapalhar, trocar por storage padrão do Supabase. Isso eu confirmo no primeiro login de teste.

## Passo 4 — Atualizar o `.env` do repo

Substituir os valores de `fbcvxqotiyqnlehxsebr` pelos do projeto novo. Sem o Cloud, esse arquivo para de ser reescrito pela plataforma. Manter fora dele a service role key.

## Passo 5 — Configuração do lado Supabase

5.1. Em Authentication → URL Configuration, definir a `Site URL` e as `Redirect URLs` com o domínio do projeto novo (preview e publicado). Sem isso, o link de recuperação de senha volta para o lugar errado.
5.2. Confirmar que as 12 tabelas estão expostas na Data API (o projeto está com "Automatically expose new tables" desabilitado, então essa exposição é manual).
5.3. Criar o bucket `plant-photos` como privado e aplicar as políticas de `storage.objects`. Os 12 binários eram dados de teste e não vêm — mas as linhas em `plant_photos` vieram no dump, então elas apontam para objetos inexistentes. Duas saídas: apagar essas 6 linhas, ou aceitar imagem quebrada nas plantas antigas. Recomendo apagar, para o QA não confundir "storage mal configurado" com "arquivo ausente por decisão".

## Passo 6 — QA, na ordem

1. **Login** — gero um link mágico via Admin API para um dos 4 usuários e sigo no Playwright; e crio um 5º usuário descartável com senha conhecida para exercitar o formulário de senha. Prova que auth funciona contra o projeto novo sem você revelar credencial.
2. **Leitura** — `/plants` tem que mostrar as 10 plantas, com apelidos batendo com o `SELECT` direto no banco novo.
3. **Escrita** — renomeio uma planta para `QA-<timestamp>` pela UI, confirmo que aparece no banco novo e que **não** aparece no antigo. Depois reverto.
4. **RLS** — dois usuários de contas diferentes, conjuntos de plantas disjuntos na UI, mais um teste no banco com `request.jwt.claims` forjado do usuário A consultando a conta de B, esperando 0 linhas.
5. **FCM** — valido a assinatura RS256 cedo (troca de JWT por access token no Google OAuth), depois registro um token sintético e confirmo a linha em `push_subscriptions` no banco novo, incluindo o comportamento de upsert por `fcm_token`.
6. **Identificação (Fase 1)** — subo uma foto pelo fluxo, confirmo candidatos e a linha em `ai_usage_log` com `provider='kindwise'`.
7. **Resíduo zero** — `rg` por `fbcvxqotiyqnlehxsebr` em `src/`, `.env*`, config e no bundle `dist/`, mais o log de rede do Playwright confirmando que nenhuma requisição sai para o domínio antigo.

## Passo 7 — Depois do QA verde

- Troca de `LOVABLE_API_KEY` por `@ai-sdk/google` (etapa separada, já planejada). Até lá, a Fase 2 degrada de forma controlada: espécies já em cache funcionam, espécies novas mostram guia indisponível. Nada trava.
- Publicar, adicionar o domínio novo às restrições de referrer da Firebase Web Key e só então testar push real.
- Remoção do Lovable Cloud deste projeto: só quando você quiser, e nada depende disso.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Ativar o Cloud por engano no projeto novo | É irreversível; conferir antes de qualquer outra configuração |
| `\n` da private key corrompidos na cópia | Validar a assinatura RS256 logo no item 5 do QA, antes de dar por concluído |
| `previewAuthStorage` se comportando mal sem Cloud | Detectado no primeiro login; substituição é pequena e localizada |
| Linhas de `plant_photos` apontando para objetos ausentes | Limpar as 6 linhas no Passo 5.3 |
