import mqtt from "mqtt";
import dotenv from "dotenv";
dotenv.config();

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const CMD_TOPIC = process.env.STACKCHAN_CMD_TOPIC || "stackchan/cmd";
const ACK_TOPIC = process.env.STACKCHAN_ACK_TOPIC || "stackchan/ack";
const STATE_TOPIC = process.env.STACKCHAN_STATE_TOPIC || "stackchan/state";

const client = mqtt.connect(MQTT_URL);

let battery = 90;
let temperature = 36.5;
let listening = true;
let lastMotion = "idle";
let lastExpression = "neutral";
let brightness = 70;

client.on("connect", () => {
  // eslint-disable-next-line no-console
  console.log("Simulator connected to MQTT");
  client.subscribe(CMD_TOPIC);
  publishState();
  setInterval(publishState, 15000);
});

client.on("message", (topic, payload) => {
  if (topic !== CMD_TOPIC) return;
  try {
    const msg = JSON.parse(payload.toString()) as {
      id: string;
      type: string;
      payload: Record<string, unknown>;
    };
    // eslint-disable-next-line no-console
    console.log("Received command", msg);
    handleCommand(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Bad command payload", err);
  }
});

function handleCommand(msg: { id: string; type: string; payload: Record<string, unknown> }) {
  const ack = { id: msg.id, status: "ok", message: "simulated" };
  client.publish(ACK_TOPIC, JSON.stringify(ack));

  switch (msg.type) {
    case "say":
      // nothing extra
      break;
    case "volume":
      // pretend volume affects battery slightly
      battery = Math.max(10, battery - 1);
      break;
    case "motion":
      lastMotion = String(msg.payload.motion || "unknown");
      break;
    case "expression":
      lastExpression = String(msg.payload.expression || "unknown");
      break;
    case "listen":
      listening = Boolean(msg.payload.listen);
      break;
    case "brightness":
      brightness = Math.min(100, Math.max(0, Number(msg.payload.brightness || brightness)));
      break;
  }
  publishState();
}

function publishState() {
  const state = {
    battery,
    temperature,
    listening,
    lastMotion,
    lastExpression,
    brightness,
    updatedAt: new Date().toISOString(),
  };
  client.publish(STATE_TOPIC, JSON.stringify(state));
  // eslint-disable-next-line no-console
  console.log("Published state", state);
}

process.on("SIGINT", () => {
  // eslint-disable-next-line no-console
  console.log("Simulator exiting");
  client.end();
  process.exit(0);
});
