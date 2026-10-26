import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Older npm releases can ignore transitive overrides across workspace links.
// Check the actual ExcelJS resolution and every locked UUID copy before building.
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("package.json", root), "utf8"),
);
const lock = JSON.parse(
  readFileSync(new URL("package-lock.json", root), "utf8"),
);
const expected = manifest.overrides.uuid;
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const excelRequire = createRequire(apiRequire.resolve("exceljs/package.json"));
const installed = excelRequire("uuid/package.json").version;
const copies = Object.entries(lock.packages).filter(([path]) =>
  /(?:^|\/)node_modules\/uuid$/.test(path),
);
// Security floors for the advisories reviewed on 2026-10-26. Check every
// locked copy so nested workspace dependencies cannot reintroduce them.
const securityFloors = {
  "body-parser": "2.4.0",
  "ip-address": "10.7.4",
  multer: "2.5.0",
  nodemailer: "10.1.4",
  zod: "4.6.6",
};
function atLeast(version, minimum) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const actual = version.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== floor[i]) return actual[i] > floor[i];
  }
  return true;
}
for (const [name, minimum] of Object.entries(securityFloors)) {
  const matches = Object.entries(lock.packages).filter(
    ([path]) =>
      path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`,
  );
  assert(
    matches.length > 0 &&
      matches.every(([, pkg]) => atLeast(pkg.version, minimum)),
    `Atualize ${name}: todas as cópias precisam ser >= ${minimum}.`,
  );
  const parent =
    name === "body-parser"
      ? createRequire(apiRequire.resolve("express/package.json"))
      : name === "ip-address"
        ? createRequire(apiRequire.resolve("express-rate-limit"))
        : apiRequire;
  const installedVersion = parent(`${name}/package.json`).version;
  assert(
    atLeast(installedVersion, minimum),
    `${name} instalado está abaixo da versão corrigida ${minimum}.`,
  );
}
assert.equal(
  installed,
  expected,
  "UUID instalado diverge da versão corrigida.",
);
assert(
  copies.length > 0 && copies.every(([, pkg]) => pkg.version === expected),
  "O lockfile contém UUID diferente da versão corrigida. Use npm >=11.19.0 para atualizar as dependências.",
);

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
  "Versões corrigidas de body-parser, ip-address, multer, nodemailer e zod conferidas.",
);
