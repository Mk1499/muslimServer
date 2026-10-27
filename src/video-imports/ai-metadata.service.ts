import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CatalogOption {
  id: string;
  name: string;
  nameAr: string;
  nameEn: string;
}

export interface AiSuggestionInput {
  source: {
    title: string;
    description: string;
    tags: string[];
    channelTitle: string;
  };
  categories: CatalogOption[];
  tags: CatalogOption[];
  speakers: CatalogOption[];
}

export interface AiMetadataSuggestion {
  title?: string;
  description?: string;
  categoryIds?: string[];
  tagIds?: string[];
  speakerIds?: string[];
}

interface AiProviderPreset {
  baseUrl: string;
  model: string;
}

export interface AiProviderSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  requiresKey: boolean;
}

/**
 * Free (or free-tier) OpenAI-compatible providers.
 *
 * Override the base URL or model with `AI_BASE_URL` / `AI_MODEL`. Any other
 * OpenAI-compatible endpoint can be used with `AI_PROVIDER=custom`.
 */
export const AI_PROVIDER_PRESETS: Readonly<
  Record<'gemini' | 'groq' | 'ollama' | 'openai', AiProviderPreset>
> = {
  // Free tier: https://aistudio.google.com/apikey
  // The flash-lite alias has a much larger free daily quota than the full
  // flash model (which is capped at ~20 requests/day), so it is the default
  // for batch imports. Set AI_MODEL=gemini-3.8-flash for higher quality.
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-flash-lite-latest',
  },
  // Free tier: https://console.groq.com/keys
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
  },
  // Local, no API key and no account: https://ollama.com
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
};

export const DEFAULT_AI_PROVIDER = 'gemini';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_SOURCE_DESCRIPTION = 2_000;
const MAX_SOURCE_TAGS = 20;
const MAX_CATEGORY_OPTIONS = 200;
const MAX_TAG_OPTIONS = 300;
const MAX_SPEAKER_OPTIONS = 150;

const SYSTEM_PROMPT = `You prepare metadata drafts for an Islamic video library.
Use only the source metadata and the existing categories, tags and speakers given in the user message.
Never invent religious rulings, claims, facts, speaker identities or video content.
If the available evidence is insufficient, keep the title and description neutral and return empty id arrays.
Return only one JSON object with this shape:
{"title": string, "description": string, "categoryIds": string[], "tagIds": string[], "speakerIds": string[]}
Rules:
- Keep the title in the source language, at most 120 characters.
- Keep the description short and factual, at most 400 characters.
- Only use ids copied from the provided lists; never invent ids.
- Only suggest a speaker when the channel name or description explicitly identifies them.
- Prefer no relationship over a guess.`;

/**
 * Optional metadata suggestions via any OpenAI-compatible chat completions API.
 *
 * It defaults to Google Gemini's free tier, but Groq, a local Ollama server and
 * any custom endpoint work too. Everything AI-related lives in this service.
 * The importer treats a missing configuration or any failure here as "no
 * suggestions" and falls back to the source metadata, so an AI outage never
 * stops an import.
 */
@Injectable()
export class AiMetadataService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    try {
      const settings = resolveAiProvider(this.config);

      return !settings.requiresKey || Boolean(settings.apiKey);
    } catch {
      // An explicitly configured but invalid provider should surface as a
      // per-item warning rather than silently disabling AI.
      return Boolean(this.config.get<string>('AI_API_KEY')?.trim());
    }
  }

  async suggest(input: AiSuggestionInput): Promise<AiMetadataSuggestion> {
    const settings = resolveAiProvider(this.config);

    if (settings.requiresKey && !settings.apiKey) {
      throw new Error(
        `AI_API_KEY is not configured for AI_PROVIDER "${settings.provider}"`,
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(buildPayload(input)) },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `AI request failed (${response.status}) using ${settings.provider}/${
          settings.model
        }${body ? `: ${body.slice(0, 300)}` : ''}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('AI response did not contain a message');
    }

    return parseSuggestion(content);
  }
}

/**
 * Resolves the provider preset plus any `AI_BASE_URL` / `AI_MODEL` override.
 * Throws a descriptive error for an unknown provider or an incomplete custom
 * configuration; the importer turns that into a warning.
 */
export function resolveAiProvider(config: ConfigService): AiProviderSettings {
  const provider = (
    config.get<string>('AI_PROVIDER')?.trim() || DEFAULT_AI_PROVIDER
  ).toLowerCase();
  const apiKey = config.get<string>('AI_API_KEY')?.trim() ?? '';
  const preset =
    provider === 'custom'
      ? undefined
      : AI_PROVIDER_PRESETS[provider as keyof typeof AI_PROVIDER_PRESETS];

  if (provider !== 'custom' && !preset) {
    throw new Error(
      `Unknown AI_PROVIDER "${provider}". Use ${Object.keys(
        AI_PROVIDER_PRESETS,
      ).join(', ')} or custom.`,
    );
  }

  const baseUrl = (
    config.get<string>('AI_BASE_URL')?.trim() ||
    preset?.baseUrl ||
    ''
  ).replace(/\/+$/, '');
  const model = config.get<string>('AI_MODEL')?.trim() || preset?.model || '';

  if (!baseUrl) {
    throw new Error('AI_BASE_URL is required when AI_PROVIDER=custom');
  }

  if (!model) {
    throw new Error('AI_MODEL is required when AI_PROVIDER=custom');
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    // Local servers such as Ollama need no key; remote providers do.
    requiresKey: !isLocalBaseUrl(baseUrl),
  };
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

function buildPayload(input: AiSuggestionInput) {
  return {
    source: {
      title: input.source.title,
      description: input.source.description.slice(0, MAX_SOURCE_DESCRIPTION),
      tags: input.source.tags.slice(0, MAX_SOURCE_TAGS),
      channelTitle: input.source.channelTitle,
    },
    categories: input.categories.slice(0, MAX_CATEGORY_OPTIONS),
    tags: input.tags.slice(0, MAX_TAG_OPTIONS),
    speakers: input.speakers.slice(0, MAX_SPEAKER_OPTIONS),
  };
}

function parseSuggestion(content: string): AiMetadataSuggestion {
  const withoutFences = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(withoutFences);
  } catch {
    // Some providers wrap the JSON in prose. Try the outermost object.
    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');

    if (start === -1 || end <= start) {
      throw new Error('AI response was not valid JSON');
    }

    try {
      parsed = JSON.parse(withoutFences.slice(start, end + 1));
    } catch {
      throw new Error('AI response was not valid JSON');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object');
  }

  const suggestion = parsed as Record<string, unknown>;

  return {
    title: toStringOrUndefined(suggestion.title),
    description: toStringOrUndefined(suggestion.description),
    categoryIds: toStringArray(suggestion.categoryIds),
    tagIds: toStringArray(suggestion.tagIds),
    speakerIds: toStringArray(suggestion.speakerIds),
  };
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
}
