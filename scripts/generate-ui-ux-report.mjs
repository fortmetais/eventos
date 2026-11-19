import { readFile, writeFile, mkdir, copyFile, stat } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2),
  opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--help") {
    opts.help = true;
    continue;
  }
  if (!args[i].startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error("Use --opcao valor; consulte --help.");
  opts[args[i].slice(2)] = args[++i];
}
if (opts.help) {
  console.log(
    "node scripts/generate-ui-ux-report.mjs [--before-dir pasta] [--after-dir pasta] [--out pasta] [--baseline SHA] [--implementation-sha SHA] [--implementation-label texto] [--implementation-digest SHA256] [--findings arquivo.json] [--capture-manifest arquivo.json]",
  );
  process.exit(0);
}
const beforeDir = resolve(
  root,
  opts["before-dir"] || ".local/ui-ux-before/screenshots",
);
const afterDir = resolve(
  root,
  opts["after-dir"] || ".local/ui-ux-after/screenshots",
);
const out = resolve(root, opts.out || ".local/ui-ux-audit");
const baseline = opts.baseline || "eb9f157",
  implementationSha = opts["implementation-sha"] || null;
const inside = (parent, path) =>
  path === parent ||
  path.startsWith(parent + "/") ||
  path.startsWith(parent + "\\");
if (
  !inside(join(root, ".local"), out) ||
  inside(out, beforeDir) ||
  inside(out, afterDir)
)
  throw new Error("Saida deve ficar em .local e fora das pastas de entrada.");
const esc = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const exists = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};
const experimental = (name) =>
  /proposed|prototype|experiment|experimento|ensaio/i.test(name);
