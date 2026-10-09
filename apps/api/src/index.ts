import "dotenv/config";
import { createHostedApp } from "./core/hosted-app.js";
import { createTemporaryApp } from "./core/temporary-app.js";
import { runtimeSettings } from "./core/runtime.js";

const runtime = runtimeSettings();
let disconnect = async () => {};
async function createApplication() {
  if (runtime.TEMPORARY_SITE)
    return createTemporaryApp({ trustProxy: runtime.TRUST_PROXY });
  // Import business settings and dependencies only after leaving temporary mode.
  const { config } = await import("./config.js");
  const [{ createApp }, { database }] = await Promise.all([
    import("./app.js"),
    import("./core/database.js"),
  ]);
  disconnect = () => database.$disconnect();
  const api = createApp();
  return config.SERVE_WEB
    ? createHostedApp(api, {
        supabaseUrl: config.SUPABASE_URL,
        trustProxy: config.TRUST_PROXY,
      })
    : api;
}
// Hostinger loads the entry file through require(); its ESM graph must be synchronous.
async function start() {
  const application = await createApplication();
  const server = application.listen(runtime.PORT, runtime.HOST, () =>
    console.info(
      `${runtime.TEMPORARY_SITE ? "Página temporária" : "API"} disponível na porta ${runtime.PORT}.`,
    ),
  );
  async function shutdown() {
    server.close();
    await disconnect();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
start().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
