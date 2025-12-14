# Stack-chan Slack Bot

Slack-first assistant for Stack-chan. It chats with a playful personality, routes intents (chat/command/query), talks to Stack-chan over MQTT, and falls back to a simulator for development.

## Features
- DM-centric Slack Bolt (Socket Mode). Optional @mention in channels for status.
- 日本語でかわいく応答するスタックチャン人格。
- `/stack` slash command with subcommands: `say`, `volume`, `motion`, `expression`, `listen`, `brightness`, `status`.
- Intent router for normal messages (CHAT / COMMAND / QUERY) with confirmation flow for commands and danger checks.
- OpenAI integration (単一モデル指定、考察モードなし)。
- MQTT request/response with correlated acks and state cache.
- Stack-chan simulator (no hardware needed).
- 履歴はOpenAI側（非永続）に任せるためローカルDBには保存しません。
- Structured logging, debug mode, graceful shutdown.

## Slack App Setup
1. Create a new Slack app (from manifest).
2. Scopes:
   - **Bot Token Scopes**: `app_mentions:read`, `chat:write`, `chat:write.public`, `commands`, `im:history`, `im:read`, `im:write`, `users:read`, `channels:read`, `groups:read`, `mpim:read`.
   - **Socket Mode**: enable it and copy **App Level Token** (`SLACK_APP_TOKEN`).
3. Event subscriptions:
   - Enable events, choose Socket Mode.
   - Subscribe to bot events: `app_mention`, `message.im`, `message.mpim`.
4. Interactivity:
   - Turn on interactivity. Set any URL (not used in Socket Mode, but required).
5. Slash command:
   - Command: `/stack`
   - Request URL: any placeholder (Socket Mode). Description: "Stack-chan control". Usage hint: `/stack say hello`.
6. Install to workspace and collect these values:
   - `SLACK_BOT_TOKEN`: Bot User OAuth Token (`xoxb-...`) from **OAuth & Permissions**.
   - `SLACK_SIGNING_SECRET`: from **Basic Information → App Credentials**.
   - `SLACK_APP_TOKEN`: App-Level Token (`xapp-...`) created for Socket Mode (add `connections:write` scope).

## Running on Raspberry Pi (or local)
```bash
# Node.js 20+ recommended
npm ci
cp .env.example .env
# Fill in tokens/keys
npm run dev      # ts-node live
npm run build && npm start  # compiled
```

## Environment
See `.env.example`. Important ones:
- `SLACK_BOT_TOKEN` (`xoxb-...`), `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` (`xapp-...` for Socket Mode) — Slack app credentials。
- `OPENAI_API_KEY`, `OPENAI_MODEL_FAST`（使用するモデル名）。
- `MQTT_URL` for Mosquitto.
- `ALLOWED_SLACK_USER_IDS` comma list for COMMANDs.

## Using the bot
- DM the bot: normal chat uses Stack-chan personality.
- Ask status: "status?", "battery?", "temperature?" → QUERY flow.
- Command keywords in DM (say/volume/motion/expression/listen/brightness/status) trigger a confirmation card before running (only allowlisted users can run).
- `/stack <subcommand>` runs immediately (with confirmation if dangerous):
  - `/stack say hello world`
  - `/stack volume 60`
  - `/stack motion wave`
  - `/stack expression happy`
  - `/stack listen on`
  - `/stack brightness 50`
  - `/stack status`
- For long actions, the bot acknowledges quickly, then follows up after MQTT ack.

## Simulator
No hardware? Use the simulator.
```bash
npm run sim
```
What it does:
- Subscribes to `stackchan/cmd`.
- On command, logs it, publishes an ack with the same `id`, and updates `stackchan/state`.
- Publishes periodic state updates every 15s.

## Testing checklist
- DM chat: "hi" → playful response.
- `/stack say hello` → ack and success.
- `/stack status` → short status summary.
- `/stack brightness 90` → confirmation (high brightness treated as dangerous) + ack.
- DM "set volume to 90" → confirmation + danger warning.

## Troubleshooting
- **MQTT connection issues**: check `MQTT_URL`, credentials, broker reachable. Use `LOG_LEVEL=debug` to see connection retries.
- **Slack Socket Mode issues**: verify `SLACK_APP_TOKEN` and that Socket Mode is enabled. Bot must be installed to the workspace.
- **OpenAI errors**: confirm `OPENAI_API_KEY`, model names, and that network access is allowed.
- **No acks**: verify device publishes to `STACKCHAN_ACK_TOPIC`. Simulator can help isolate.

## MQTT payloads
Command (publish to `stackchan/cmd`):
```json
{
  "id": "c0c3c534-98cd-4b0e-8eae-14b2d9d9833a",
  "type": "say",
  "payload": { "text": "hello" }
}
```
Ack (expected on `stackchan/ack`):
```json
{
  "id": "c0c3c534-98cd-4b0e-8eae-14b2d9d9833a",
  "status": "ok",
  "message": "queued"
}
```
Brightness command example:
```json
{
  "id": "c0c3c534-98cd-4b0e-8eae-14b2d9d9833a",
  "type": "brightness",
  "payload": { "brightness": 60 }
}
```
State update (on `stackchan/state`):
```json
{
  "battery": 82,
  "temperature": 36.5,
  "listening": true,
  "lastMotion": "wave",
  "brightness": 60,
  "updatedAt": "2024-05-11T09:00:00.000Z"
}
```
