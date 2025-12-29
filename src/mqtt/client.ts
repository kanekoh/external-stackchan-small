import mqtt, { MqttClient as RawClient } from "mqtt";
import { v4 as uuidv4 } from "uuid";
import { Env } from "../utils/env";
import { AckMessage, CommandRequest, StackState } from "../types";
import { Logger } from "../utils/logger";

type Pending = {
  resolve: (ack: AckMessage) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export class MqttClient {
  private client: RawClient;
  private env: Env;
  private logger: Logger;
  private pending: Map<string, Pending> = new Map();
  private latestState: { state: StackState; ts: number } | null = null;

  constructor(env: Env, logger: Logger) {
    this.env = env;
    this.logger = logger;
    this.logger.info("MQTT connecting", {
      url: env.MQTT_URL,
      cmdTopic: env.STACKCHAN_CMD_TOPIC,
      ackTopic: env.STACKCHAN_ACK_TOPIC,
      stateTopic: env.STACKCHAN_STATE_TOPIC,
    });

    this.client = mqtt.connect(env.MQTT_URL, {
      username: env.MQTT_USERNAME,
      password: env.MQTT_PASSWORD,
      reconnectPeriod: 2000,
    });

    this.client.on("connect", () => {
      this.logger.info("MQTT connected");
      this.client.subscribe(env.STACKCHAN_ACK_TOPIC);
      this.client.subscribe(env.STACKCHAN_STATE_TOPIC);
    });

    this.client.on("reconnect", () => this.logger.debug("MQTT reconnecting"));
    this.client.on("close", () => this.logger.debug("MQTT close"));
    this.client.on("offline", () => this.logger.warn("MQTT offline"));
    this.client.on("end", () => this.logger.debug("MQTT end"));
    this.client.on("error", (err) => this.logger.error("MQTT error", { message: err.message }));

    this.client.on("message", (topic, payload) => {
      this.logger.debug("MQTT message", { topic, payload: payload.toString() });
      if (topic === env.STACKCHAN_ACK_TOPIC) {
        this.handleAck(payload);
      } else if (topic === env.STACKCHAN_STATE_TOPIC) {
        this.handleState(payload);
      }
    });
  }

  private handleAck(payload: Buffer) {
    try {
      const ack = JSON.parse(payload.toString()) as AckMessage & { id: string };
      this.logger.info("MQTT ack received", { id: ack.id, status: ack.status, message: ack.message });
      const pending = this.pending.get(ack.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(ack.id);
        pending.resolve(ack);
      } else {
        this.logger.debug("Ack with no pending request", { id: ack.id });
      }
    } catch (err) {
      this.logger.error("Failed to parse ack", { message: String(err) });
    }
  }

  private handleState(payload: Buffer) {
    try {
      const state = JSON.parse(payload.toString()) as StackState;
      this.latestState = { state, ts: Date.now() };
      this.logger.debug("State updated", { state });
      this.logger.debug("MQTT state received", { state });
    } catch (err) {
      this.logger.error("Failed to parse state", { message: String(err) });
    }
  }

  private async sendCommandOnce(
    command: Omit<CommandRequest, "userId">,
    timeoutMs = 8000
  ): Promise<AckMessage> {
    const id = uuidv4();
    const message = { id, type: command.type, payload: command.payload };
    const json = JSON.stringify(message);
    this.logger.info("MQTT publish", {
      topic: this.env.STACKCHAN_CMD_TOPIC,
      type: command.type,
      id,
    });

    await new Promise<void>((resolve, reject) => {
      this.client.publish(this.env.STACKCHAN_CMD_TOPIC, json, (err) => {
        if (err) {
          this.logger.error("MQTT publish error", { message: err.message });
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return new Promise<AckMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Command timed out waiting for ack"));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });
  }

  async sendCommand(
    command: Omit<CommandRequest, "userId">,
    timeoutMs = 8000
  ): Promise<AckMessage> {
    const maxAttempts = Math.max(1, this.env.MQTT_COMMAND_MAX_ATTEMPTS || 1);
    const baseDelay = Math.max(100, this.env.MQTT_COMMAND_BASE_DELAY_MS || 1000);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.sendCommandOnce(command, timeoutMs);
      } catch (err) {
        lastError = err as Error;
        if (attempt === maxAttempts) break;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logger.warn("MQTT command retry", {
          attempt,
          maxAttempts,
          delayMs: delay,
          message: String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Command failed");
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const json = JSON.stringify(payload);
    this.logger.info("MQTT publish event", { topic, length: json.length });
    return new Promise<void>((resolve, reject) => {
      this.client.publish(topic, json, (err) => {
        if (err) {
          this.logger.error("MQTT publish error", { message: err.message, topic });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  getFreshState(maxAgeMs = 30000): StackState | null {
    if (!this.latestState) return null;
    const age = Date.now() - this.latestState.ts;
    if (age > maxAgeMs) return null;
    return this.latestState.state;
  }

  async close() {
    this.logger.info("Closing MQTT client");
    this.client.end();
  }
}
