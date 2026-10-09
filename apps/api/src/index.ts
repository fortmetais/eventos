import { createApp } from "./app.js";
import { config } from "./config.js";
import { database } from "./core/database.js";
const server = createApp().listen(config.PORT, config.HOST, () =>
  console.info(`API disponível na porta ${config.PORT}.`),
);
async function shutdown() {
  server.close();
  await database.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
