import { App, LogLevel } from "@slack/bolt";
import { Env } from "../utils/env";
import { MqttClient } from "../mqtt/client";
import { LlmClient } from "../llm/client";
import { Logger } from "../utils/logger";
import { registerRoutes } from "./router";

export function createApp(
  env: Env,
  mqtt: MqttClient,
  llm: LlmClient,
  logger: Logger
) {
  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    appToken: env.SLACK_APP_TOKEN,
    socketMode: true,
    logLevel: LogLevel.ERROR, // keep Slack SDK quiet; we log ourselves
  });

  registerRoutes(app, env, mqtt, llm, logger);
  return {
    start: () => app.start(),
    stop: () => app.stop(),
  };
}
