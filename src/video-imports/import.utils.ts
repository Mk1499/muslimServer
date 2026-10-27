import { CreateVideoDto } from 'src/videos/dto/create-video.dto';

import { AiMetadataSuggestion, CatalogOption } from './ai-metadata.service';
import type { ImportIssue } from './import.types';
import type { YouTubeSourceVideo } from './youtube-data.service';

export interface ImportCatalog {
  categories: CatalogOption[];
  tags: CatalogOption[];
  speakers: CatalogOption[];
}

export const EMPTY_IMPORT_CATALOG: ImportCatalog = {
  categories: [],
  tags: [],
  speakers: [],
};

/** Conservative limits so a suggestion cannot over-tag a draft. */
const MAX_CATEGORIES = 3;
const MAX_TAGS = 5;
const MAX_AI_SPEAKERS = 2;
const MAX_DRAFT_SPEAKERS = 5;
const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 5_000;
const MAX_ISSUES_PER_LIST = 200;

/**
 * Set to false to keep the original YouTube title/description untouched and
 * let the AI choose categories/tags/speakers only. Worth considering for
 * religious content, where rewording a title can change its meaning.
 */
const USE_AI_TEXT = true;

/**
 * Turns source metadata plus optional AI suggestions into a draft DTO.
 *
 * Suggested ids are only kept when they exist in the active catalog, and only
 * a small number are kept per relation. `extraSpeakers` are ids validated by
 * the caller (for example the speakers requested for a whole playlist); they
 * are added before the AI suggestions so an explicit choice always wins.
 */
export function buildImportedDraft(
  source: YouTubeSourceVideo,
  suggestion: AiMetadataSuggestion | undefined,
  catalog: ImportCatalog,
  extraSpeakers: string[] = [],
): CreateVideoDto {
  const aiTitle = USE_AI_TEXT ? suggestion?.title : undefined;
  const aiDescription = USE_AI_TEXT ? suggestion?.description : undefined;

  const title = firstNonEmpty(
    aiTitle,
    source.title,
    source.youtubeVideoId,
  ).slice(0, MAX_TITLE_LENGTH);
  const description = firstNonEmpty(aiDescription, source.description).slice(
    0,
    MAX_DESCRIPTION_LENGTH,
  );

  const speakers = uniqueStrings([
    ...extraSpeakers,
    ...pickValidIds(suggestion?.speakerIds, catalog.speakers, MAX_AI_SPEAKERS),
  ]).slice(0, MAX_DRAFT_SPEAKERS);

  return {
    title,
    description,
    youtubeVideoId: source.youtubeVideoId,
    duration: source.durationSeconds,
    // Needs a matching optional field on CreateVideoDto and the schema.
    sourceChannelTitle: source.channelTitle,
    categories: pickValidIds(
      suggestion?.categoryIds,
      catalog.categories,
      MAX_CATEGORIES,
    ),
    tags: pickValidIds(suggestion?.tagIds, catalog.tags, MAX_TAGS),
    speakers,
  };
}

export function toCatalogOption(option: {
  _id: unknown;
  name: string;
  nameAr?: string;
  nameEn?: string;
}): CatalogOption {
  return {
    id: String(option._id),
    name: option.name,
    nameAr: option.nameAr ?? '',
    nameEn: option.nameEn ?? '',
  };
}

export function pickValidIds(
  suggested: string[] | undefined,
  catalog: CatalogOption[],
  max: number,
): string[] {
  if (!suggested?.length) {
    return [];
  }

  const allowed = new Set(catalog.map((option) => option.id));
  const picked: string[] = [];

  for (const id of suggested) {
    const candidate = id.trim();

    if (allowed.has(candidate) && !picked.includes(candidate)) {
      picked.push(candidate);
    }

    if (picked.length >= max) {
      break;
    }
  }

  return picked;
}

export function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }

  return '';
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ''))];
}

/**
 * Videos that cannot work inside the app: live streams and premieres that
 * have no final video yet, and videos whose owner disabled embedding.
 */
export function unavailableReason(video: YouTubeSourceVideo): string | null {
  if (video.embeddable === false) {
    return 'embedding is disabled by the channel owner';
  }

  if (
    video.liveBroadcastContent === 'live' ||
    video.liveBroadcastContent === 'upcoming'
  ) {
    return `not a finished video (${video.liveBroadcastContent})`;
  }

  return null;
}

/**
 * The Data API has no "is Short" flag, so duration is the reliable signal:
 * YouTube Shorts are at most 3 minutes long. A zero/unknown duration is kept
 * rather than dropped, and `maxDurationSeconds <= 0` disables the filter.
 */
export function isShortVideo(
  durationSeconds: number,
  maxDurationSeconds: number,
): boolean {
  if (maxDurationSeconds <= 0) {
    return false;
  }

  return durationSeconds > 0 && durationSeconds <= maxDurationSeconds;
}

/** Keeps a summary small even when something fails for every video. */
export function addIssue(list: ImportIssue[], issue: ImportIssue): void {
  if (list.length < MAX_ISSUES_PER_LIST) {
    list.push(issue);
  }
}

/** Runs `worker` over `items` with at most `limit` running at once. */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    },
  );

  await Promise.all(runners);
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.slice(0, 300);
}

export function isQuotaError(error: unknown): boolean {
  return /quota/i.test(errorMessage(error));
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
