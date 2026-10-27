import { ConfigService } from '@nestjs/config';

/**
 * The fixed list of trusted channels the importer reads from.
 *
 * These are placeholders: replace them with the real YouTube channel ids
 * (the ids start with `UC`) or, without touching code, set
 * `YOUTUBE_IMPORT_CHANNEL_IDS` in the environment to a comma-separated list.
 * There is deliberately no database model and no CRUD endpoint for channels.
 */
export const DEFAULT_IMPORT_CHANNEL_IDS: readonly string[] = [
  'UC_REPLACE_WITH_CHANNEL_ID_1',
  'UC_REPLACE_WITH_CHANNEL_ID_2',
];

/** How many of a channel's most recent uploads are checked per run. */
export const DEFAULT_IMPORT_VIDEOS_PER_CHANNEL = 5;

/** The YouTube Data API accepts at most 50 results per request. */
export const MAX_IMPORT_VIDEOS_PER_CHANNEL = 50;

/**
 * YouTube Shorts are at most 3 minutes long, and the Data API does not expose
 * an "is Short" flag, so videos at or below this duration are treated as
 * Shorts and skipped. Set `YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS=0` to
 * disable the filter.
 */
export const DEFAULT_IMPORT_SHORTS_MAX_DURATION_SECONDS = 180;

/** Sanity cap for the configurable Shorts cutoff (one hour). */
export const MAX_IMPORT_SHORTS_DURATION_SECONDS = 3_600;

export function getImportChannelIds(config: ConfigService): string[] {
  const configured = config.get<string>('YOUTUBE_IMPORT_CHANNEL_IDS');

  if (configured?.trim()) {
    return configured
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }

  return [...DEFAULT_IMPORT_CHANNEL_IDS];
}

export function getImportVideosPerChannel(config: ConfigService): number {
  const configured = Number(
    config.get<string>('YOUTUBE_IMPORT_MAX_VIDEOS_PER_CHANNEL'),
  );

  if (!Number.isFinite(configured) || configured < 1) {
    return DEFAULT_IMPORT_VIDEOS_PER_CHANNEL;
  }

  return Math.min(MAX_IMPORT_VIDEOS_PER_CHANNEL, Math.floor(configured));
}

export function getShortsMaxDurationSeconds(config: ConfigService): number {
  const raw = config.get<string>('YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS');

  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_IMPORT_SHORTS_MAX_DURATION_SECONDS;
  }

  const configured = Number(raw);

  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_IMPORT_SHORTS_MAX_DURATION_SECONDS;
  }

  return Math.min(MAX_IMPORT_SHORTS_DURATION_SECONDS, Math.floor(configured));
}
