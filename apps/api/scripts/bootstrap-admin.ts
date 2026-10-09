import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { supabaseAdmin } from "../src/core/supabase.js";
import { id } from "../src/core/security.js";
const db = new PrismaClient();
try {
  const userId = id.parse(process.env.BOOTSTRAP_ADMIN_USER_ID);
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId);
  if (error || !data.user?.email || !data.user.email_confirmed_at)
    throw new Error(
      "Informe uma conta Supabase existente com e-mail confirmado.",
    );
  await db.account.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: data.user.email.toLowerCase(),
      platformAdmin: true,
    },
    update: { platformAdmin: true, email: data.user.email.toLowerCase() },
  });
  console.info(
    "Administrador provisionado. Nenhuma senha ou credencial foi registrada no código.",
  );
} finally {
  await db.$disconnect();
}
