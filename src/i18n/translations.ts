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

    "landing.heading": "Seu jardim, organizado.",
    "landing.body":
      "Registre plantas, acompanhe cuidados e mantenha o armário de produtos da sua conta em um só lugar.",
    "landing.cta": "Entrar ou criar conta",

    "auth.signIn": "Entrar",
    "auth.signUp": "Criar conta",
    "auth.email": "E-mail",
    "auth.password": "Senha",
    "auth.fullName": "Nome completo",
    "auth.language": "Idioma preferido",
    "auth.submitSignIn": "Entrar",
    "auth.submitSignUp": "Criar minha conta",
    "auth.toSignUp": "Ainda não tem conta? Criar conta",
    "auth.toSignIn": "Já tem conta? Entrar",
    "auth.loading": "Processando...",
    "auth.signedOut": "Sessão encerrada.",
    "auth.welcome": "Bem-vindo de volta!",
    "auth.created": "Conta criada com sucesso.",

    "shell.signOut": "Sair",
    "shell.account": "Conta ativa",
    "shell.accounts": "Suas contas",
    "shell.role": "Papel",
    "shell.singleAccount": "Você tem apenas uma conta ativa.",
    "shell.switch": "Trocar conta",
    "shell.loading": "Carregando contexto da conta...",
    "shell.noAccount": "Nenhuma conta ativa encontrada para este usuário.",
    "shell.user": "Usuário",
    "shell.next": "Próximos passos",
    "shell.plants": "Plantas",
    "shell.plantsDesc": "Cadastro e detalhe das suas plantas.",
    "shell.careLog": "Cuidados",
    "shell.careLogDesc": "Histórico de rega, adubação e tratamentos.",
    "shell.products": "Produtos",
    "shell.productsDesc": "Armário compartilhado da conta.",
    "shell.soon": "Em breve",

    "role.owner": "Proprietário",
    "role.admin": "Administrador",
    "role.member": "Membro",
  },
  en: {
    "app.name": "Plantech",
    "app.tagline": "Care for your plants with method.",

    "landing.heading": "Your garden, organized.",
    "landing.body":
      "Track plants, log care and keep your account's product cabinet in one place.",
    "landing.cta": "Sign in or sign up",

    "auth.signIn": "Sign in",
    "auth.signUp": "Sign up",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.fullName": "Full name",
    "auth.language": "Preferred language",
    "auth.submitSignIn": "Sign in",
    "auth.submitSignUp": "Create my account",
    "auth.toSignUp": "No account yet? Sign up",
    "auth.toSignIn": "Already have an account? Sign in",
    "auth.loading": "Working...",
    "auth.signedOut": "Signed out.",
    "auth.welcome": "Welcome back!",
    "auth.created": "Account created.",

    "shell.signOut": "Sign out",
    "shell.account": "Active account",
    "shell.accounts": "Your accounts",
    "shell.role": "Role",
    "shell.singleAccount": "You have a single active account.",
    "shell.switch": "Switch account",
    "shell.loading": "Loading account context...",
    "shell.noAccount": "No active account found for this user.",
    "shell.user": "User",
    "shell.next": "Next steps",
    "shell.plants": "Plants",
    "shell.plantsDesc": "Create and inspect your plants.",
    "shell.careLog": "Care log",
    "shell.careLogDesc": "Watering, fertilizing and treatment history.",
    "shell.products": "Products",
    "shell.productsDesc": "Shared account cabinet.",
    "shell.soon": "Soon",

    "role.owner": "Owner",
    "role.admin": "Admin",
    "role.member": "Member",
  },
  es: {
    "app.name": "Plantech",
    "app.tagline": "Cuida tus plantas con método.",

    "landing.heading": "Tu jardín, organizado.",
    "landing.body":
      "Registra plantas, sigue los cuidados y mantén el armario de productos de tu cuenta en un solo lugar.",
    "landing.cta": "Entrar o crear cuenta",

    "auth.signIn": "Entrar",
    "auth.signUp": "Crear cuenta",
    "auth.email": "Correo",
    "auth.password": "Contraseña",
    "auth.fullName": "Nombre completo",
    "auth.language": "Idioma preferido",
    "auth.submitSignIn": "Entrar",
    "auth.submitSignUp": "Crear mi cuenta",
    "auth.toSignUp": "¿Sin cuenta? Crear cuenta",
    "auth.toSignIn": "¿Ya tienes cuenta? Entrar",
    "auth.loading": "Procesando...",
    "auth.signedOut": "Sesión cerrada.",
    "auth.welcome": "¡Bienvenido de nuevo!",
    "auth.created": "Cuenta creada.",

    "shell.signOut": "Salir",
    "shell.account": "Cuenta activa",
    "shell.accounts": "Tus cuentas",
    "shell.role": "Rol",
    "shell.singleAccount": "Tienes una sola cuenta activa.",
    "shell.switch": "Cambiar cuenta",
    "shell.loading": "Cargando contexto de la cuenta...",
    "shell.noAccount": "No se encontró una cuenta activa para este usuario.",
    "shell.user": "Usuario",
    "shell.next": "Próximos pasos",
    "shell.plants": "Plantas",
    "shell.plantsDesc": "Registro y detalle de tus plantas.",
    "shell.careLog": "Cuidados",
    "shell.careLogDesc": "Historial de riego, abono y tratamientos.",
    "shell.products": "Productos",
    "shell.productsDesc": "Armario compartido de la cuenta.",
    "shell.soon": "Pronto",

    "role.owner": "Propietario",
    "role.admin": "Administrador",
    "role.member": "Miembro",
  },
} as const;

export type TranslationKey = keyof (typeof dictionaries)["en"];

export function translate(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
}
