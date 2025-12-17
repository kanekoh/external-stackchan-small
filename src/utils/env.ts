export type Env = {
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_APP_TOKEN: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL_FAST: string;
  OPENAI_CONVERSATION_ID?: string;
  MQTT_URL: string;
  MQTT_USERNAME?: string;
  MQTT_PASSWORD?: string;
  ALLOWED_SLACK_USER_IDS: string[];
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  STACKCHAN_CMD_TOPIC: string;
  STACKCHAN_ACK_TOPIC: string;
  STACKCHAN_STATE_TOPIC: string;
};

export function loadEnv(): Env {
  const required = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
    "SLACK_APP_TOKEN",
    "OPENAI_API_KEY",
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env: ${key}`);
    }
  }

  return {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET!,
    SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    OPENAI_MODEL_FAST: process.env.OPENAI_MODEL_FAST || "gpt-4o-mini",
    OPENAI_CONVERSATION_ID: process.env.OPENAI_CONVERSATION_ID,
    MQTT_URL: process.env.MQTT_URL || "mqtt://localhost:1883",
    MQTT_USERNAME: process.env.MQTT_USERNAME,
    MQTT_PASSWORD: process.env.MQTT_PASSWORD,
    ALLOWED_SLACK_USER_IDS: (process.env.ALLOWED_SLACK_USER_IDS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    LOG_LEVEL: (process.env.LOG_LEVEL as Env["LOG_LEVEL"]) || "info",
    STACKCHAN_CMD_TOPIC: process.env.STACKCHAN_CMD_TOPIC || "stackchan/cmd",
    STACKCHAN_ACK_TOPIC: process.env.STACKCHAN_ACK_TOPIC || "stackchan/ack",
    STACKCHAN_STATE_TOPIC: process.env.STACKCHAN_STATE_TOPIC || "stackchan/state",
  };
}
