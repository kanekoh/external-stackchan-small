import { App } from "@slack/bolt";
import { Env } from "../utils/env";
import { MqttClient } from "../mqtt/client";
import { LlmClient } from "../llm/client";
import { Logger } from "../utils/logger";
import { CommandRequest, Intent } from "../types";
import { buildCommandBlocks, buildDangerBlocks } from "./ui";

const COMMAND_KEYWORDS = [
  "say",
  "volume",
  "motion",
  "expression",
  "listen",
  "brightness",
  "status",
];
const QUERY_KEYWORDS = ["status", "state", "battery", "temperature", "明るさ", "温度", "バッテリー"];

function guessIntent(text: string): Intent {
  const lower = text.toLowerCase();
  if (QUERY_KEYWORDS.some((k) => lower.includes(k))) return "QUERY";
  if (COMMAND_KEYWORDS.some((k) => lower.includes(k))) return "COMMAND";
  return "CHAT";
}

function parseCommandText(text: string, userId: string): CommandRequest | null {
  const lower = text.toLowerCase();

  if (lower.startsWith("say ")) {
    const content = text.slice(4).trim();
    if (content.length === 0) return null;
    return { type: "say", payload: { text: content }, userId, originalText: text };
  }

  const volumeMatch = lower.match(/volume\s+(\d{1,3})/);
  if (volumeMatch) {
    const volume = Number(volumeMatch[1]);
    if (volume < 0 || volume > 100) return null;
    return { type: "volume", payload: { volume }, userId, originalText: text };
  }

  const motionMatch = lower.match(/motion\s+([a-z0-9_-]+)/);
  if (motionMatch) {
    return { type: "motion", payload: { motion: motionMatch[1] }, userId, originalText: text };
  }

  const expressionMatch = lower.match(/expression\s+([a-z0-9_-]+)/);
  if (expressionMatch) {
    return {
      type: "expression",
      payload: { expression: expressionMatch[1] },
      userId,
      originalText: text,
    };
  }

  const brightnessMatch = lower.match(/brightness\s+(\d{1,3})/);
  if (brightnessMatch) {
    const brightness = Number(brightnessMatch[1]);
    if (brightness < 0 || brightness > 100) return null;
    return { type: "brightness", payload: { brightness }, userId, originalText: text };
  }

  if (lower.includes("listen on")) {
    return { type: "listen", payload: { listen: true }, userId, originalText: text };
  }
  if (lower.includes("listen off")) {
    return { type: "listen", payload: { listen: false }, userId, originalText: text };
  }

  if (QUERY_KEYWORDS.some((k) => lower.includes(k))) {
    return { type: "status", payload: {}, userId, originalText: text };
  }

  return null;
}

function isDangerous(cmd: CommandRequest): boolean {
  if (cmd.type === "volume") {
    const vol = (cmd.payload as any).volume;
    if (typeof vol === "number" && vol > 80) return true;
  }
  if (cmd.type === "brightness") {
    const bright = (cmd.payload as any).brightness;
    if (typeof bright === "number" && bright > 80) return true;
  }
  return false;
}

