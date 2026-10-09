import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Verificação somente leitura. Não aplica migrations, não cadastra usuários
// e não exibe a URL de conexão nem as credenciais.
const connection = process.env.DATABASE_URL;
if (!connection?.trim()) {
  console.error(
    "Preencha DATABASE_URL em apps/api/.env para testar a conexão.",
  );
  process.exit(1);
}

try {
  const address = new URL(connection);
  const values = [address.username, address.password, address.hostname];
  const hasPlaceholder = values.some(
    (value) =>
      /^(PREENCHER|SUBSTITUIR)/i.test(value) ||
      ["USUARIO", "SENHA_URL_ENCODED", "HOST"].includes(value.toUpperCase()),
  );
  if (
    !["postgresql:", "postgres:"].includes(address.protocol) ||
    !address.hostname ||
    !address.pathname.slice(1) ||
    hasPlaceholder
  ) {
    throw new Error("incomplete configuration");
  }
} catch {
  console.error(
    "DATABASE_URL está incompleta ou inválida. Confira host, porta, usuário, senha e nome do banco no .env.",
  );
  process.exit(1);
}

const db = new PrismaClient({
  datasources: { db: { url: connection } },
});
try {
  const [result] = await db.$queryRaw<
    { banco: string; contas_encontrada: boolean }[]
  >`
    SELECT current_database() AS banco,
           to_regclass('acesso.contas') IS NOT NULL AS contas_encontrada
  `;
  console.info(`Conexão PostgreSQL confirmada. Banco: ${result.banco}.`);
  if (!result.contas_encontrada) {
    console.error(
      "A tabela acesso.contas não foi encontrada ou não está acessível para esse usuário. Confira o banco e os privilégios.",
    );
    process.exitCode = 1;
  } else {
    console.info("Tabela acesso.contas encontrada. Nenhum dado foi alterado.");
  }
  const tables = await db.$queryRaw<
    { table_schema: string; table_name: string }[]
  >`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('acesso', 'organizacoes', 'pessoas', 'eventos', 'inscricoes', 'saude', 'arquivos')
      AND table_type = 'BASE TABLE'
  `;
  const found = new Set(
    tables.map((table) => `${table.table_schema}.${table.table_name}`),
  );
  const required = [
    "acesso.contas",
    "organizacoes.organizacoes",
    "organizacoes.membros",
    "organizacoes.convites",
    "organizacoes.auditoria",
    "pessoas.pessoas",
  ];
  for (const table of required) {
    const available = found.has(table);
    console.info(`${available ? "OK" : "PENDENTE"}: ${table}`);
    if (!available) process.exitCode = 1;
  }
  if (!process.exitCode) {
    await Promise.all([
      db.account.count(),
      db.organization.count(),
      db.membership.count(),
      db.invitation.count(),
      db.auditLog.count(),
      db.person.count(),
    ]);
    console.info(
      "Consultas dos seis modelos Prisma confirmadas com os nomes em português.",
    );
    const eventTables = [
      "eventos.tipos_evento",
      "eventos.eventos",
      "eventos.campanhas",
    ];
    if (eventTables.every((table) => found.has(table))) {
      await Promise.all([
        db.eventType.count(),
        db.event.count(),
        db.campaign.count(),
      ]);
      console.info(
        "Cadastro de eventos: três modelos Prisma confirmados no esquema eventos.",
      );
    } else {
      console.info(
        "Cadastro de eventos pendente: execute database/manual/05_eventos_e_periodos.sql no DBeaver.",
      );
    }
    const applicationTables = [
      "eventos.equipes",
      "inscricoes.versoes_ficha",
      "inscricoes.rascunhos",
      "inscricoes.inscricoes",
      "inscricoes.aceites",
      "inscricoes.historico",
      "saude.rascunhos_saude",
      "saude.fichas_saude",
      "arquivos.arquivos",
    ];
    if (
      eventTables.every((table) => found.has(table)) &&
      applicationTables.every((table) => found.has(table))
    ) {
      await Promise.all([
        db.team.count(),
        db.formVersion.count(),
        db.draft.count(),
        db.registration.count(),
        db.consent.count(),
        db.statusHistory.count(),
        db.draftHealth.count(),
        db.healthSubmission.count(),
        db.mediaAsset.count(),
      ]);
      console.info(
        "Fichas e candidaturas de servos: nove modelos adicionais conferidos, com os nomes em português.",
      );
    } else
      console.info(
        "Fichas de servos pendentes: após a etapa 05, execute database/manual/06_fichas_servos_e_inscricoes.sql no DBeaver.",
      );
  }
  if (found.has("inscricoes.avisos_decisao")) {
    await db.decisionNotice.count();
    console.info(
      "Avisos de aceite/recusa: modelo Prisma conferido no esquema inscricoes.",
    );
  } else
    console.info(
      "Avisos aos candidatos pendentes: após a etapa 06, execute database/manual/07_avisos_e_confirmacao_servos.sql no DBeaver.",
    );
  const [departments] = await db.$queryRaw<
    { ready: boolean }[]
  >`SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'eventos' AND table_name = 'equipes' AND column_name = 'vagas') AS ready`;
  console.info(
    departments?.ready
      ? "Departamentos: coluna de vagas confirmada no Prisma e no banco."
      : "Departamentos e vagas pendentes: execute database/manual/08_departamentos_e_vagas.sql no DBeaver após a etapa 06.",
  );
  console.info(
    "Esta checagem confirma acesso SQL às tabelas; não valida login nem operações das telas.",
  );
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "errorCode" in error
      ? String(error.errorCode)
      : typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
  const messages: Record<string, string> = {
    P2021:
      "Uma tabela não corresponde ao mapeamento Prisma. Confira os esquemas e regenere o cliente.",
    P2022:
      "Uma coluna não corresponde ao mapeamento Prisma. Confira a estrutura criada no DBeaver.",
    P1000: "Autenticação recusada. Confira usuário e senha no .env.",
    P1001:
      "Servidor não encontrado. Confira host, porta e o serviço PostgreSQL.",
    P1002: "O servidor não respondeu a tempo. Confira rede e disponibilidade.",
    P1003: "Banco não encontrado. Confira o nome eventos_beta na conexão.",
    P1010: "O usuário não tem acesso ao banco. Confira os privilégios.",
    P1011: "Não foi possível estabelecer TLS. Confira a configuração SSL.",
    P1013:
      "URL inválida. Confira a codificação da senha e o formato da conexão.",
  };
  console.error(
    messages[code] ??
      "Não foi possível verificar a conexão. Confira os dados no .env e as permissões do usuário.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
