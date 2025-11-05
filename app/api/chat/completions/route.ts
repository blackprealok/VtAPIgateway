// 文件路径: app/api/chat/completions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/aiplatform';

// 关键：将 API 路由的运行时设置为 Node.js
// Vercel 会自动处理这个环境
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 从环境变量中获取配置
const {
  GCP_PROJECT_ID,
  GCP_LOCATION,
  GEMINI_MODEL,
  PRIVATE_API_KEYS,
  GOOGLE_APPLICATION_CREDENTIALS_JSON
} = process.env;

// 检查必要的环境变量是否存在
if (!GCP_PROJECT_ID || !GCP_LOCATION || !GEMINI_MODEL || !PRIVATE_API_KEYS || !GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  throw new Error("Missing required environment variables for Vertex AI API.");
}

// 将逗号分隔的 API 密钥字符串转换为 Set 以便快速查找
const authorizedKeys = new Set(PRIVATE_API_KEYS.split(',').map(key => key.trim()));

// 初始化 Vertex AI 客户端
// 注意：当 GOOGLE_APPLICATION_CREDENTIALS_JSON 存在时，
// SDK 会自动使用它，无需手动解析。
const vertexAI = new VertexAI({
  project: GCP_PROJECT_ID,
  location: GCP_LOCATION,
});

const generativeModel = vertexAI.getGenerativeModel({
  model: GEMINI_MODEL,
  // 根据需要配置安全设置
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});


// GET 请求处理程序，用于健康检查
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Vertex AI Gateway is running.',
    model: GEMINI_MODEL,
    instructions: 'Send a POST request to this endpoint with OpenAI-compatible JSON body.',
  });
}

// POST 请求处理程序，用于处理聊天请求
export async function POST(req: NextRequest) {
  // 1. 验证 API 密钥
  const authHeader = req.headers.get('Authorization');
  const apiKey = authHeader?.split(' ')[1]; // 从 "Bearer <key>" 中提取 key

  if (!apiKey || !authorizedKeys.has(apiKey)) {
    return NextResponse.json({ error: 'Unauthorized: Invalid or missing API key.' }, { status: 401 });
  }

  try {
    // 2. 解析请求体
    const body = await req.json();
    const messages = body.messages || [];
    const lastUserMessage = messages.filter((msg: any) => msg.role === 'user').pop();

    if (!lastUserMessage || !lastUserMessage.content) {
      return NextResponse.json({ error: 'No user message found.' }, { status: 400 });
    }

    // 3. 调用 Vertex AI
    const chat = generativeModel.startChat({});
    const stream = await chat.sendMessageStream(lastUserMessage.content);

    // 4. 将 Vertex AI 的流转换为 OpenAI 格式的 Server-Sent Events (SSE) 流
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // 构建符合 OpenAI SSE 格式的数据块
        const openaiChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: GEMINI_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.candidates?.[0]?.content?.parts?.[0]?.text || '',
              },
              finish_reason: chunk.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : null,
            },
          ],
        };
        controller.enqueue(`data: ${JSON.stringify(openaiChunk)}\n\n`);
      },
      flush(controller) {
        // 流结束时，发送一个 [DONE] 标记
        controller.enqueue('data: [DONE]\n\n');
      }
    });

    // 返回一个流式响应
    return new Response(stream.stream.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
