import axios, { AxiosInstance } from "axios";
import OpenAI from "openai";
import type { Stream } from "openai/streaming";

import { env } from "../config/env";
import { HttpError } from "../utils/httpError";


export interface LLMCallOptions {
  /** Override deployment / model name from AgentVersion.meg_model */
  model?: string;
  /** Override max tokens from AgentVersion.meg_maxtokens */
  maxTokens?: number;
  /** Override temperature from AgentVersion.meg_temperature */
  temperature?: number;
}

/** o-series reasoning models don't support temperature or max_tokens */
function isReasoningModel(model: string): boolean {
  return /^(o1|o3|o4)(-mini|-preview)?/i.test(model);
}

function isUnsupportedParamError(error: any, paramName: string): boolean {
  return error?.response?.status === 400 && error?.response?.data?.error?.param === paramName;
}

function buildChatCompletionBody(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools: OpenAI.Chat.ChatCompletionTool[],
  options?: LLMCallOptions,
  overrides?: {
    omitTemperature?: boolean;
    useMaxCompletionTokens?: boolean;
  }
): Record<string, unknown> {
  const model = options?.model ?? env.azureOpenAI.deployment;
  const reasoning = isReasoningModel(model);
  const body: Record<string, unknown> = {
    model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined
  };

  const maxTokens = options?.maxTokens ?? undefined;
  const shouldUseMaxCompletionTokens = overrides?.useMaxCompletionTokens ?? reasoning;
  if (shouldUseMaxCompletionTokens) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  if (!overrides?.omitTemperature && !reasoning && options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  return body;
}

class OpenAIClient {
  private readonly client: OpenAI;
  private readonly httpClient: AxiosInstance;
  private readonly baseURL: string;

  constructor() {
    const endpoint = env.azureOpenAI.endpoint.replace(/\/+$/, "");
    let baseURL = endpoint;

    // Azure OpenAI / Foundry v1 API uses OpenAI-compatible routes under /openai/v1.
    // The user's current endpoint is a models.ai.azure.com host, but the deployed
    // gpt-4.1 model is served from the matching openai.azure.com resource.
    if (endpoint.endsWith(".models.ai.azure.com")) {
      const modelsMatch = endpoint.match(/^https:\/\/([^.]+)\.[^.]+\.models\.ai\.azure\.com$/);
      baseURL = modelsMatch
        ? `https://${modelsMatch[1]}.openai.azure.com/openai/v1`
        : `${endpoint.replace(/\.models\.ai\.azure\.com$/, ".openai.azure.com")}/openai/v1`;
    } else if (
      endpoint.endsWith(".openai.azure.com") ||
      endpoint.includes(".services.ai.azure.com/api/projects/")
    ) {
      baseURL = `${endpoint}/openai/v1`;
    } else if (!endpoint.includes("/openai/v1")) {
      baseURL = `${endpoint}/openai/v1`;
    }

    this.baseURL = `${baseURL.replace(/\/+$/, "")}/`;

    this.client = new OpenAI({
      baseURL: this.baseURL,
      apiKey: env.azureOpenAI.apiKey
    });

    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${env.azureOpenAI.apiKey}`,
        "Content-Type": "application/json"
      }
    });
  }

  async callLLM(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[],
    options?: LLMCallOptions
  ) {
    try {
      const response = await this.httpClient.post<{
        choices?: Array<{
          message?: OpenAI.Chat.Completions.ChatCompletionMessage;
        }>;
      }>("chat/completions", buildChatCompletionBody(messages, tools, options));

      const message = response.data.choices?.[0]?.message;

      if (!message) {
        throw new HttpError(502, "Azure OpenAI returned no completion message.");
      }

      return message;
    } catch (error: any) {
      if (isUnsupportedParamError(error, "temperature")) {
        const retry = await this.httpClient.post<{
          choices?: Array<{
            message?: OpenAI.Chat.Completions.ChatCompletionMessage;
          }>;
        }>("chat/completions", buildChatCompletionBody(messages, tools, options, { omitTemperature: true }));

        const retryMessage = retry.data.choices?.[0]?.message;
        if (!retryMessage) {
          throw new HttpError(502, "Azure OpenAI returned no completion message.");
        }

        return retryMessage;
      }

      if (isUnsupportedParamError(error, "max_tokens")) {
        const retry = await this.httpClient.post<{
          choices?: Array<{
            message?: OpenAI.Chat.Completions.ChatCompletionMessage;
          }>;
        }>(
          "chat/completions",
          buildChatCompletionBody(messages, tools, options, { useMaxCompletionTokens: true })
        );

        const retryMessage = retry.data.choices?.[0]?.message;
        if (!retryMessage) {
          throw new HttpError(502, "Azure OpenAI returned no completion message.");
        }

        return retryMessage;
      }

      const status = error?.response?.status;
      const body = error?.response?.data ?? error?.message;
      throw new HttpError(502, `Azure OpenAI completion error (${status}): ${JSON.stringify(body)}`);
    }
  }

  /**
   * Stream variant — returns the raw SSE stream from Azure OpenAI.
   * Caller is responsible for iterating chunks.
   */
  async callLLMStream(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[],
    options?: LLMCallOptions
  ): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    try {
      const stream = await this.client.chat.completions.create({
        ...buildChatCompletionBody(messages, tools, options),
        stream: true
      });

      return stream;
    } catch (error: any) {
      if (isUnsupportedParamError(error, "temperature")) {
        return this.client.chat.completions.create({
          ...buildChatCompletionBody(messages, tools, options, { omitTemperature: true }),
          stream: true
        });
      }

      if (isUnsupportedParamError(error, "max_tokens")) {
        return this.client.chat.completions.create({
          ...buildChatCompletionBody(messages, tools, options, { useMaxCompletionTokens: true }),
          stream: true
        });
      }

      const status = error?.status ?? error?.response?.status;
      const body = error?.error ?? error?.response?.data ?? error?.message;
      throw new HttpError(502, `Azure OpenAI streaming error (${status}): ${JSON.stringify(body)}`);
    }
  }
}

export const openAIClient = new OpenAIClient();