async function png(path) {
  const buffer = await readFile(path);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error("Somente PNG: " + path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
const modules = [
  ["access", "Acesso e convites"],
  ["profile", "Perfil"],
  ["events", "Eventos"],
  ["organization", "Organizacao e painel"],
  ["members", "Membros"],
  ["functions", "Funcoes"],
  ["forms", "Fichas e formularios"],
  ["imports", "Importacao"],
  ["messages", "Mensagens do evento"],
  ["health", "Saude"],
  ["admin", "Controles e modais"],
  ["registrations", "Inscricoes: contrato protegido"],
].map(([id, title]) => ({ id, title, protected: id === "registrations" }));
const catalog = [
  ["events", "audit-before-event-desktop.png", "Novo evento - computador"],
  ["events", "audit-before-event-celular.png", "Novo evento - celular"],
  [
    "events",
    "evento-publicado-edicao-desktop.png",
    "Evento publicado - computador",
  ],
  [
    "events",
    "evento-publicado-edicao-celular.png",
    "Evento publicado - celular",
  ],
  [
    "organization",
    "event-dashboard-desktop-all-campaigns.png",
    "Painel - computador",
  ],
  [
    "organization",
    "event-dashboard-mobile-all-campaigns.png",
    "Painel - celular",
  ],
  ["access", "password-required-desktop.png", "Acesso com senha"],
  ["access", "password-signup-mobile.png", "Cadastro com senha"],
  ["access", "invitation-links-mobile.png", "Links de convite"],
  ["profile", "profile-desktop.png", "Perfil - computador"],
  ["profile", "profile-mobile.png", "Perfil - celular"],
  ["members", "members-desktop.png", "Membros - computador"],
  ["members", "members-mobile.png", "Membros - celular"],
  ["functions", "organization-functions-desktop.png", "Funcoes - computador"],
  ["functions", "organization-functions-mobile.png", "Funcoes - celular"],
  ["forms", "ficha-editor-celular.png", "Editor de ficha"],
  ["forms", "servos-ficha-celular.png", "Ficha de servos"],
  ["forms", "ficha-layout-sem-foto.png", "Ficha sem foto visivel"],
  ["imports", "event-import-desktop-mapping.png", "Mapeamento - computador"],
  ["imports", "event-import-mobile-mapping.png", "Mapeamento - celular"],
  ["imports", "event-import-mobile-review.png", "Conferencia de pessoas"],
  ["imports", "event-import-mobile-result.png", "Resultado"],
  ["messages", "event-messages-layout-desktop.png", "Modelo - computador"],
  ["messages", "event-messages-layout-mobile.png", "Modelo - celular"],
  ["health", "health-desktop.png", "Saude - computador"],
  ["health", "health-mobile.png", "Saude - celular"],
  [
    "admin",
    "registration-corrections-desktop-editing.png",
    "Modal: editar ficha",
  ],
  ["admin", "registration-corrections-mobile-editing.png", "Modal no celular"],
  [
    "admin",
    "registration-corrections-mobile-conflict.png",
    "Modal: conflito e rascunho",
  ],
  ["registrations", "review-registrations-desktop.png", "Lista protegida"],
  ["registrations", "review-desktop-cards-3-columns.png", "Grid protegido"],
  [
    "registrations",
    "review-registrations-mobile-320.png",
    "Inscricoes em 320px",
  ],
  ["registrations", "review-registrations-mobile.png", "Inscricoes em 390px"],
].map(([module, file, title]) => ({ module, file, title }));
const sources = [
  [
    "reflow",
    "W3C - Reflow",
    "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html",
    "Revisar conteudo e operacao em 320 CSS px, observando as excecoes aplicaveis.",
  ],
  [
    "contrast",
    "W3C - Contraste minimo",
    "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
    "Texto normal requer pelo menos 4,5:1; texto grande e controles inativos tem criterios proprios.",
  ],
  [
    "notifications",
    "W3C - Notificacoes de formularios",
    "https://www.w3.org/WAI/tutorials/forms/notifications/",
    "Fornecer resultado claro e erros relacionados ao campo correspondente.",
  ],
  [
    "errors",
    "GOV.UK - Error summary",
    "https://design-system.service.gov.uk/components/error-summary/",
    "Referencia de resumo de erros, foco e links para as respostas com problema.",
  ],
  [
    "questions",
    "GOV.UK - Question pages",
    "https://design-system.service.gov.uk/patterns/question-pages/",
    "Referencia para organizar perguntas e a carga dos formularios.",
  ],
].map(([id, title, url, note]) => ({ id, title, url, note }));
const definitions = [
  [
    "UX-01",
    "messages",
    "alta",
    "reproduzido",
    "Trocar o evento descarta a mensagem nao salva",
    "Editar o modelo de mensagem, escolher outro evento e voltar, sem salvar.",
    "A coordenacao reproduziu o descarte em PC e celular; trocar a key desmonta MessageEditor.",
    "Confirmar a troca e oferecer continuar editando ou descartar, preservando o rascunho durante a decisao.",
    "Baseline: problema reproduzido pela coordenacao. Nova correcao/regressao: pendente.",
    "apps/web/src/pages/EventMessages.tsx:42-68",
    ["notifications"],
  ],
  [
    "UX-02",
    "admin",
    "media",
    "codigo",
    "Texto secundario com contraste baixo para texto normal",
    "Comparar --muted #798396 em branco e #f8f9fc.",
    "Coordenacao informou leitura e calculo: 3,82:1 e 3,63:1. Isso nao reprova automaticamente texto grande ou controle inativo.",
    "Ajustar o token somente no escopo autorizado e conferir os estados reais; preservar lista/grid e botoes de inscricoes.",
    "Cor identificada. Auditoria completa de estados e tecnologia assistiva: pendente.",
    "apps/web/src/styles.css - token --muted; linha a confirmar",
    ["contrast"],
  ],
  [
    "UX-03",
    "events",
    "media",
    "codigo",
    "Menu compacto restrito a poucas telas",
    "Abrir Eventos e Mensagens no celular e comparar sua navegacao com painel e Inscricoes.",
    "Coordenacao identificou condicao apenas no index e inscricoes. Capturas mostram navegacao horizontal cortada nas demais telas.",
    "Estender o padrao compacto nas telas administrativas autorizadas sem redesenhar as inscricoes protegidas.",
    "Baseline visual disponivel. Nova implementacao e regressao: pendentes.",
    "apps/web/src/pages/Organization.tsx:109-169",
    ["reflow"],
  ],
  [
    "UX-04",
    "admin",
    "media",
    "codigo",
    "Field nao associa ajuda e erro automaticamente",
    "Inspecionar Field e a descricao acessivel dos controles com hint/error.",
    "Coordenacao confirmou ausencia de aria-describedby automatico. Consumidores podem ter associacoes proprias.",
    "Usar IDs estaveis e associar ajuda/erro sem duplicar labels; verificar cada consumidor.",
    "Componente identificado; inventario por campo e leitor de tela pendentes.",
    "apps/web/src/components/ui.tsx - Field; linha a confirmar",
    ["notifications", "errors"],
  ],
  [
    "UX-05",
    "profile",
    "media",
    "codigo",
    "Telefone e cidade do Perfil divergem dos controles compartilhados",
    "Comparar telefone/cidade do Perfil com os controles usados nas fichas.",
    "Coordenacao identificou controles brutos. Divergencia visual nao prova erro de persistencia.",
    "Reutilizar apresentacao/busca somente quando as regras forem equivalentes; preservar valores legados e validacoes distintas.",
    "Leitura informada; capturas especificas e regressao pendentes.",
    "apps/web/src/pages/Profile.tsx - controles de telefone/cidade; linha a confirmar",
    ["questions"],
  ],
  [
    "UX-06",
    "admin",
    "baixa",
    "sugestao",
    "Diferenciar avisos de erro, sucesso e informacao",
    "Comparar as variantes de Notice.",
    "Coordenacao informou AlertCircle em todas as variantes; oportunidade visual, nao falha funcional demonstrada.",
    "Combinar icone e texto coerentes mantendo os roles e anuncios apropriados.",
    "Sugestao; validacao visual e de anuncio pendente.",
    "apps/web/src/components/ui.tsx - Notice; linha a confirmar",
    ["notifications"],
  ],
  [
    "UX-07",
    "events",
    "baixa",
    "sugestao",
    "Simplificar a hierarquia do formulario de evento",
    "Revisar o formulario preenchido em PC e celular.",
    "Capturas mostram blocos aninhados e formulario longo; o ensaio em memoria e apenas uma proposta.",
    "Organizar secoes e espacamento preservando todos os dados, periodos, opcoes e regras.",
    "Antes disponivel; proposta separada da implementacao. Comparacao equivalente pendente.",
    "",
    ["questions", "reflow"],
  ],
  [
    "UX-08",
    "admin",
    "baixa",
    "sugestao",
    "Consolidar regras visuais repetidas em etapas pequenas",
    "Mapear seletores antes de extrair tokens/componentes.",
    "Coordenacao informou styles.css com cerca de 3.960 linhas e overrides repetidos. Tamanho isolado nao e defeito de UX.",
    "Consolidar apenas regras equivalentes, com regressao por modulo; evitar CSS global que afete a area protegida.",
    "Sugestao de manutencao; inventario detalhado pendente.",
    "apps/web/src/styles.css - regras e linhas a mapear",
    [],
  ],
  [
    "UX-09",
    "health",
    "media",
    "pendente",
    "Completar revisao especifica de Saude",
    "Cobrir usuario autorizado, sem acesso, vazio, erro, carregamento e teclado com fixtures ficticias.",
    "O catalogo inicial nao possui capturas especificas de Saude.",
    "Produzir evidencias antes de declarar problema confirmado; preservar separacao de dados sensiveis.",
    "Revisao especifica pendente; nao considerar todos os estados auditados.",
    "",
    ["notifications", "reflow"],
  ],
  [
    "UX-10",
    "members",
    "media",
    "pendente",
    "Separar acesso temporario do baseline publicado",
    "Comparar eb9f157 com o trabalho pendente de acesso temporario.",
    "Coordenacao informou alteracoes pendentes em Organization, Members, NewPassword e componentes relacionados.",
    "Validar funcionalidade nova e papeis separadamente; nao apresentar alteracao pendente como ja publicada.",
    "Nova funcionalidade e seus estados: validacao propria pendente.",
    "",
    [],
  ],
];
definitions.push([
  "UX-11",
  "registrations",
  "media",
  "reproduzido",
  "WebKit: ordenação e demais controles têm alturas diferentes",
  "No WebKit, abrir a lista de inscrições e comparar a ordenação com busca e botões da barra.",
  "A coordenação confirmou no baseline e na árvore atual: select de ordenação com 53px, busca/botões com 46px e desalinhamento vertical de 7px. Não é regressão nova.",
  "Manter nesta entrega por restrição explícita de escopo da lista/grid e seus botões. Qualquer correção desse conjunto exige revisão e autorização próprias.",
  "Exceção preexistente no WebKit; sete comparações Chrome da área protegida iguais. Não afirmar aprovação irrestrita do WebKit.",
  ".local/ui-ux-webkit-baseline-toolbar.json; .local/ui-ux-webkit-review-current/results.json",
  ["reflow"],
]);
let findings = definitions.map(
  ([
    id,
    module,
    severity,
    classification,
    title,
    reproduction,
    evidence,
    proposal,
    testStatus,
    code,
    sourceIds,
  ]) => ({
    id,
    module,
    severity,
    classification,
    title,
    reproduction,
    evidence,
    proposal,
    testStatus,
    code,
    sourceIds,
  }),
);
const deferredFinding = findings.find((item) => item.id === "UX-11");
if (deferredFinding) deferredFinding.implementationStatus = "protectedDeferred";
if (opts.findings) {
  const input = JSON.parse(
    await readFile(resolve(root, opts.findings), "utf8"),
  );
  findings = Array.isArray(input) ? input : input.findings;
  if (!Array.isArray(findings))
    throw new Error("--findings requer array ou {findings:[]}.");
}
const classes = {
  reproduzido: "Reproduzido",
  codigo: "Codigo",
  sugestao: "Sugestao",
  pendente: "Pendente",
};
const priorities = {
  alta: "Alta",
  media: "Media",
  baixa: "Baixa",
  informativa: "Informativa",
};
for (const finding of findings)
  if (
    !modules.some((item) => item.id === finding.module) ||
    !classes[finding.classification] ||
    !priorities[finding.severity]
  )
    throw new Error("Classificacao/modulo/prioridade invalidos: " + finding.id);
const manifest = opts["capture-manifest"]
  ? JSON.parse(await readFile(resolve(root, opts["capture-manifest"]), "utf8"))
  : {};
await mkdir(join(out, "assets"), { recursive: true });
const manifestCaptures = manifest.captures || manifest.comparisons || manifest;
const implementationLabel =
  opts["implementation-label"] ||
  manifest.implementation?.label ||
  implementationSha ||
  null;
const digestInput =
  opts["implementation-digest"] ||
  manifest.implementation?.digest ||
  manifest.implementation?.buildSha256 ||
  manifest.implementation?.sha256 ||
  manifest.buildSha256 ||
  null;
const rawDigest =
  typeof digestInput === "object" && digestInput
    ? digestInput.value
    : digestInput;
const implementationDigest = rawDigest
  ? String(rawDigest)
      .replace(/^sha256:/i, "")
      .toLowerCase()
  : null;
if (implementationDigest && !/^[a-f0-9]{64}$/.test(implementationDigest))
  throw new Error(
    "O digest de implementacao precisa ser SHA-256 com 64 caracteres hexadecimais.",
  );
const implementationIdentity =
  implementationSha ||
  (implementationLabel && implementationDigest
    ? implementationLabel + " · SHA-256 " + implementationDigest
    : null);
const captures = [];
const afterAliases = {
  "audit-before-event-desktop.png": "evento-formulario-desktop.png",
  "audit-before-event-celular.png": "evento-formulario-celular.png",
};
for (const [index, entry] of catalog.entries()) {
  const metadata =
    manifestCaptures[entry.file] ||
    manifestCaptures[afterAliases[entry.file]] ||
    {};
  let previous = join(beforeDir, entry.file);
  for (const name of [
    metadata.beforeFile,
    entry.file,
    afterAliases[entry.file],
  ].filter(Boolean)) {
    if (
      basename(name) === name &&
      !experimental(name) &&
      (await exists(join(beforeDir, name)))
    ) {
      previous = join(beforeDir, name);
      break;
    }
  }
  const before = (await exists(previous))
    ? { file: previous, ...(await png(previous)) }
    : null;
  let after = null;
  for (const name of [
    ...new Set(
      [
        metadata.afterFile,
        afterAliases[entry.file],
        entry.file.replace(/^audit-before-/, "audit-after-"),
        entry.file,
      ].filter(Boolean),
    ),
  ]) {
    if (basename(name) !== name || experimental(name)) continue;
    const path = join(afterDir, name);
    if (await exists(path)) {
      after = { file: path, ...(await png(path)) };
      break;
    }
  }
  for (const [kind, value] of [
    ["before", before],
    ["after", after],
  ])
    if (value) {
      value.asset =
        "assets/" + (index + 1) + "-" + kind + "-" + basename(value.file);
      await copyFile(value.file, join(out, value.asset));
    }
  const sameWidth = Boolean(before && after && before.width === after.width);
  const sameFixture = metadata.sameFixture === true;
  const implemented = Boolean(
    after && implementationIdentity && metadata.kind !== "experiment",
  );
  const status = !after
    ? "Depois pendente"
    : !implemented
      ? "Origem da implementacao pendente"
      : !sameWidth
        ? "Larguras diferentes: comparar novamente"
        : !sameFixture
          ? "Mesma fixture ainda nao confirmada"
          : "Comparacao documentada";
  captures.push({
    ...entry,
    before,
    after,
    sameWidth,
    sameFixture,
    implemented,
    status,
  });
}
const experiments = [];
for (const name of [
  "audit-proposed-event-desktop.png",
  "audit-proposed-event-celular.png",
  "audit-proposed-event-celular-menu-open.png",
]) {
  const file = join(beforeDir, name);
  if (await exists(file)) {
    const asset = "assets/experiment-" + name;
    await copyFile(file, join(out, asset));
    experiments.push({ name, asset, ...(await png(file)) });
  }
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baseline,
  implementationSha,
  implementationLabel,
  implementationDigest,
  implementationIdentity,
  modules,
  findings,
  captures,
  experiments,
  sources,
  baselineTests:
    "Coordenacao informou 11 percursos com mocks aprovados: painel, servos, eventos, senha, importacao, mensagens, inscricoes protegidas, responsavel, correcoes, convite e links de convite.",
  implementationTests:
    "Pendente de resultados da nova versao. Captura apos nao comprova teste funcional.",
  limits:
    "Nao cobre todos os estados ou navegadores. Safari/iPhone reais, leitor de tela e revisao especifica de Saude pendentes.",
};

if (opts.validation) {
  const validation = JSON.parse(
    await readFile(resolve(root, opts.validation), "utf8"),
  );
  for (const key of ["baselineTests", "implementationTests", "limits"])
    if (typeof validation[key] === "string") report[key] = validation[key];
  for (const [id, update] of Object.entries(validation.findings || {})) {
    const item = findings.find((finding) => finding.id === id);
    if (!item || !update || typeof update !== "object") continue;
    for (const key of [
      "implementationStatus",
      "implementationEvidence",
      "testStatus",
    ])
      if (typeof update[key] === "string") item[key] = update[key];
  }
}
const tag = (text, kind = "") =>
  '<span class="tag ' + esc(kind) + '">' + esc(text) + "</span>";
function image(value, label) {
  if (!value)
    return (
      '<div class="missing"><strong>' +
      esc(label) +
      "</strong><p>Captura indisponivel. Nao foi substituida por proposta ou ensaio.</p></div>"
    );
  return (
    "<figure><figcaption>" +
    esc(label) +
    " · " +
    value.width +
    " x " +
    value.height +
    ' px</figcaption><a href="' +
    esc(value.asset) +
    '" target="_blank" rel="noopener"><img loading="lazy" src="' +
    esc(value.asset) +
    '" alt="' +
    esc(label) +
    '"></a><small>Abrir imagem completa</small></figure>'
  );
}
function findingHtml(item) {
  const rows = [
    ["Como verificar", item.reproduction],
    ["Evidencia e limite", item.evidence],
    [
      item.implementationStatus === "localImplemented"
        ? "Mudanca local"
        : "Proposta minima",
      item.proposal,
    ],
    ...(item.implementationEvidence
      ? [["Evidencia da implementacao", item.implementationEvidence]]
      : []),
    ["Estado de teste", item.testStatus],
  ];
  return (
    '<article class="finding" data-classification="' +
    esc(item.classification) +
    '" data-priority="' +
    esc(item.severity) +
    '" data-search="' +
    esc(JSON.stringify(item).toLowerCase()) +
    '"><div class="tags">' +
    tag(item.id) +
    tag(classes[item.classification], item.classification) +
    tag("Prioridade " + priorities[item.severity], item.severity) +
    (item.implementationStatus === "protectedDeferred"
      ? tag("Mantido por restricao de escopo", "deferred")
      : "") +
    (item.implementationStatus === "localImplemented"
      ? tag("Implementado na arvore local", "implemented")
      : "") +
    "</div><h3>" +
    esc(item.title) +
    "</h3><dl>" +
    rows
      .map(
        ([title, content]) =>
          "<dt>" + title + "</dt><dd>" + esc(content) + "</dd>",
      )
      .join("") +
    '</dl><p class="code">' +
    esc(
      typeof item.code === "string"
        ? item.code
        : JSON.stringify(item.code || []),
    ) +
    '</p><p class="references">' +
    (item.sourceIds || [])
      .map((id) => {
        const source = sources.find((entry) => entry.id === id);
        return source
          ? '<a href="' +
              esc(source.url) +
              '" target="_blank" rel="noopener noreferrer">' +
              esc(source.title) +
              "</a>"
          : "";
      })
      .join(" · ") +
    "</p></article>"
  );
}
function comparison(item) {
  return (
    '<details class="comparison"><summary>' +
    esc(item.title) +
    '<span class="comparison-status">' +
    esc(item.status) +
    '</span></summary><p class="muted">Fixture/estado: ' +
    (item.sameFixture
      ? "confirmados no manifesto"
      : "equivalencia ainda nao confirmada no manifesto") +
    '. Igualdade de largura e verificada pelo PNG; altura pode mudar com o layout.</p><div class="image-grid">' +
    image(item.before, "Antes - " + baseline) +
    image(
      item.after,
      item.implemented
        ? "Depois - " + implementationIdentity
        : "Depois - validacao pendente",
    ) +
    "</div>" +
    (item.before && item.after && !item.sameWidth
      ? '<p class="warning">Larguras diferentes: nao usar esta dupla como comparacao equivalente.</p>'
      : "") +
    "</details>"
  );
}
function moduleHtml(module) {
  const items = findings.filter((item) => item.module === module.id);
  const screens = captures.filter((item) => item.module === module.id);
  return (
    '<section id="' +
    module.id +
    '" class="module"><header><div><p class="eyebrow">MODULO</p><h2>' +
    esc(module.title) +
    "</h2></div>" +
    tag(
      module.protected ? "Contrato protegido" : items.length + " achado(s)",
      module.protected ? "protected" : "",
    ) +
    "</header>" +
    (module.protected
      ? '<div class="protection"><strong>Preservar exatamente a apresentacao dos dados e os botoes da lista e grid.</strong><p>Nao redesenhar conteudo, ordem das acoes, dados, filtros, permissoes ou comportamento. O modal da ficha pode evoluir em escopo proprio. Conferir regressao com as mesmas fixtures em PC, 320, 390 e 430px.</p></div>'
      : "") +
    '<div class="findings">' +
    (items.length
      ? items.map(findingHtml).join("")
      : '<p class="muted">Sem achado confirmado neste modulo. Isso nao significa que todos os estados foram auditados.</p>') +
    '</div><h3>Evidencias e comparacao</h3><p class="muted">' +
    screens.filter((item) => item.before).length +
    " captura(s) anterior(es) localizada(s). A falta de imagem de depois continua pendente.</p>" +
    screens.map(comparison).join("") +
    (module.id === "events" && experiments.length
      ? '<details class="experiment"><summary>Ensaio em memoria - proposta, nao implementacao</summary><p>Os arquivos proposed estao separados: nao contam como depois e nao comprovam ganho de uso.</p><div class="image-grid">' +
        experiments.map((item) => image(item, item.name)).join("") +
        "</div></details>"
      : "") +
    "</section>"
  );
}
const css = [
  ".mobile-nav{display:none}:root{--ink:#192b43;--muted:#56647b;--line:#dce2eb;--paper:#f4f6fa;--accent:#6551c9}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}a{color:#4e3cae}a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #aa6d0d;outline-offset:3px}.skip{position:absolute;top:-80px;left:8px;background:#fff;padding:12px;z-index:5}.skip:focus{top:8px}.shell{display:grid;grid-template-columns:230px minmax(0,1fr);max-width:1580px;margin:auto}aside{position:sticky;top:0;height:100vh;background:white;border-right:1px solid var(--line);padding:25px 18px;overflow:auto}.brand{font-size:23px;font-weight:750;margin:0}.aside-note{font-size:12px;color:var(--muted)}nav a{display:block;padding:8px 9px;text-decoration:none;color:var(--ink);border-radius:7px;margin:3px 0}nav a:hover{background:#efedfc}main{padding:32px;min-width:0}.hero,.overview,.module,.sources{padding:25px;background:#fff;border:1px solid var(--line);border-radius:15px;margin-bottom:23px}.hero h1{font-size:33px;line-height:1.16;max-width:820px;margin:10px 0 17px}.eyebrow{font-size:11px;color:var(--accent);font-weight:750;letter-spacing:.12em;margin:0}.lede{max-width:850px;color:var(--muted)}.tags{display:flex;flex-wrap:wrap;gap:7px}.tag{max-width:100%;overflow-wrap:anywhere;font-size:11px;font-weight:650;background:#edf0f6;padding:4px 9px;border-radius:90px}.tag.reproduzido,.tag.alta{background:#fbe9ed;color:#89273d}.tag.codigo,.tag.media{background:#fff1d9;color:#77500d}.tag.sugestao{background:#efebfc;color:#5742ac}.tag.pendente{color:#53627a}.tag.deferred{background:#fff1d9;color:#77500d}.tag.implemented{background:#e5f4ed;color:#1b6149}.tag.protected{background:#e5f4ed;color:#1b6149}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:22px}.metric{padding:14px;border-top:3px solid var(--accent);background:#f6f7fb;border-radius:8px}.metric strong{display:block;font-size:27px}.metric span{font-size:12px;color:var(--muted)}.test-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.warning,.protection{border:1px solid #e5d2a3;background:#fff7e8;padding:15px;border-radius:9px}.protection{background:#eef7f2;border-color:#bdd8c9}.protection p{margin-bottom:0}.filters{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.filters label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--muted)}input,select{font:inherit;color:var(--ink);padding:10px;border:1px solid var(--line);border-radius:7px;background:#fff;max-width:100%}.module{scroll-margin-top:15px}.module>header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.module h2{font-size:24px;margin:4px 0 18px}.finding{border:1px solid var(--line);padding:20px;border-radius:10px;margin:18px 0}h3{font-size:18px;line-height:1.35}.finding h3{margin:14px 0}dl{display:grid;grid-template-columns:135px minmax(0,1fr);gap:10px 15px;font-size:13px}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}.muted,.code,.references{font-size:12px;color:var(--muted)}.code{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.comparison,.experiment{padding:14px;margin:12px 0;border:1px solid var(--line);border-radius:9px}summary{font-size:14px;cursor:pointer;font-weight:650}.comparison-status{display:block;font-size:11px;color:var(--muted);font-weight:400;margin-top:4px}.image-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.experiment{background:#faf7ef}figure{margin:0;min-width:0}figcaption{overflow-wrap:anywhere;font-size:12px;font-weight:650;margin-bottom:8px}figure a{display:block;max-height:460px;overflow:auto;border:1px solid var(--line);border-radius:7px;background:#eff2f8}figure img{width:100%;height:auto;display:block}figure small{font-size:11px;color:var(--muted)}.missing{min-height:150px;padding:22px;border:1px dashed #bfc9d9;border-radius:8px;color:var(--muted);font-size:13px;display:flex;flex-direction:column;justify-content:center}.sources li{margin:14px 0}.sources small{display:block;color:var(--muted)}footer{padding-bottom:25px;font-size:12px;color:var(--muted)}[hidden]{display:none!important}@media(max-width:1050px){.shell{grid-template-columns:190px minmax(0,1fr)}main{padding:20px}.hero,.overview,.module,.sources{padding:20px}.test-grid{grid-template-columns:1fr}}@media(max-width:760px){.shell{display:block}aside{position:relative;height:auto;padding:14px;border-right:0;border-bottom:1px solid var(--line)}nav{display:flex;overflow:auto;gap:4px}nav a{white-space:nowrap;font-size:12px;padding:6px}.aside-note{margin:4px 0 8px}main{padding:12px}.hero,.overview,.module,.sources{padding:17px;border-radius:11px;margin-bottom:16px}.hero h1{font-size:27px}.metrics{grid-template-columns:1fr}.metric{display:flex;gap:12px;align-items:center}.metric strong{font-size:23px}.module>header{display:block}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:10px}.image-grid{grid-template-columns:1fr}.filters label{width:100%}.filters input,.filters select{width:100%}.finding{padding:14px}.comparison{padding:10px}}@media(max-width:760px){aside nav{display:none}.mobile-nav{display:flex;flex-direction:column;gap:4px;font-size:12px}.mobile-nav select{width:100%}}@media print{aside,.filters,.skip{display:none}.shell{display:block}main{padding:0}.hero,.module,.overview,.sources{break-inside:avoid}a{color:inherit}}",
].join("");
const foundBefore = captures.filter((item) => item.before).length,
  foundAfter = captures.filter((item) => item.after).length;
const verified = captures.filter(
  (item) => item.sameWidth && item.sameFixture && item.implemented,
).length;
const html =
  "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src 'self' data: file:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\"><title>Auditoria e padronizacao UI/UX</title><style>" +
  css +
  '</style></head><body><a class="skip" href="#conteudo">Ir para o conteudo</a><div class="shell"><aside><p class="brand">UI / UX</p><p class="aside-note">Relatorio local - baseline ' +
  esc(baseline) +
  '</p><label class="mobile-nav">Ir para modulo<select aria-label="Ir para modulo" onchange="location.hash=this.value"><option value="inicio">Visao geral</option><option value="access">Acesso e convites</option><option value="profile">Perfil</option><option value="events">Eventos</option><option value="organization">Organizacao e painel</option><option value="members">Membros</option><option value="functions">Funcoes</option><option value="forms">Fichas e formularios</option><option value="imports">Importacao</option><option value="messages">Mensagens do evento</option><option value="health">Saude</option><option value="admin">Controles e modais</option><option value="registrations">Inscricoes: contrato protegido</option><option value="fontes">Referencias oficiais</option></select></label><nav aria-label="Modulos do relatorio"><a href="#inicio">Visao geral</a>' +
  modules
    .map(
      (module) => '<a href="#' + module.id + '">' + esc(module.title) + "</a>",
    )
    .join("") +
  '<a href="#fontes">Referencias oficiais</a></nav></aside><main id="conteudo"><header class="hero" id="inicio"><p class="eyebrow">AUDITORIA LOCAL - FIXTURES FICTICIAS</p><h1>Uma interface mais consistente, com evidencias e limites claros.</h1><p class="lede">Problemas reproduzidos, observacoes de codigo, sugestoes e revisoes pendentes ficam separados. Proposta visual nao e implementacao. Imagem de depois nao comprova teste funcional.</p><div class="tags">' +
  tag("Baseline " + baseline) +
  tag(
    implementationIdentity
      ? "Implementacao " + implementationIdentity
      : "Implementacao pendente",
    "pendente",
  ) +
  tag("Sem ativos externos") +
  '</div><div class="metrics"><div class="metric"><strong>' +
  findings.length +
  '</strong><span>achados classificados</span></div><div class="metric"><strong>' +
  foundBefore +
  '</strong><span>capturas anteriores disponiveis</span></div><div class="metric"><strong>' +
  verified +
  "</strong><span>comparacoes documentadas; " +
  foundAfter +
  ' imagens de depois recebidas</span></div></div></header><section class="overview"><h2>O que foi verificado</h2><div class="test-grid"><div><h3>Baseline</h3><p>' +
  esc(report.baselineTests) +
  "</p></div><div><h3>Nova versao</h3><p>" +
  esc(report.implementationTests) +
  '</p></div></div><p class="warning">' +
  esc(report.limits) +
  '</p><p>Dados de codigo e reproducao fornecidos pela coordenacao mantem sua origem explicita. Linhas nao confirmadas nao recebem numeros inventados. Acesso temporario pendente e separado do baseline publicado.</p></section><div class="filters" role="search" aria-label="Filtrar achados"><label>Buscar achado<input id="query" type="search" placeholder="Texto, codigo ou proposta"></label><label>Classificacao<select id="classification"><option value="">Todas</option>' +
  Object.entries(classes)
    .map(([id, title]) => '<option value="' + id + '">' + title + "</option>")
    .join("") +
  '</select></label><label>Prioridade<select id="priority"><option value="">Todas</option>' +
  Object.entries(priorities)
    .map(([id, title]) => '<option value="' + id + '">' + title + "</option>")
    .join("") +
  '</select></label></div><p id="filter-status" role="status" class="muted"></p>' +
  modules.map(moduleHtml).join("") +
  '<section id="fontes" class="sources"><h2>Referencias oficiais</h2><p>Consultadas para orientar a revisao. Os criterios exigem avaliacao no contexto real; este documento nao certifica acessibilidade.</p><ul>' +
  sources
    .map(
      (source) =>
        '<li><a href="' +
        esc(source.url) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(source.title) +
        "</a><small>" +
        esc(source.note) +
        "</small></li>",
    )
    .join("") +
  "</ul></section><footer>Gerado em " +
  esc(report.generatedAt) +
  '. Imagens e dependencias locais; nenhum analytics, biblioteca, fonte ou captura externa. <a href="audit-data.json">Metadados e evidencias em JSON</a>.</footer></main></div><script>const q=document.getElementById("query"),c=document.getElementById("classification"),p=document.getElementById("priority");function filter(){let count=0;document.querySelectorAll(".finding").forEach(function(item){const show=(!c.value||item.dataset.classification===c.value)&&(!p.value||item.dataset.priority===p.value)&&(!q.value||item.dataset.search.includes(q.value.toLowerCase()));item.hidden=!show;if(show)count++});document.getElementById("filter-status").textContent=count+" achado(s) visivel(is). As evidencias continuam disponiveis."}q.addEventListener("input",filter);c.addEventListener("change",filter);p.addEventListener("change",filter);filter();</script></body></html>';
await writeFile(join(out, "index.html"), html, "utf8");
await writeFile(
  join(out, "audit-data.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
await writeFile(
  join(out, "README.txt"),
  "Abra index.html no navegador; nao ha servidor ou dependencia externa.\nAntes: " +
    foundBefore +
    "\nDepois recebido: " +
    foundAfter +
    "\nComparacoes documentadas: " +
    verified +
    "\nConsulte docs/UI_UX_PADRONIZACAO.md para atualizar o relatorio.\n",
  "utf8",
);
console.log(
  JSON.stringify(
    {
      report: join(out, "index.html"),
      findings: findings.length,
      before: foundBefore,
      after: foundAfter,
      verifiedComparisons: verified,
      missingBefore: captures
        .filter((item) => !item.before)
        .map((item) => item.file),
    },
    null,
    2,
  ),
);
