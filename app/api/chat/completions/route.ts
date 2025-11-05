import { NextRequest, NextResponse } from 'next/server';
import { VertexAIClient } from '@/lib/vertex-ai-client';
import { convertVertexAIToOpenAI } from '@/lib/format-converter';

export const runtime = 'nodejs'; // Vercel 推荐 Edge Runtime 以获得最佳性能

// API 密钥验证函数
function validateApiKey(authHeader: string | null, validKeys: string[]): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const apiKey = authHeader.substring(7).trim();
  return validKeys.includes(apiKey);
}

export async function POST(request: NextRequest) {
  try {
    // 步骤 1: 验证 API 密钥
    const authHeader = request.headers.get('Authorization');
    const validKeys = (process.env.PRIVATE_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (validKeys.length > 0 && !validateApiKey(authHeader, validKeys)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 步骤 2: 验证和获取环境变量
    const { GCP_PROJECT_ID, GCP_LOCATION, GOOGLE_APPLICATION_CREDENTIALS_JSON, GEMINI_MODEL } = process.env;
    if (!GCP_PROJECT_ID || !GCP_LOCATION || !GOOGLE_APPLICATION_CREDENTIALS_JSON || !GEMINI_MODEL) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 步骤 3: 解析请求体
    const openaiRequest = await request.json();
    if (!openaiRequest.messages) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 步骤 4: 创建客户端并处理请求
    const vertexClient = new VertexAIClient(GCP_PROJECT_ID, GCP_LOCATION, GEMINI_MODEL);
    const vertexResponse = await vertexClient.handleRequest(openaiRequest);

    // 步骤 5: 如果是非流式，转换最终响应
    if (openaiRequest.stream !== true) {
        const responseData = await vertexResponse.json();
        const openaiResponse = convertVertexAIToOpenAI(responseData, GEMINI_MODEL);
        return NextResponse.json(openaiResponse);
    }
    
    // 步骤 6: 如果是流式，直接返回转换后的流
    return vertexResponse;

  } catch (error) {
    console.error('API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 健康检查 GET 方法
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Vercel Vertex AI Gateway',
    model: process.env.GEMINI_MODEL || 'not-configured',
    gcp_project_id: process.env.GCP_PROJECT_ID || 'not-configured',
  });
}