export function registerRoutes(
  app: App,
  env: Env,
  mqtt: MqttClient,
  llm: LlmClient,
  logger: Logger
) {
  // Slash command
  app.command("/stack", async ({ command, ack, respond }) => {
    await ack();
    const userId = command.user_id;
    if (!env.ALLOWED_SLACK_USER_IDS.includes(userId)) {
      await respond("ごめんね、このコマンドは許可されたユーザーだけが使えるの。チャットやステータス確認ならいつでもどうぞ！");
      return;
    }

    const text = command.text.trim();
    if (!text) {
      await respond("使い方: /stack <say|volume|motion|expression|listen|brightness|status> ...");
      return;
    }

    const parsed = parseCommandText(text, userId);
    if (!parsed) {
      await respond("うまく読めなかったよ… `/stack say こんにちは` や `/stack volume 50` を試してみて！");
      return;
    }

    const dangerous = isDangerous(parsed);
    if (dangerous) {
      await respond({
        text: "少し強めの操作みたい。ほんとに実行していい？",
        blocks: buildDangerBlocks(parsed),
      });
      return;
    }

    await respond("がんばって送信するね…！");
    try {
      const ackMsg = await mqtt.sendCommand(parsed);
      await respond(`Ack: ${ackMsg.status}${ackMsg.message ? ` (${ackMsg.message})` : ""}`);
    } catch (err) {
      logger.error("Command failed", { message: String(err) });
      await respond("うまく送れなかったみたい…もう一度試してみてね。");
    }
  });

  // Interactive confirmations
  app.action("run_command_yes", async ({ ack, body, action, client }) => {
    await ack();
    const payload = (action as any).value as string;
    const cmd: CommandRequest = JSON.parse(payload);
    if (!env.ALLOWED_SLACK_USER_IDS.includes(cmd.userId)) {
      await client.chat.postMessage({
        channel: cmd.userId,
        text: "この操作は許可されていないみたい…チャットやステータス確認なら大歓迎だよ！",
      });
      return;
    }

    const dangerous = isDangerous(cmd);
    if (dangerous) {
      await client.chat.postMessage({
        channel: cmd.userId,
        text: "ちょっと強めの操作、了解だよ！スタックチャンに送るね…！",
      });
    } else {
      await client.chat.postMessage({
        channel: cmd.userId,
        text: "コマンド送信するね…！",
      });
    }

    try {
      const ackMsg = await mqtt.sendCommand(cmd);
      await client.chat.postMessage({
        channel: cmd.userId,
        text: `Ack: ${ackMsg.status}${ackMsg.message ? ` (${ackMsg.message})` : ""}`,
      });
    } catch (err) {
      logger.error("Command send failed", { message: String(err) });
      await client.chat.postMessage({ channel: cmd.userId, text: "送信に失敗しちゃった…ごめんね。" });
    }
  });

  app.action("run_command_no", async ({ ack, body, client }) => {
    await ack();
    await client.chat.postMessage({
      channel: body.user.id,
      text: "わかった、キャンセルしたよ！",
    });
  });

  // Messages (DMs and mentions)
  app.message(async ({ message, say, context }) => {
    // @ts-ignore message subtype check
    if (message.subtype === "bot_message") return;
    const text = (message as any).text || "";
    const channelType = (message as any).channel_type;
    const userId = (message as any).user;
    logger.debug("Slack message received", {
      text,
      channelType,
      userId,
      subtype: (message as any).subtype,
    });

    // Only respond to DMs and mentions
    if (channelType !== "im" && !text.includes(`<@${context.botUserId}>`)) return;

    const cleaned = text.replace(`<@${context.botUserId}>`, "").trim();
    const intent = guessIntent(cleaned);

    if (intent === "QUERY") {
      const state = mqtt.getFreshState();
      if (state) {
        await say(formatState(state));
        return;
      }
      await say("最新のステータスをお願いしてくるね…ちょっと待ってて！");
      try {
        const ackMsg = await mqtt.sendCommand({ type: "status", payload: {} });
        await say(`ステータスリクエストを送ったよ（${ackMsg.status}）。更新を待ってるね！`);
      } catch (err) {
        logger.error("Query failed", { message: String(err) });
        await say("ステータスを取れなかった…もう一度お願いしてもいい？");
      }
      return;
    }

    if (intent === "COMMAND") {
      const cmd = parseCommandText(cleaned, userId);
      if (!cmd) {
        await say("コマンドっぽいけど内容が分からなかったよ。`/stack` で試してみてね！");
        return;
      }
      if (!env.ALLOWED_SLACK_USER_IDS.includes(userId)) {
        await say("コマンドは許可ユーザーだけなんだ…でもチャットやステータスならいつでもOK！");
        return;
      }

      const dangerous = isDangerous(cmd);
      const blocks = dangerous ? buildDangerBlocks(cmd) : buildCommandBlocks(cmd);
      await say({
        text: "このコマンド、実行してもいい？",
        blocks,
      });
      return;
    }

    // Chat flow
    try {
      const reply = await llm.chat(userId, cleaned);
      await say(reply);
    } catch (err) {
      logger.error("Chat failed", { message: String(err) });
      await say("ちょっと考えがまとまらなかった…もう一回お願い！");
    }
  });
}

function formatState(state: Record<string, unknown>): string {
  const parts: string[] = [];
  if (state.battery !== undefined) parts.push(`バッテリー: ${state.battery}%`);
  if (state.temperature !== undefined) parts.push(`温度: ${state.temperature}°C`);
  if (state.listening !== undefined) parts.push(`リスニング: ${state.listening ? "ON" : "OFF"}`);
  if (state.lastMotion) parts.push(`モーション: ${state.lastMotion}`);
  if (state.lastExpression) parts.push(`表情: ${state.lastExpression}`);
  if (state.brightness !== undefined) parts.push(`明るさ: ${state.brightness}%`);
  return parts.length ? parts.join(" | ") : "最新ステータスがまだないみたい…！";
}
