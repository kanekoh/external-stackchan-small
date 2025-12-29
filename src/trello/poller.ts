import { v4 as uuidv4 } from "uuid";
import { Env } from "../utils/env";
import { Logger } from "../utils/logger";
import { MqttClient } from "../mqtt/client";
import { LlmClient } from "../llm/client";

type TrelloCard = {
  id: string;
  name: string;
  due: string | null;
  url: string;
  dueComplete: boolean;
  idList?: string;
};

export class TrelloPoller {
  private env: Env;
  private logger: Logger;
  private mqtt: MqttClient;
  private timer: NodeJS.Timeout | null = null;
  private llm: LlmClient;

  constructor(env: Env, logger: Logger, mqtt: MqttClient, llm: LlmClient) {
    this.env = env;
    this.logger = logger;
    this.mqtt = mqtt;
    this.llm = llm;
  }

  start() {
    if (!this.env.TRELLO_KEY || !this.env.TRELLO_TOKEN || !this.env.TRELLO_BOARD_ID) {
      this.logger.info("Trello poller disabled (missing TRELLO_KEY/TRELLO_TOKEN/TRELLO_BOARD_ID)");
      return;
    }
    const interval = Math.max(60000, this.env.TRELLO_POLL_INTERVAL_MS || 300000);
    this.logger.info("Starting Trello poller", {
      intervalMs: interval,
      dueSoonMinutes: this.env.TRELLO_DUE_SOON_MINUTES,
      boardId: this.env.TRELLO_BOARD_ID,
      topic: this.env.TRELLO_NOTIFY_TOPIC,
    });
    // Run immediately then on interval
    this.poll().catch((err) => this.logger.error("Trello poll failed", { message: String(err) }));
    this.timer = setInterval(() => {
      this.poll().catch((err) => this.logger.error("Trello poll failed", { message: String(err) }));
    }, interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info("Trello poller stopped");
    }
  }

  private async poll() {
    const url = new URL(`https://api.trello.com/1/boards/${this.env.TRELLO_BOARD_ID}/cards`);
    url.searchParams.set("fields", "name,due,url,dueComplete,idList");
    url.searchParams.set("key", this.env.TRELLO_KEY!);
    url.searchParams.set("token", this.env.TRELLO_TOKEN!);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Trello HTTP ${res.status}`);
    }
    const cards = (await res.json()) as TrelloCard[];
    const now = Date.now();
    const thresholdMs = (this.env.TRELLO_DUE_SOON_MINUTES || 120) * 60_000;

    const upcoming = cards
      .filter((c) => c.due && !c.dueComplete)
      .map((c) => {
        const dueMs = Date.parse(c.due as string);
        return {
          id: c.id,
          name: c.name,
          due: c.due,
          url: c.url,
          dueMs,
          dueInMinutes: Math.round((dueMs - now) / 60000),
          idList: c.idList,
        };
      })
      .filter((c) => c.dueMs >= now && c.dueMs - now <= thresholdMs)
      .sort((a, b) => a.dueMs - b.dueMs);

    this.logger.info("Trello poll result", {
      total: cards.length,
      upcoming: upcoming.length,
    });

    if (upcoming.length === 0) return;

    const payload: any = {
      type: "trello_due_soon",
      generatedAt: new Date().toISOString(),
      boardId: this.env.TRELLO_BOARD_ID,
      dueSoonMinutes: this.env.TRELLO_DUE_SOON_MINUTES,
      cards: upcoming,
    };

    let sayText: string | null = null;
    try {
      sayText = await this.llm.trelloDueSoonToSpeech(upcoming);
      payload.sayText = sayText;
    } catch (err) {
      this.logger.warn("Trello say text generation failed", { message: String(err) });
    }

    await this.mqtt.publish(this.env.TRELLO_NOTIFY_TOPIC, payload);

    if (sayText && this.env.TRELLO_SAY_VIA_CMD) {
      const cmd = { id: uuidv4(), type: "say", payload: { text: sayText } };
      await this.mqtt.publish(this.env.STACKCHAN_CMD_TOPIC, cmd);
      this.logger.info("Trello due soon sent to cmd topic", { id: cmd.id });
    }
  }
}
