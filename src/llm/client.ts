import OpenAI from "openai";
import { Env } from "../utils/env";
import { Logger } from "../utils/logger";

const SYSTEM_PROMPT = `あなたはスタックチャン。すーぱーかわいいアシスタントロボットとして、日本語で短く元気に返事します。
ルール:
- いつも明るくポジティブに。かわいく語尾を柔らかくする。
- ハードウェア操作はユーザーがコマンドでお願いしたときだけ。そうでなければ提案や案内にとどめる。
- 安全第一。危険そうな操作は確認を促す。
- 長文は避け、簡潔に。`;

export class LlmClient {
  private openai: OpenAI;
  private env: Env;
  private logger: Logger;
  private conversations: Map<string, string>;

  constructor(env: Env, logger: Logger) {
    this.env = env;
    this.logger = logger;
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.conversations = new Map();
  }

  private async ensureConversation(userId: string): Promise<string | null> {
    // If an explicit conversation ID is provided, reuse it for all users.
    if (this.env.OPENAI_CONVERSATION_ID) return this.env.OPENAI_CONVERSATION_ID;

    const existing = this.conversations.get(userId);
    if (existing) return existing;
    const conversationsApi = (this.openai as any).conversations;
    if (!conversationsApi || !conversationsApi.create) {
      this.logger.warn("Conversations API not available in this SDK version; falling back to stateless mode");
      return null;
    }
    const convo = await conversationsApi.create({});
    this.conversations.set(userId, convo.id);
    this.logger.info("Conversation created", { userId, conversationId: convo.id });
    return convo.id;
  }

  async chat(userId: string, userMessage: string): Promise<string> {
    const model = this.env.OPENAI_MODEL_FAST;
    const conversationId = await this.ensureConversation(userId);
    const payload: any = {
      model,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    };
    if (conversationId) {
      payload.conversation = conversationId;
    }
    const response = await (this.openai as any).responses.create(payload);

    // Prefer the convenience field; fall back to first text-like block if missing.
    const fallback = (() => {
      const outputs = Array.isArray(response.output) ? response.output : [];
      for (const item of outputs) {
        // Some items are { type: "output_text", text: "..." }
        if ((item as any).type === "output_text" && typeof (item as any).text === "string") {
          return (item as any).text as string;
        }
        // Some items are { type: "output_text", content: [{ type: "text", text: "..." }, ...] }
        const content = (item as any).content;
        if (Array.isArray(content)) {
          const textPart = content.find((c: any) => c?.type === "text" && typeof c.text === "string");
          if (textPart) return textPart.text as string;
        }
      }
      return "";
    })();

    const text = (response.output_text || fallback || "うーん、もう一回教えてほしいかも…！").trim();
    this.logger.debug("LLM response", { model, length: text.length });
    return text;
  }
}
