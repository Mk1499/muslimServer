import { ConfigService } from '@nestjs/config';

import {
  AiMetadataService,
  AiSuggestionInput,
  resolveAiProvider,
} from './ai-metadata.service';

const INPUT: AiSuggestionInput = {
  source: {
    title: 'Source title',
    description: 'Source description',
    tags: ['source-tag'],
    channelTitle: 'Channel name',
  },
  categories: [{ id: 'cat-1', name: 'Category', nameAr: '', nameEn: '' }],
  tags: [],
  speakers: [],
};

function createService(values: Record<string, string | undefined>) {
  const config = {
    get: (key: string): string | undefined => values[key],
  } as unknown as ConfigService;

  return new AiMetadataService(config);
}

function mockChatCompletion(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function firstRequest(fetchMock: jest.SpyInstance) {
  const [url, init] = fetchMock.mock.calls[0] as [
    string | URL,
    RequestInit | undefined,
  ];
  const rawBody = init?.body;
  const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as {
    model: string;
    messages: { role: string; content: string }[];
  };

  return {
    url: String(url),
    headers: init?.headers as Record<string, string>,
    body,
  };
}

describe('AiMetadataService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the free Gemini tier by default', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockChatCompletion('{"title":"Gemini title"}'));

    const service = createService({ AI_API_KEY: 'gemini-key' });

    expect(service.isConfigured()).toBe(true);

    const suggestion = await service.suggest(INPUT);
    const request = firstRequest(fetchMock);

    expect(suggestion.title).toBe('Gemini title');
    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(request.body.model).toBe('gemini-flash-lite-latest');
    expect(request.headers.Authorization).toBe('Bearer gemini-key');
  });

  it('runs against a local Ollama server without an API key', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockChatCompletion('{"title":"Local title"}'));

    const service = createService({ AI_PROVIDER: 'ollama' });

    expect(service.isConfigured()).toBe(true);

    await service.suggest(INPUT);
    const request = firstRequest(fetchMock);

    expect(request.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(request.body.model).toBe('llama3.2');
    expect(request.headers.Authorization).toBeUndefined();
  });

  it('honours AI_BASE_URL and AI_MODEL over the provider preset', () => {
    const settings = resolveAiProvider({
      get: (key: string): string | undefined =>
        ({
          AI_PROVIDER: 'groq',
          AI_API_KEY: 'groq-key',
          AI_BASE_URL: 'https://example.test/v1/',
          AI_MODEL: 'custom-model',
        })[key],
    } as unknown as ConfigService);

    expect(settings).toMatchObject({
      provider: 'groq',
      baseUrl: 'https://example.test/v1',
      model: 'custom-model',
      requiresKey: true,
    });
  });

  it('supports a keyless custom endpoint on localhost', () => {
    const service = createService({
      AI_PROVIDER: 'custom',
      AI_BASE_URL: 'http://127.0.0.1:1234/v1',
      AI_MODEL: 'local-model',
    });

    expect(service.isConfigured()).toBe(true);
  });

  it('treats a remote provider without a key as not configured', async () => {
    const service = createService({ AI_PROVIDER: 'gemini' });

    expect(service.isConfigured()).toBe(false);
    await expect(service.suggest(INPUT)).rejects.toThrow(
      'AI_API_KEY is not configured',
    );
  });

  it('reports an unknown provider instead of guessing', async () => {
    const service = createService({
      AI_PROVIDER: 'not-a-provider',
      AI_API_KEY: 'some-key',
    });

    expect(service.isConfigured()).toBe(true);
    await expect(service.suggest(INPUT)).rejects.toThrow(
      'Unknown AI_PROVIDER "not-a-provider"',
    );
  });

  it('parses JSON wrapped in markdown fences', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockChatCompletion(
          '```json\n{"title":"Fenced","categoryIds":["cat-1"]}\n```',
        ),
      );

    const suggestion = await createService({
      AI_API_KEY: 'key',
    }).suggest(INPUT);

    expect(suggestion).toMatchObject({
      title: 'Fenced',
      categoryIds: ['cat-1'],
    });
  });

  it('includes the provider, model and response body in failures', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('quota exceeded', { status: 429 }));

    await expect(
      createService({ AI_API_KEY: 'key' }).suggest(INPUT),
    ).rejects.toThrow(
      'AI request failed (429) using gemini/gemini-flash-lite-latest',
    );
  });
});
