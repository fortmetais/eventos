import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  installedPackage,
  securityFloors,
  verifyDependencyVersions,
  verifyUuidVersions,
} from "./check-dependency-security.mjs";

const temporaryRoot = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, "fac-dependency-security-"));
const root = pathToFileURL(directory + "/");
after(() => {
  const target = resolve(directory);
  assert.equal(dirname(target), temporaryRoot);
  assert(basename(target).startsWith("fac-dependency-security-"));
  rmSync(target, { recursive: true, force: true });
});

function fixture() {
  const packages = {},
    installed = {};
  for (const [name, version] of Object.entries(securityFloors)) {
    packages[`node_modules/${name}`] = { version };
    installed[name] = {
      version,
      directory: join(directory, "node_modules", name),
    };
  }
  return { lock: { packages }, installed };
}

function verify({ lock, installed }) {
  verifyDependencyVersions(lock, installed, root);
}

test("aceita todas as versões corrigidas, incluindo cópias aninhadas", () => {
  const data = fixture();
  data.lock.packages["node_modules/parent/node_modules/react-router"] = {
    version: "7.18.7",
  };
  verify(data);
});

for (const [name, version] of [
  ["react-router", "7.18.4"],
  ["react-router-dom", "7.18.4"],
  ["express-rate-limit", "8.7.1"],
  ["express-rate-limit", "8.7.4"],
  ["body-parser", "2.3.0"],
  ["ip-address", "10.7.3"],
  ["multer", "2.4.0"],
  ["nodemailer", "10.1.3"],
  ["zod", "3.25.76"],
])
  test(`recusa ${name} ${version} no lockfile`, () => {
    const data = fixture();
    data.lock.packages[`node_modules/${name}`].version = version;
    assert.throws(() => verify(data), new RegExp(`Atualize ${name}`));
  });

for (const name of ["react-router", "react-router-dom", "express-rate-limit"])
  test(`recusa uma cópia aninhada vulnerável de ${name}`, () => {
    const data = fixture();
    data.lock.packages[`apps/web/node_modules/parent/node_modules/${name}`] = {
      version: name.startsWith("react-router") ? "7.18.4" : "8.7.1",
    };
    assert.throws(() => verify(data), /apps\/web\/node_modules\/parent/);
  });

test("recusa instalação antiga mesmo quando o lockfile está corrigido", () => {
  const data = fixture();
  data.installed["express-rate-limit"].version = "8.7.1";
  assert.throws(() => verify(data), /express-rate-limit instalado está abaixo/);
});

test("recusa uma versão instalada segura que diverge do lockfile", () => {
  const data = fixture();
  data.installed["react-router"].version = "7.18.8";
  assert.throws(
    () => verify(data),
    /react-router instalado diverge do lockfile/,
  );
});

test("recusa pacote instalado em caminho ausente do lockfile", () => {
  const data = fixture();
  data.installed["react-router"].directory = join(
    directory,
    "unlocked",
    "react-router",
  );
  assert.throws(
    () => verify(data),
    /react-router instalado diverge do lockfile/,
  );
});

test("exige cada biblioteca monitorada no lockfile", () => {
  const data = fixture();
  delete data.lock.packages["node_modules/express-rate-limit"];
  assert.throws(() => verify(data), /express-rate-limit não foi encontrado/);
});

for (const version of ["7.18.7-rc.1", "7.19.0-beta.1", "invalid", undefined])
  test(`recusa versão não estável ou inválida: ${version}`, () => {
    const data = fixture();
    data.lock.packages["node_modules/react-router"].version = version;
    assert.throws(() => verify(data), /Atualize react-router/);
  });

test("recusa prerelease instalado mesmo quando o lockfile está estável", () => {
  const data = fixture();
  data.installed["react-router"].version = "7.18.7-rc.1";
  assert.throws(() => verify(data), /react-router instalado está abaixo/);
});

for (const name of ["react-router", "react-router-dom"])
  test(`não aceita a linha 8 vulnerável de ${name} como maior que 7.18.7`, () => {
    const data = fixture();
    data.lock.packages[`node_modules/${name}`].version = "8.5.0";
    data.installed[name].version = "8.5.0";
    assert.throws(() => verify(data), new RegExp(`Atualize ${name}`));
    data.lock.packages[`node_modules/${name}`].version = "8.5.1";
    data.installed[name].version = "8.5.1";
    verify(data);
  });

