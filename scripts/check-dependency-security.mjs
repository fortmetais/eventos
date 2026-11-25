import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Advisories reviewed on 2026-10-26 and 2026-11-25. npm audit can lag behind
// maintainers' advisories, so these checks also run without the registry.
export const securityFloors = Object.freeze({
  "body-parser": "2.4.0",
  "express-rate-limit": "8.7.5",
  "ip-address": "10.7.4",
  multer: "2.5.0",
  nodemailer: "10.1.4",
  "react-router": "7.18.7",
  "react-router-dom": "7.18.7",
  zod: "4.6.6",
});

function atLeast(version, minimum) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version))
    return false;
  const actual = version.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== floor[i]) return actual[i] > floor[i];
  }
  return true;
}

function safeVersion(name, version, minimum) {
  if (!atLeast(version, minimum)) return false;
  // GHSA-2rq8-3rm6-2w8f and GHSA-qhgm-jj2j-75wj also affect 8.0–8.5.0.
  // A numeric floor in the 7.x line must not accidentally accept those copies.
  if (
    ["react-router", "react-router-dom"].includes(name) &&
    version.startsWith("8.")
  )
    return atLeast(version, "8.5.1");
  return true;
}

/** Resolve the consumer's entry point without requiring a package.json export. */
export function installedPackage(consumerRequire, name) {
  let directory = dirname(consumerRequire.resolve(name));
  while (true) {
    const manifestPath = join(directory, "package.json");
    if (existsSync(manifestPath)) {
      const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (pkg.name === name) return { version: pkg.version, directory };
    }
    const parent = dirname(directory);
    assert(
      parent !== directory,
      `Não foi possível identificar ${name} instalado.`,
    );
    directory = parent;
  }
}

export function verifyDependencyVersions(lock, installedPackages, root) {
  for (const [name, minimum] of Object.entries(securityFloors)) {
    const matches = Object.entries(lock.packages).filter(
      ([path]) =>
        path.endsWith(`/node_modules/${name}`) ||
        path === `node_modules/${name}`,
    );
    assert(matches.length > 0, `${name} não foi encontrado no lockfile.`);
    for (const [path, pkg] of matches)
      assert(
        safeVersion(name, pkg.version, minimum),
        `Atualize ${name}: ${path} contém versão vulnerável ou anterior a ${minimum}.`,
      );

    const installed = installedPackages[name];
    assert(
      installed && safeVersion(name, installed.version, minimum),
      `${name} instalado está abaixo da versão corrigida ${minimum}.`,
    );
    const path = relative(fileURLToPath(root), installed.directory)
      .split(sep)
      .join("/");
    assert.equal(
      installed.version,
      lock.packages[path]?.version,
      `${name} instalado diverge do lockfile em ${path}. Execute npm ci.`,
    );
  }
}

export function verifyUuidVersions(lock, installed, expected) {
  const copies = Object.entries(lock.packages).filter(([path]) =>
    /(?:^|\/)node_modules\/uuid$/.test(path),
  );
  assert.equal(
    installed,
    expected,
    "UUID instalado diverge da versão corrigida.",
  );
  assert(
    copies.length > 0 && copies.every(([, pkg]) => pkg.version === expected),
    "O lockfile contém UUID diferente da versão corrigida. Use npm >=11.19.0 para atualizar as dependências.",
  );
}

export function checkDependencySecurity() {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("package.json", root), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(new URL("package-lock.json", root), "utf8"),
  );
  const apiRequire = createRequire(new URL("apps/api/package.json", root));
  const webRequire = createRequire(new URL("apps/web/package.json", root));
  const expressRequire = createRequire(apiRequire.resolve("express"));
  const limiterRequire = createRequire(
    apiRequire.resolve("express-rate-limit"),
  );
  const routerRequire = createRequire(webRequire.resolve("react-router-dom"));
  const installedPackages = Object.fromEntries(
    Object.keys(securityFloors).map((name) => {
      const consumer =
        name === "body-parser"
          ? expressRequire
          : name === "ip-address"
            ? limiterRequire
            : name === "react-router"
              ? routerRequire
              : name === "react-router-dom"
                ? webRequire
                : apiRequire;
      return [name, installedPackage(consumer, name)];
    }),
  );
  verifyDependencyVersions(lock, installedPackages, root);

  // Older npm versions can ignore transitive overrides across workspace links.
  // Preserve both the locked and actual ExcelJS UUID resolution checks.
  const expected = manifest.overrides.uuid;
  const excelRequire = createRequire(apiRequire.resolve("exceljs"));
  const installed = installedPackage(excelRequire, "uuid").version;
  verifyUuidVersions(lock, installed, expected);

  // Exercise the repaired bounds checks and the CommonJS API used by ExcelJS.
  const uuid = excelRequire("uuid");
  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  for (const method of ["v3", "v5", "v6"]) {
    for (const [length, offset] of [
      [8, 4],
      [16, 1],
      [16, -1],
    ]) {
      const buffer = new Uint8Array(length).fill(170);
      assert.throws(
        () =>
          method === "v6"
            ? uuid[method]({}, buffer, offset)
            : uuid[method]("x", namespace, buffer, offset),
        RangeError,
        `${method} deve recusar uma faixa inválida.`,
      );
      assert(
        buffer.every((byte) => byte === 170),
        "UUID alterou um buffer inválido.",
      );
    }
  }
  assert.equal(uuid.version(uuid.v4()), 4);
  console.info(
    `UUID ${installed} conferido: limites de buffer e compatibilidade com ExcelJS.`,
  );
  console.info(
    "Versões corrigidas de body-parser, express-rate-limit, ip-address, multer, nodemailer, React Router e zod conferidas no lockfile e na instalação.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  checkDependencySecurity();
