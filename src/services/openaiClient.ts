import OpenAI, { AzureOpenAI } from "openai";

import { env } from "../config/env";
import { HttpError } from "../utils/httpError";

class OpenAIClient {
  private readonly client: AzureOpenAI;

  constructor() {
    this.client = new AzureOpenAI({
      endpoint: env.azureOpenAI.endpoint,
      apiKey: env.azureOpenAI.apiKey,
      apiVersion: env.azureOpenAI.apiVersion
    });
  }

  async callLLM(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[]
  ) {
    const response = await this.client.chat.completions.create({
      model: env.azureOpenAI.deployment,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.2
    });

    const message = response.choices[0]?.message;

    if (!message) {
      throw new HttpError(502, "Azure OpenAI returned no completion message.");
    }

    return message;
  }
}

export const openAIClient = new OpenAIClient();
