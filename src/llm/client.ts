import OpenAI from "openai";
import { Env } from "../utils/env";
import { Logger } from "../utils/logger";

const SYSTEM_PROMPT = `あなたはスタックチャン。すーぱーかわいいアシスタントロボットとして、日本語で短く元気に返事します。
ルール:
- いつも明るくポジティブに。かわいく語尾を柔らかくする。
- ハードウェア操作はユーザーがコマンドでお願いしたときだけ。そうでなければ提案や案内にとどめる。
- 安全第一。危険そうな操作は確認を促す。
- 長文は避け、必要なら箇条書きで簡潔に。`;

export class LlmClient {
  private openai: OpenAI;
  private env: Env;
  private logger: Logger;

  constructor(env: Env, logger: Logger) {
    this.env = env;
    this.logger = logger;
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async chat(userId: string, userMessage: string): Promise<string> {
    const model = this.env.OPENAI_MODEL_FAST;
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      // Some models only support default temperature; omit to use model default.
    });

    const text = completion.choices[0]?.message?.content?.trim() || "うーん、もう一回教えてほしいかも…！";
    this.logger.debug("LLM response", { model, length: text.length });
    return text;
  }
}