function writePackage(path, name, version) {
  mkdirSync(join(path, "dist"), { recursive: true });
  writeFileSync(
    join(path, "package.json"),
    JSON.stringify({
      name,
      version,
      exports: { ".": "./dist/index.cjs" },
    }),
  );
  writeFileSync(
    join(path, "dist", "index.cjs"),
    "throw new Error('Não execute o pacote ao ler metadados');",
  );
}

test("identifica versão por entry point quando package.json não é exportado", () => {
  const base = join(directory, "exports-fixture");
  mkdirSync(base, { recursive: true });
  const pkg = join(base, "node_modules", "express-rate-limit");
  writePackage(pkg, "express-rate-limit", "8.7.5");
  const consumer = createRequire(join(base, "consumer.cjs"));
  assert.throws(() => consumer.resolve("express-rate-limit/package.json"), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
  assert.deepEqual(installedPackage(consumer, "express-rate-limit"), {
    version: "8.7.5",
    directory: pkg,
  });
});

test("usa a cópia de react-router realmente resolvida pelo react-router-dom", () => {
  const base = join(directory, "consumer-fixture");
  const dom = join(base, "node_modules", "react-router-dom");
  const directRouter = join(base, "node_modules", "react-router");
  const nestedRouter = join(dom, "node_modules", "react-router");
  writePackage(dom, "react-router-dom", "7.18.7");
  writePackage(directRouter, "react-router", "7.18.7");
  writePackage(nestedRouter, "react-router", "7.18.4");
  const webRequire = createRequire(join(base, "consumer.cjs"));
  const domRequire = createRequire(webRequire.resolve("react-router-dom"));
  assert.equal(installedPackage(webRequire, "react-router").version, "7.18.7");
  assert.deepEqual(installedPackage(domRequire, "react-router"), {
    version: "7.18.4",
    directory: nestedRouter,
  });
  const data = fixture();
  data.installed["react-router"] = installedPackage(domRequire, "react-router");
  assert.throws(() => verify(data), /react-router instalado está abaixo/);
});

test("preserva o override UUID em todas as cópias e na resolução do ExcelJS", () => {
  verifyUuidVersions(
    {
      packages: {
        "node_modules/uuid": { version: "11.1.1" },
        "node_modules/exceljs/node_modules/uuid": { version: "11.1.1" },
      },
    },
    "11.1.1",
    "11.1.1",
  );
});

test("bloqueia a regressão UUID aninhada introduzida por npm antigo", () => {
  assert.throws(
    () =>
      verifyUuidVersions(
        {
          packages: {
            "node_modules/uuid": { version: "11.1.1" },
            "node_modules/exceljs/node_modules/uuid": { version: "8.3.2" },
          },
        },
        "11.1.1",
        "11.1.1",
      ),
    /O lockfile contém UUID diferente/,
  );
});

test("bloqueia o UUID instalado antigo mesmo com lockfile corrigido", () => {
  assert.throws(
    () =>
      verifyUuidVersions(
        {
          packages: {
            "node_modules/uuid": { version: "11.1.1" },
          },
        },
        "8.3.2",
        "11.1.1",
      ),
    /UUID instalado diverge/,
  );
});

test("bloqueia ausência do UUID no lockfile", () => {
  assert.throws(
    () => verifyUuidVersions({ packages: {} }, "11.1.1", "11.1.1"),
    /O lockfile contém UUID diferente/,
  );
});

test("o limiter real preserva cinco requisições quando Object.prototype.max está contaminado", () => {
  // Keep this attack simulation outside the test runner and any application
  // process. No app config, production credentials, database or remote HTTP.
  const code = `
    import assert from "node:assert/strict";
    import { once } from "node:events";
    import express from "express";
    import request from "supertest";
    import { rateLimit } from "express-rate-limit";

    const app = express();
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "max");
    try {
      Object.prototype.max = 1_000_000_000;
      const options = { windowMs: 60_000 };
      assert.equal(options.max, 1_000_000_000);
      assert.equal(Object.hasOwn(options, "max"), false);
      assert.equal(Object.hasOwn(options, "limit"), false);
      app.use(rateLimit(options));
    } finally {
      if (previous) Object.defineProperty(Object.prototype, "max", previous);
      else delete Object.prototype.max;
    }
    app.get("/", (_req, res) => res.sendStatus(200));
    const statuses = [];
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      for (let i = 0; i < 6; i++) statuses.push((await request(server).get("/")).status);
      assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log(JSON.stringify(statuses));
  `;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", code],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    },
  );
  assert.deepEqual(JSON.parse(output.trim()), [200, 200, 200, 200, 200, 429]);
});
