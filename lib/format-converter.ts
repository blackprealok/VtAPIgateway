import { Content, Part, GenerateContentResponse } from "@google-cloud/aiplatform/build/src/models/generative_models";

// OpenAI 请求体中的消息结构
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// OpenAI 请求体
interface OpenAIRequest {
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
}

/**
 * 将 OpenAI 格式的请求转换为 Vertex AI SDK 格式
 * @param request OpenAI 格式的请求体
 * @returns 包含 contents 和 generationConfig 的对象
 */
export function convertOpenAIToVertexAI(request: OpenAIRequest): { contents: Content[], generationConfig: any, systemInstruction?: Content } {
  const contents: Content[] = [];
  let systemInstruction: Content | undefined = undefined;

  for (const message of request.messages) {
    // 将 'assistant' 角色映射为 'model'
    const role = message.role === 'assistant' ? 'model' : 'user';

    if (message.role === 'system') {
      // SDK 推荐将系统指令分开处理
      systemInstruction = {
        role: 'system', // 虽然 SDK 最后会处理，但保持一致性
        parts: [{ text: message.content }]
      };
    } else {
      contents.push({
        role: role,
        parts: [{ text: message.content }]
      });
    }
  }

  const generationConfig: any = {};
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
  if (request.max_tokens !== undefined) generationConfig.maxOutputTokens = request.max_tokens;
  if (request.top_p !== undefined) generationConfig.topP = request.top_p;
  if (request.top_k !== undefined) generationConfig.topK = request.top_k;

  return { contents, generationConfig, systemInstruction };
}

/**
 * 将 Vertex AI SDK 的完整响应转换为 OpenAI 格式
 * @param response Vertex AI SDK 的 GenerateContentResponse
 * @param model 使用的模型名称
 * @returns OpenAI 格式的响应体
 */
export function convertVertexAIToOpenAI(response: GenerateContentResponse, model: string = 'gpt-4'): any {
  let content = '';
  let finishReason = 'stop';

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (candidate.content?.parts?.[0]?.text) {
      content = candidate.content.parts[0].text;
    }
    
    if (candidate.finishReason) {
      finishReason = candidate.finishReason === 'STOP' ? 'stop' : 'length';
    }
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: content },
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata?.totalTokenCount || 0
    }
  };
}

/**
 * 将 Vertex AI SDK 的流式块转换为 OpenAI SSE 格式的字符串
 * @param chunk Vertex AI SDK 流中的一个数据块
 * @param model 使用的模型名称
 * @returns OpenAI SSE 格式的字符串，例如 "data: {...}\n\n"
 */
export function convertVertexAIStreamToOpenAI(chunk: any, model: string = 'gpt-4'): string {
  if (!chunk.candidates || chunk.candidates.length === 0) {
    return '';
  }

  let content = '';
  const candidate = chunk.candidates[0];
  if (candidate.content?.parts?.[0]?.text) {
    content = candidate.content.parts[0].text;
  }

  const openaiChunk = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        delta: { content: content },
        finish_reason: candidate.finishReason === 'STOP' ? 'stop' : null
      }
    ]
  };

  return `data: ${JSON.stringify(openaiChunk)}\n\n`;
}
