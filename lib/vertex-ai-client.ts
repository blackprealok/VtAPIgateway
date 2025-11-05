import { VertexAI, GenerativeModel } from '@google-cloud/aiplatform';
import { convertOpenAIToVertexAI, convertVertexAIStreamToOpenAI } from './format-converter';

export class VertexAIClient {
  private generativeModel: GenerativeModel;
  private modelId: string;

  constructor(projectId: string, location: string, model: string) {
    // SDK 会自动从环境变量 GOOGLE_APPLICATION_CREDENTIALS_JSON 读取凭据
    const vertexAI = new VertexAI({ project: projectId, location: location });
    this.modelId = model;
    
    this.generativeModel = vertexAI.getGenerativeModel({
      model: this.modelId,
    });
  }

  async handleRequest(openaiRequest: any): Promise<Response> {
    const { contents, generationConfig, systemInstruction } = convertOpenAIToVertexAI(openaiRequest);

    // 将配置应用到模型实例
    const modelInstance = this.generativeModel.withGenerationConfig(generationConfig);
    
    const vertexAIRequest = {
        contents: contents,
        ...(systemInstruction && { systemInstruction: systemInstruction }),
    };

    if (openaiRequest.stream === true) {
      return this.stream(vertexAIRequest);
    } else {
      return this.nonStream(vertexAIRequest);
    }
  }

  private async nonStream(request: any): Promise<Response> {
    try {
      const result = await this.generativeModel.generateContent(request);
      return Response.json(result.response);
    } catch (error) {
      console.error('Vertex AI non-stream error:', error);
      return new Response(JSON.stringify({ error: 'Failed to call Vertex AI' }), { status: 500 });
    }
  }

  private async stream(request: any): Promise<Response> {
    try {
      const streamResult = await this.generativeModel.generateContentStream(request);
      
      const transformStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for await (const item of streamResult.stream) {
            const openaiFormattedChunk = convertVertexAIStreamToOpenAI(item, this.modelId);
            if (openaiFormattedChunk) {
              controller.enqueue(encoder.encode(openaiFormattedChunk));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
        // 绑定 this.modelId 到流中
        modelId: this.modelId
      });

      return new Response(transformStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (error) {
      console.error('Vertex AI stream error:', error);
      return new Response(JSON.stringify({ error: 'Failed to stream from Vertex AI' }), { status: 500 });
    }
  }
}
