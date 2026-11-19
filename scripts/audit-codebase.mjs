import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules, createRequire } from "node:module";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requireCompiler = createRequire(join(root, "apps/api/package.json"));
const ts = requireCompiler("typescript");
const args = process.argv.slice(2);
let out = null;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--help") {
    console.log(
      "node scripts/audit-codebase.mjs [--out .local/codebase-audit.json]\nRead-only audit. An explicit --out writes only the report under .local.",
    );
    process.exit(0);
  }
  if (args[index] !== "--out" || !args[index + 1])
    throw new Error("Unknown argument. Use --help.");
  out = resolve(root, args[++index]);
}
if (
  out &&
  (!out.startsWith(join(root, ".local") + sep) || extname(out) !== ".json")
) {
  throw new Error(
    "--out must be a JSON file inside the workspace .local directory.",
  );
}

const posix = (value) => value.split(sep).join("/");
const rel = (value) => posix(relative(root, value));
const ignored = new Set([
  "node_modules",
  "dist",
  ".git",
  ".local",
  ".agents",
  ".aws",
  ".codex",
  ".codex-attachments",
  ".codex-remote-attachments",
  "coverage",
]);
function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || /^\.env(?:\.|$)/.test(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}
const files = [
  ...new Set(
    ["apps", "scripts", "docs", "database"].flatMap((directory) =>
      walk(join(root, directory)),
    ),
  ),
];
const rootPackage = join(root, "package.json");
if (existsSync(rootPackage)) files.push(rootPackage);
const inventory = new Set(files.map((path) => resolve(path)));
const codePattern = /\.(?:[cm]?js|tsx?)$/i;
const codeFiles = files.filter((file) => codePattern.test(file));
const rootsByWorkspace = ["apps/api", "apps/web", "apps/form-layout", ""]
  .map((directory) => {
    const path = join(root, directory, "package.json");
    return existsSync(path)
      ? { directory, path, package: JSON.parse(readFileSync(path, "utf8")) }
      : null;
  })
  .filter(Boolean);
const workspaces = new Map(
  rootsByWorkspace
    .filter((entry) => entry.directory)
    .map((entry) => [entry.package.name, entry]),
);
const builtin = new Set(
  builtinModules.flatMap((name) => [name, "node:" + name]),
);
const optionsCache = new Map();
function compilerConfig(name) {
  if (optionsCache.has(name)) return optionsCache.get(name);
  const path = join(root, name, "tsconfig.json");
  if (!existsSync(path)) {
    const result = {
      options: {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        allowJs: true,
      },
      fileNames: [],
      errors: [],
    };
    optionsCache.set(name, result);
    return result;
  }
  const config = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config ?? {},
    ts.sys,
    dirname(path),
  );
  const result = {
    ...parsed,
    errors: [...(config.error ? [config.error] : []), ...parsed.errors],
  };
  optionsCache.set(name, result);
  return result;
}
function workspaceOf(file) {
  const path = rel(file);
  return (
    rootsByWorkspace.find(
      (entry) =>
        entry.directory &&
        (path === entry.directory || path.startsWith(entry.directory + "/")),
    ) ?? rootsByWorkspace.find((entry) => entry.directory === "")
  );
}
function packageName(specifier) {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}
function mapDist(path) {
  const pathName = rel(path);
  if (!pathName.startsWith("apps/api/dist/")) return path;
  return join(root, "apps/api/src", pathName.slice("apps/api/dist/".length));
}
function existingSource(path) {
  const mapped = mapDist(resolve(path));
  const candidates = [mapped];
  if (/\.m?js$/i.test(mapped))
    candidates.push(
      mapped.replace(/\.m?js$/i, ".ts"),
      mapped.replace(/\.m?js$/i, ".tsx"),
    );
  if (!extname(mapped))
    candidates.push(
      ...[
        ".ts",
        ".tsx",
        ".js",
        ".mjs",
        ".d.ts",
        ".css",
        ".json",
        ".svg",
        ".webp",
      ].map((suffix) => mapped + suffix),
    );
  candidates.push(
    ...["index.ts", "index.tsx", "index.js", "index.mjs", "index.d.ts"].map(
      (name) => join(mapped, name),
    ),
  );
  return (
    candidates.find((candidate) => inventory.has(resolve(candidate))) ?? null
  );
}
const resolutionCache = new Map();
function resolveTargets(file, specifier) {
  const cacheKey = file + "\n" + specifier;
  if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey);
  let targets = [];
  if (
    !/^(?:https?:|data:|blob:|node:)/i.test(specifier) &&
    !builtin.has(specifier)
  ) {
    const workspace = workspaces.get(packageName(specifier));
    if (workspace) {
      const subpath = specifier
        .slice(workspace.package.name.length)
        .replace(/^\//, "");
      const entries = subpath
        ? [subpath]
        : [
            workspace.package.main,
            workspace.package.types,
            "index.js",
            "index.d.ts",
          ].filter(Boolean);
      targets = entries
        .map((entry) => existingSource(join(dirname(workspace.path), entry)))
        .filter(Boolean);
    } else {
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        compilerConfig(workspaceOf(file)?.directory ?? "").options,
        ts.sys,
      ).resolvedModule?.resolvedFileName;
      if (resolved && !resolved.includes(sep + "node_modules" + sep)) {
        const source = existingSource(resolved);
        if (source) targets.push(source);
      }
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const base =
          specifier.startsWith("/") && rel(file).startsWith("apps/web/")
            ? join(root, "apps/web/public", specifier.slice(1))
            : resolve(dirname(file), specifier);
        const source = existingSource(base);
        if (source) targets.push(source);
      }
    }
  }
  targets = [...new Set(targets.map((target) => resolve(target)))];
  resolutionCache.set(cacheKey, targets);
  return targets;
}

