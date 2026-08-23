# Diagnóstico — seletor de idioma

## Resumo

O mecanismo de i18n **funciona** na tela onde o seletor existe. Verifiquei ao vivo no preview: cliquei em `en` na landing e o título mudou de "Seu jardim, organizado." para "Your garden, organized.", `document.documentElement.lang` virou `en` e `localStorage["plantech.locale"]` gravou `en`.

O que está de fato quebrado é a **cobertura e a persistência** do seletor, não o `t()`.

## Respostas às perguntas

1. **Onde fica o estado do idioma?**
   React Context em `src/i18n/i18n.tsx` (`I18nProvider`, `useState<Locale>`), montado uma vez em `src/routes/__root.tsx`. Persistência em `localStorage` sob a chave `plantech.locale`. Não há parâmetro de URL nem Zustand. O SSR sempre renderiza `pt` (default) e o valor salvo/idioma do navegador é aplicado depois da hidratação, via `useEffect`, para evitar hydration mismatch.

2. **Componente do seletor:** `src/components/language-switcher.tsx`. É usado em apenas 3 telas: `src/routes/index.tsx`, `src/routes/auth.tsx` e `src/routes/_authenticated/app.tsx`.

3. **Como o `t()` recebe o locale:** por hook/contexto — `useI18n()` devolve `{ locale, setLocale, t }`; `t` é recriado via `useMemo` sempre que `locale` muda e chama `translate(locale, key)` em `src/i18n/translations.ts`.

4. **Fluxo ao trocar idioma:**
   clique no botão → `setLocale(code)` → `setLocaleState` + gravação no `localStorage` → o `useMemo` do provider gera um novo `value` (nova função `t`) → todos os consumidores de `useI18n()` re-renderizam → `useEffect` atualiza `document.documentElement.lang`. Confirmado funcionando no preview.

5. **Erros no console:** nenhum erro relacionado à troca de idioma na execução ao vivo; a troca respondeu normalmente.

6. **Estrutura das chaves:** correta e completa nos 3 idiomas — 279 chaves em `pt`, 279 em `en`, 279 em `es`, sem nenhuma faltando. Estrutura plana com chaves em string (`"landing.heading"`, `"auth.signIn"`...), `TranslationKey` derivado de `en`, e fallback `dictionaries[locale][key] ?? dictionaries.en[key] ?? key`.

Primeiras linhas de `src/i18n/translations.ts`:

```text
export const LOCALES = ["pt", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const dictionaries = {
  pt: {
    "app.name": "Plantech",
    "app.tagline": "Cuide das suas plantas com método.",
    ...
```

## Causas prováveis do "não funciona" percebido

- **Seletor ausente na maior parte do app.** Nenhuma tela de plantas (lista, detalhe, novo, editar, identificação) renderiza o `LanguageSwitcher`. Quem está dentro do fluxo de plantas não tem como trocar idioma.
- **Sem persistência por usuário.** `preferred_language` é gravado no cadastro, mas nunca é lido para inicializar o locale nem atualizado quando o usuário troca. Em outro navegador/dispositivo o app volta para `pt`.
- **Conteúdo fora do dicionário permanece em português.** Títulos/descrições de `head()` (`__root`, `index`, `auth`) são strings fixas em pt-BR; textos vindos do banco (guia de cuidado por espécie, notas da IA) são gerados por idioma e só mudam quando existe cache no idioma novo.
- **Flash inicial em pt.** Em recarga dura, o primeiro frame vem em `pt` até o `useEffect` de hidratação aplicar o idioma salvo.

## Perguntas antes de corrigir

- Em qual tela exatamente você viu a troca sem efeito? (Isso confirma se é a ausência do seletor ou outra coisa.)
- O idioma deve ficar salvo no perfil do usuário (server-side) além do navegador?
