import { config } from "../src/config.js";
import { supabaseAdmin } from "../src/core/supabase.js";

if (
  !config.SUPABASE_URL ||
  !config.SUPABASE_ANON_KEY ||
  !config.SUPABASE_SERVICE_ROLE_KEY
) {
  console.error(
    "Crie o projeto Supabase e preencha SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY em apps/api/.env. As variáveis legadas anon/service_role também são aceitas.",
  );
  process.exit(1);
}
try {
  const settings = await fetch(
    `${config.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`,
    {
      headers: { apikey: config.SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!settings.ok) throw new Error("public settings unavailable");
  const data = (await settings.json()) as {
    external?: { email?: boolean };
    disable_signup?: boolean;
  };
  const { error } = await supabaseAdmin().auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (error) throw new Error("admin unavailable");
  console.info(
    "Supabase Auth acessível; chaves pública e administrativa verificadas sem exibir credenciais.",
  );
  if (!data.external?.email) {
    console.error("Habilite o provedor Email no painel Supabase Auth.");
    process.exitCode = 1;
  } else console.info("Provedor Email habilitado.");
  if (data.disable_signup)
    console.info(
      "Cadastro público desabilitado: contas novas deverão ser criadas pelo administrador do projeto Supabase.",
    );
  console.info(
    "Nenhum usuário foi criado e nenhum e-mail foi enviado. Teste o código de acesso na interface após ajustar o template Magic Link.",
  );
} catch {
  console.error(
    "Não foi possível verificar o Supabase Auth. Confira a URL, as chaves e se o projeto está ativo.",
  );
  process.exitCode = 1;
}
