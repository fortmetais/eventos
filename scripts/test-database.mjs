import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const pgBin =
  process.env.PG_BIN ?? (windows ? "C:/Program Files/PostgreSQL/12/bin" : "");
const binary = (name) =>
  pgBin ? join(pgBin, `${name}${windows ? ".exe" : ""}`) : name;
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error("Execute este script pelo comando npm run test:database.");
function run(file, args, env = process.env) {
  const result = spawnSync(file, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${file} terminou com código ${result.status}`);
}
const local = join(root, ".local");
mkdirSync(local, { recursive: true });
const data = mkdtempSync(join(local, "test-postgres-"));
if (!existsSync(binary("initdb")) && pgBin)
  throw new Error("Informe PG_BIN com os binários PostgreSQL instalados.");
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolvePort(port));
  });
});
let started = false;
try {
  run(binary("initdb"), [
    "-D",
    data,
    "-U",
    "fac_test",
    "--auth-local=trust",
    "--auth-host=trust",
    "--encoding=UTF8",
    "--locale=C",
  ]);
  run(binary("pg_ctl"), [
    "-D",
    data,
    "-l",
    join(data, "server.log"),
    "-o",
    `-p ${port} -h 127.0.0.1 -c fsync=off -c synchronous_commit=off`,
    "-w",
    "start",
  ]);
  started = true;
  run(binary("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fac_test",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE fac_tests",
  ]);
  const url = `postgresql://fac_test@127.0.0.1:${port}/fac_tests`;
  run(binary("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fac_test",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE fac_initial_tests",
  ]);
  for (const script of [
    "01_acesso_e_administrador.sql",
    "02_organizacoes_e_responsaveis.sql",
    "03_pessoas_e_participantes.sql",
  ]) {
    run(binary("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "fac_test",
      "-d",
      "fac_initial_tests",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      join(root, "database", "manual", script),
    ]);
  }
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: url,
    DIRECT_URL: url,
    TEST_DATABASE_URL: `${url}?schema=acesso`,
    TEST_INITIAL_DATABASE_URL: `postgresql://fac_test@127.0.0.1:${port}/fac_initial_tests?schema=acesso`,
    TEST_EVENTS_DATABASE_URL: `postgresql://fac_test@127.0.0.1:${port}/fac_events_tests?schema=acesso`,
    TEST_VOLUNTEER_DATABASE_URL: `postgresql://fac_test@127.0.0.1:${port}/fac_volunteer_tests?schema=acesso`,
    TEST_NOTICE_DATABASE_URL: `postgresql://fac_test@127.0.0.1:${port}/fac_notice_tests?schema=acesso`,
    TEST_DEPARTMENT_DATABASE_URL: `postgresql://fac_test@127.0.0.1:${port}/fac_department_tests?schema=acesso`,
  };
  run(binary("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fac_test",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE fac_events_tests",
  ]);
  for (const script of [
    "01_acesso_e_administrador.sql",
    "02_organizacoes_e_responsaveis.sql",
    "03_pessoas_e_participantes.sql",
    "05_eventos_e_periodos.sql",
  ]) {
    run(binary("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "fac_test",
      "-d",
      "fac_events_tests",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      join(root, "database", "manual", script),
    ]);
  }
  run(process.execPath, [npmCli, "run", "db:deploy"], env);
  run(binary("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fac_test",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE fac_volunteer_tests",
  ]);
  for (const script of [
    "01_acesso_e_administrador.sql",
    "02_organizacoes_e_responsaveis.sql",
    "03_pessoas_e_participantes.sql",
    "05_eventos_e_periodos.sql",
    "06_fichas_servos_e_inscricoes.sql",
    "08_departamentos_e_vagas.sql",
  ]) {
    run(binary("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "fac_test",
      "-d",
      "fac_volunteer_tests",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      join(root, "database", "manual", script),
    ]);
  }
  run(binary("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fac_test",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE fac_notice_tests",
  ]);
  for (const script of [
    "01_acesso_e_administrador.sql",
    "02_organizacoes_e_responsaveis.sql",
    "03_pessoas_e_participantes.sql",
    "05_eventos_e_periodos.sql",
    "06_fichas_servos_e_inscricoes.sql",
    "07_avisos_e_confirmacao_servos.sql",
    "08_departamentos_e_vagas.sql",
  ]) {
    run(binary("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "fac_test",
      "-d",
      "fac_notice_tests",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      join(root, "database", "manual", script),
    ]);
  }
  run(binary("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fac_test",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE fac_department_tests",
  ]);
  for (const script of [
    "01_acesso_e_administrador.sql",
    "02_organizacoes_e_responsaveis.sql",
    "03_pessoas_e_participantes.sql",
    "05_eventos_e_periodos.sql",
    "06_fichas_servos_e_inscricoes.sql",
    "08_departamentos_e_vagas.sql",
  ])
    run(binary("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "fac_test",
      "-d",
      "fac_department_tests",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      join(root, "database", "manual", script),
    ]);
  run(process.execPath, [npmCli, "run", "test"], env);
} finally {
  if (started) run(binary("pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"]);
  console.info(
    "Banco de teste isolado encerrado. Nenhuma base existente foi utilizada.",
  );
}
