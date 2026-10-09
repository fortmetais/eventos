import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";

// LiteSpeed requires the entry module from CommonJS. Exercise that loader after build.
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (
    /^(DATABASE_URL|DIRECT_URL|SUPABASE_|SMTP_|REGISTRATION_LINK_SECRET|VITE_)/.test(
      key,
    )
  ) {
    delete environment[key];
  }
}
Object.assign(environment, {
  NODE_ENV: "production",
  TEMPORARY_SITE: "true",
  HOST: "127.0.0.1",
  PORT: String(port),
  TRUST_PROXY: "0",
  DOTENV_CONFIG_PATH: resolve(".hostinger-startup-no-env"),
});
const child = spawn(
  process.execPath,
  [
    "--input-type=commonjs",
    "-e",
    "require(process.argv[1])",
    resolve("apps/api/dist/index.js"),
  ],
  { env: environment, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
child.stdout.on("data", (bytes) => {
  output += bytes;
});
child.stderr.on("data", (bytes) => {
  output += bytes;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Falha na inicialização para Hostinger: ${output}`);
    if (output.includes(`disponível na porta ${port}.`)) {
      ready = true;
      break;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, "O servidor compilado não iniciou no prazo de teste.");
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/api/v1/health`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mode, "temporary");
  const page = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src="\/fac-2027\.jpg"/);
  const business = await fetch(`${base}/api/v1/config`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(business.status, 503);
  assert.equal((await business.json()).error.code, "TEMPORARY_SITE");
  console.info(
    "Inicialização compatível com Hostinger validada; página temporária e bloqueio da API conferidos.",
  );
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}
