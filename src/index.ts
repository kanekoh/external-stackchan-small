import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./slack";
import { createLogger } from "./utils/logger";
import { loadEnv } from "./utils/env";
import { MqttClient } from "./mqtt/client";
import { LlmClient } from "./llm/client";

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const mqtt = new MqttClient(env, logger);
  const llm = new LlmClient(env, logger);
  const app = createApp(env, mqtt, llm, logger);

  // Start Slack Socket Mode
  await app.start();
  logger.info("Slack app started (Socket Mode)");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await app.stop();
    await mqtt.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
