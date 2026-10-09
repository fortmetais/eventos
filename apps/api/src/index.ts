import { createApp } from "./app.js";
import { config } from "./config.js";
import { database } from "./core/database.js";
import { createHostedApp } from "./core/hosted-app.js";
const api = createApp();
const application = config.SERVE_WEB
  ? createHostedApp(api, {
      supabaseUrl: config.SUPABASE_URL,
      trustProxy: config.TRUST_PROXY,
    })
  : api;
const server = application.listen(config.PORT, config.HOST, () =>
  console.info(`API disponível na porta ${config.PORT}.`),
);
async function shutdown() {
  server.close();
  await database.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