const imports = [],
  dynamicUnknown = [],
  exports = [],
  anys = [],
  logs = [],
  comments = [],
  routes = [];
const astByFile = new Map();
function location(source, node) {
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return {
    file: rel(source.fileName),
    line: point.line + 1,
    column: point.character + 1,
  };
}
function exported(node) {
  return (
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}
function addImport(source, node, specifier, kind, names = []) {
  const record = {
    ...location(source, node),
    specifier,
    kind,
    names,
    targets: resolveTargets(source.fileName, specifier).map(rel),
  };
  imports.push(record);
}
function namesOfBinding(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((entry) =>
    ts.isOmittedExpression(entry) ? [] : namesOfBinding(entry.name),
  );
}
function addExport(source, node, name, kind) {
  exports.push({ ...location(source, node), name, kind });
}
for (const file of codeFiles) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  astByFile.set(rel(file), source);
  const routerBindings = new Set(["app", "router"]);
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      /^(?:Router|express(?:\.Router)?)$/.test(
        node.initializer.expression.getText(source),
      )
    ) {
      routerBindings.add(node.name.text);
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const names = [];
      if (clause?.name) names.push("default");
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) names.push("*");
        else
          names.push(
            ...clause.namedBindings.elements.map(
              (item) => item.propertyName?.text ?? item.name.text,
            ),
          );
      }
      addImport(
        source,
        node,
        node.moduleSpecifier.text,
        clause?.isTypeOnly ? "type" : clause ? "import" : "side-effect",
        names,
      );
    }
    if (ts.isExportDeclaration(node)) {
      const names =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map(
              (item) => item.propertyName?.text ?? item.name.text,
            )
          : ["*"];
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier))
        addImport(source, node, node.moduleSpecifier.text, "re-export", names);
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const item of node.exportClause.elements)
          addExport(source, node, item.name.text, "re-export");
      } else addExport(source, node, "*", "re-export-all");
    } else if (ts.isExportAssignment(node)) {
      addExport(
        source,
        node,
        node.isExportEquals ? "export=" : "default",
        "assignment",
      );
    } else if (exported(node)) {
      const isDefault = ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      if (isDefault)
        addExport(source, node, "default", ts.SyntaxKind[node.kind]);
      else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations)
          for (const name of namesOfBinding(declaration.name))
            addExport(source, node, name, "variable");
      } else if (node.name && ts.isIdentifier(node.name))
        addExport(source, node, node.name.text, ts.SyntaxKind[node.kind]);
    }
    if (ts.isCallExpression(node)) {
      const call = node.expression;
      const isDynamic = call.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(call) && call.text === "require";
      const isRequireResolve =
        ts.isPropertyAccessExpression(call) &&
        ts.isIdentifier(call.expression) &&
        call.expression.text === "require" &&
        call.name.text === "resolve";
      if (isDynamic || isRequire || isRequireResolve) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg))
          addImport(
            source,
            node,
            arg.text,
            isDynamic
              ? "dynamic"
              : isRequireResolve
                ? "require-resolve"
                : "require",
            ["*"],
          );
        else
          dynamicUnknown.push({
            ...location(source, node),
            expression: node.getText(source).slice(0, 160),
            kind: isDynamic ? "dynamic-import" : "require",
          });
      }
      if (
        ts.isPropertyAccessExpression(call) &&
        ts.isIdentifier(call.expression) &&
        call.expression.text === "console" &&
        ["log", "debug", "info", "warn", "error", "trace", "table"].includes(
          call.name.text,
        )
      ) {
        const workspace = workspaceOf(file);
        const operational =
          !rel(file).includes("/src/") || /\.test\./.test(file);
        const first = node.arguments[0];
        const structured = Boolean(
          first &&
          (ts.isObjectLiteralExpression(first) ||
            (ts.isCallExpression(first) &&
              first.expression.getText(source) === "JSON.stringify")),
        );
        logs.push({
          ...location(source, node),
          method: call.name.text,
          classification: operational
            ? "operational"
            : rel(file) === "apps/api/src/index.ts"
              ? "backend-startup-review"
              : workspace?.directory === "apps/api" &&
                  (structured || ["warn", "error"].includes(call.name.text))
                ? "backend-essential-review"
                : "debug-review",
          structured,
        });
      }
      if (
        ts.isPropertyAccessExpression(call) &&
        [
          "get",
          "post",
          "put",
          "patch",
          "delete",
          "head",
          "options",
          "all",
        ].includes(call.name.text) &&
        rel(file).startsWith("apps/api/src/")
      ) {
        const receiver = call.expression;
        const chained =
          ts.isCallExpression(receiver) &&
          ts.isPropertyAccessExpression(receiver.expression) &&
          receiver.expression.name.text === "route" &&
          receiver.arguments[0] &&
          ts.isStringLiteralLike(receiver.arguments[0]);
        const path =
          node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
            ? node.arguments[0].text
            : chained
              ? receiver.arguments[0].text
              : null;
        if (
          path?.startsWith("/") &&
          (routerBindings.has(receiver.getText(source)) ||
            rel(file).endsWith(".routes.ts") ||
            chained)
        ) {
          routes.push({
            ...location(source, node),
            method: call.name.text.toUpperCase(),
            path,
            preservation:
              "Local router path; mount prefixes are not expanded. HTTP contract: never delete based only on frontend usage.",
          });
        }
      }
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      anys.push({
        ...location(source, node),
        test: /(?:\.test\.|\/tests\/)/.test(rel(file)),
      });
    // Conservatively retain paths read dynamically from files, URLs, and test configuration.
    if (
      ts.isStringLiteralLike(node) &&
      /^(?:\.{1,2}\/|\/src\/|\/data\/|apps\/|scripts\/)/.test(node.text)
    ) {
      const targets = resolveTargets(file, node.text);
      if (
        targets.length &&
        !imports.some(
          (entry) => entry.file === rel(file) && entry.specifier === node.text,
        )
      )
        addImport(source, node, node.text, "string-reference", ["*"]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      ![
        ts.SyntaxKind.SingleLineCommentTrivia,
        ts.SyntaxKind.MultiLineCommentTrivia,
      ].includes(token)
    )
      continue;
    const comment = scanner.getTokenText();
    if (
      !/(?:\b(?:const|let|var|function)\s+\w+\s*[=(]|\b(?:return|await)\s+[a-z_$]+\(|console\.(?:log|debug)\(|TODO[^\n]*(?:remove|debug|test))/i.test(
        comment,
      )
    )
      continue;
    const point = source.getLineAndCharacterOfPosition(scanner.getTokenPos());
    comments.push({
      file: rel(file),
      line: point.line + 1,
      text: comment.trim().slice(0, 220),
      classification: "code-like-comment-review",
      preservation: "Candidate only; explanatory/security notes must be kept.",
    });
  }
}
for (const file of files.filter((path) => /\.(?:css|html)$/i.test(path))) {
  const text = readFileSync(file, "utf8");
  const pattern =
    /(?:url\(\s*["']?([^"')]+)|(?:src|href)=["']([^"']+)["']|@import\s+["']([^"']+)["'])/g;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    const targets = resolveTargets(file, specifier);
    if (targets.length)
      imports.push({
        file: rel(file),
        line: text.slice(0, match.index).split("\n").length,
        column: 1,
        specifier,
        kind: "asset",
        names: ["*"],
        targets: targets.map(rel),
      });
  }
}
const graph = new Map();
for (const entry of imports) {
  const edges = graph.get(entry.file) ?? new Set();
  entry.targets.forEach((target) => edges.add(target));
  graph.set(entry.file, edges);
}
const runtimeEntries = [
  "apps/api/src/index.ts",
  "apps/web/src/main.tsx",
  "apps/form-layout/index.js",
  "apps/form-layout/index.d.ts",
].filter((file) => inventory.has(resolve(root, file)));
const operationalEntries = codeFiles
  .map(rel)
  .filter(
    (file) =>
      file.startsWith("scripts/") ||
      file.startsWith("apps/api/scripts/") ||
      file === "apps/api/prisma/seed.ts",
  );
const testEntries = codeFiles
  .map(rel)
  .filter((file) => /(?:\.(?:test|spec)\.|\/(?:tests|__tests__)\/)/.test(file));
const configEntries = codeFiles
  .map(rel)
  .filter((file) =>
    /(?:\/|^)(?:vite|vitest|playwright|eslint)\.config\./.test(file),
  );
function reachable(entries) {
  const found = new Set(entries),
    queue = [...entries];
  while (queue.length)
    for (const target of graph.get(queue.pop()) ?? [])
      if (!found.has(target)) {
        found.add(target);
        queue.push(target);
      }
  return found;
}
const runtime = reachable(runtimeEntries),
  operational = reachable(operationalEntries),
  tests = reachable([...testEntries, ...configEntries]);
const publicEntries = new Set(runtimeEntries);
const orphanCandidates = codeFiles
  .map(rel)
  .filter(
    (file) =>
      /^(?:apps\/(?:api|web)\/src|apps\/form-layout)\//.test(file) &&
      !runtime.has(file) &&
      !operational.has(file) &&
      !tests.has(file) &&
      !publicEntries.has(file) &&
      !/\.d\.ts$/.test(file),
  )
  .map((file) => ({
    file,
    confidence: dynamicUnknown.length ? "review-dynamic-references" : "review",
    action:
      "Inspect documentation, reflection, external clients and compatibility before deleting.",
  }));
const testOrOperationalOnly = codeFiles
  .map(rel)
  .filter(
    (file) =>
      /^(?:apps\/(?:api|web)\/src|apps\/form-layout)\//.test(file) &&
      !runtime.has(file) &&
      (tests.has(file) || operational.has(file)),
  )
  .map((file) => ({
    file,
    test: tests.has(file),
    operational: operational.has(file),
  }));

const consumed = new Map(),
  uncertain = new Set();
for (const entry of imports)
  for (const target of entry.targets) {
    const names = consumed.get(target) ?? new Set();
    entry.names.forEach((name) => names.add(name));
    consumed.set(target, names);
    if (
      entry.names.includes("*") ||
      ["dynamic", "string-reference", "side-effect"].includes(entry.kind)
    )
      uncertain.add(target);
  }
const unusedExportCandidates = exports
  .filter(
    (entry) =>
      entry.name !== "*" &&
      !publicEntries.has(entry.file) &&
      !uncertain.has(entry.file) &&
      !consumed.get(entry.file)?.has(entry.name) &&
      !/\.d\.ts$/.test(entry.file) &&
      /^(?:apps\/(?:api|web)\/src|apps\/form-layout)\//.test(entry.file),
  )
  .map((entry) => {
    const source = astByFile.get(entry.file);
    let mentions = 0;
    const count = (node) => {
      if (ts.isIdentifier(node) && node.text === entry.name) mentions++;
      ts.forEachChild(node, count);
    };
    if (source) count(source);
    return {
      ...entry,
      locallyReferenced: mentions > 1,
      action:
        "Review visibility only; absence of a named import is not proof that implementation or HTTP contracts are dead.",
    };
  });

const compilerDiagnostics = [];
for (const directory of ["apps/api", "apps/web"]) {
  const config = compilerConfig(directory);
  const program = ts.createProgram(config.fileNames, {
    ...config.options,
    noEmit: true,
    incremental: false,
    noUnusedLocals: true,
    noUnusedParameters: true,
  });
  for (const diagnostic of [
    ...config.errors,
    ...ts.getPreEmitDiagnostics(program),
  ]) {
    const path = diagnostic.file ? rel(diagnostic.file.fileName) : null;
    const point =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : null;
    compilerDiagnostics.push({
      workspace: directory,
      file: path,
      line: point ? point.line + 1 : null,
      code: diagnostic.code,
      unused: [6133, 6138, 6192, 6196, 6198].includes(diagnostic.code),
      protectedConfiguration: Boolean(
        path && /(?:^|\/)[^/]*config\.[cm]?[jt]s$/.test(path),
      ),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    });
  }
}

const cliPackages = {
  tsc: "typescript",
  tsx: "tsx",
  prisma: "prisma",
  vitest: "vitest",
  vite: "vite",
  prettier: "prettier",
  concurrently: "concurrently",
  playwright: "@playwright/test",
};
const dependencies = [];
for (const workspace of rootsByWorkspace) {
  const ownedImports = imports.filter(
    (entry) =>
      workspaceOf(join(root, entry.file))?.directory === workspace.directory &&
      !entry.specifier.startsWith(".") &&
      !entry.specifier.startsWith("/") &&
      !builtin.has(entry.specifier) &&
      !/^(?:https?:|node:|data:)/.test(entry.specifier),
  );
  const scriptCommands = Object.entries(workspace.package.scripts ?? {});
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ])
    for (const [name, version] of Object.entries(
      workspace.package[section] ?? {},
    )) {
      const importUsage = ownedImports
        .filter((entry) => packageName(entry.specifier) === name)
        .map(({ file, specifier, kind }) => ({ file, specifier, kind }));
      const cliUsage = scriptCommands
        .filter(([, command]) =>
          Object.entries(cliPackages).some(
            ([binary, packageId]) =>
              packageId === name &&
              new RegExp("(?:^|[^\\w-])" + binary + "(?:$|[^\\w-])").test(
                command,
              ),
          ),
        )
        .map(([script]) => script);
      const ambientTypes = name.startsWith("@types/");
      const configUsage =
        name === "jsdom" &&
        configEntries.some(
          (file) =>
            workspaceOf(join(root, file))?.directory === workspace.directory &&
            /environment\s*:\s*["']jsdom["']/.test(
              readFileSync(join(root, file), "utf8"),
            ),
        );
      dependencies.push({
        workspace: workspace.directory || ".",
        name,
        version,
        section,
        imports: importUsage,
        cliScripts: cliUsage,
        ambientTypes,
        configurationUsage: configUsage,
        unusedCandidate:
          !importUsage.length &&
          !cliUsage.length &&
          !ambientTypes &&
          !configUsage,
        note: ambientTypes
          ? "Ambient TypeScript declarations; no literal import is expected."
          : configUsage
            ? "Runtime selected by the test environment configuration."
            : null,
      });
    }
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  root,
  policy: [
    "Read-only by default; --out writes only this JSON report under .local.",
    "No automatic removal. HTTP endpoints, DTO properties, migrations, configurations and compatibility contracts require explicit review.",
    "All operational scripts and test files are retained as entrypoints even when no package script references them.",
    "Nonliteral dynamic imports and conservative string references can conceal reachability. Candidate lists are not proof of dead code.",
    "Named-export candidates refer to visibility; locally used implementations must not be deleted.",
  ],
  inventory: {
    totalFiles: inventory.size,
    codeFiles: codeFiles.length,
    imports: imports.length,
    exports: exports.length,
  },
  entrypoints: {
    runtime: runtimeEntries,
    operational: operationalEntries,
    test: testEntries,
    configuration: configEntries,
  },
  reachability: {
    runtime: [...runtime].sort(),
    operational: [...operational].sort(),
    test: [...tests].sort(),
    orphanCandidates,
    testOrOperationalOnly,
  },
  imports,
  exports,
  unresolvedDynamicReferences: dynamicUnknown,
  unusedExportCandidates,
  compilerDiagnostics,
  explicitAny: anys,
  consoleCalls: logs,
  codeLikeComments: comments,
  publicHttpContracts: routes,
  dependencies,
  dependencyCandidates: dependencies.filter((entry) => entry.unusedCandidate),
  dependenciesWithoutLiteralImports: dependencies.filter(
    (entry) => !entry.imports.length,
  ),
  preservedOverrides: rootsByWorkspace
    .filter((entry) => entry.package.overrides)
    .map((entry) => ({
      workspace: entry.directory || ".",
      overrides: entry.package.overrides,
    })),
};
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
}
console.log(
  JSON.stringify(
    {
      report: out ? rel(out) : null,
      inventory: report.inventory,
      orphanCandidates,
      unusedExportCandidates: unusedExportCandidates.length,
      unusedCompilerDiagnostics: compilerDiagnostics.filter(
        (entry) => entry.unused,
      ),
      otherCompilerErrors: compilerDiagnostics.filter((entry) => !entry.unused)
        .length,
      explicitAny: {
        production: anys.filter((entry) => !entry.test).length,
        test: anys.filter((entry) => entry.test).length,
      },
      debugConsoleCandidates: logs.filter(
        (entry) => entry.classification === "debug-review",
      ).length,
      codeLikeCommentCandidates: comments.length,
      protectedHttpContracts: routes.length,
      dependencyCandidates: report.dependencyCandidates.map(
        ({ workspace, name, section }) => ({ workspace, name, section }),
      ),
    },
    null,
    2,
  ),
);
