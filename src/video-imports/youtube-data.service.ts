import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface YouTubeSourceVideo {
  youtubeVideoId: string;
  title: string;
  description: string;
  tags: string[];
  channelId: string;
  channelTitle: string;
  durationSeconds: number;
  publishedAt?: string;
  embeddable?: boolean; // from status.embeddable
  liveBroadcastContent?: 'none' | 'live' | 'upcoming'; // from snippet.liveBroadcastContent
}

export interface ListRecentVideosOptions {
  /** Videos at or below this duration count as Shorts and are left out. 0 disables it. */
  shortsMaxDurationSeconds?: number;
}

export interface YouTubePlaylistInfo {
  youtubePlaylistId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  itemCount: number;
}

/** Carries the HTTP status and Google's error reason so callers do not parse messages. */
export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'YouTubeApiError';
  }
}

interface YouTubePlaylistItemsResponse {
  nextPageToken?: string;
  items?: { contentDetails?: { videoId?: string } }[];
}

interface YouTubePlaylistsResponse {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
    };
    contentDetails?: { itemCount?: number };
  }[];
}

interface YouTubeVideoResource {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    tags?: string[];
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
  };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean };
}

interface YouTubeVideosResponse {
  items?: YouTubeVideoResource[];
}

interface YouTubeErrorResponse {
  error?: { message?: string; errors?: { reason?: string }[] };
}

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 50; // hard maximum of maxResults / ids per request
const MAX_VIDEOS_PER_CHANNEL = 150;
const MAX_PLAYLIST_VIDEOS = 200;
const MAX_PAGES = 3;
const MAX_PLAYLIST_PAGES = 20;

/**
 * Reads recent upload metadata through the official YouTube Data API v3
 * (`playlistItems.list` and `videos.list`).
 *
 * Only public metadata is read. Nothing is scraped, no captions are read, no
 * video or audio is downloaded, and no content is re-uploaded.
 *
 * Quota per channel: 1 unit for each playlistItems page + 1 unit for each
 * videos.list call, so a normal run costs about 2 units per channel.
 */
@Injectable()
export class YouTubeDataService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('YOUTUBE_API_KEY')?.trim());
  }

  /**
   * Up to `max` recent, usable videos of a channel, newest first.
   *
   * 1) Tries the long-form playlist (`UULF...`) that YouTube generates per
   *    channel: it has no Shorts or live streams, so every slot is usable.
   *    This playlist is not officially documented, so it may change.
   * 2) If YouTube has no such playlist, falls back to the uploads playlist
   *    (`UU...`) and drops Shorts here, paging until enough videos are found.
   */
  async listRecentVideos(
    channelId: string,
    max: number,
    options: ListRecentVideosOptions = {},
  ): Promise<YouTubeSourceVideo[]> {
    const wanted = Math.min(
      Math.max(Math.floor(max) || 1, 1),
      MAX_VIDEOS_PER_CHANNEL,
    );
    const shortsMax = options.shortsMaxDurationSeconds ?? 0;

    try {
      return await this.collectFromPlaylist(
        withPrefix(channelId, 'UULF'),
        channelId,
        wanted,
        shortsMax,
      );
    } catch (error) {
      if (!isPlaylistNotFound(error)) {
        throw error;
      }
    }

    try {
      return await this.collectFromPlaylist(
        withPrefix(channelId, 'UU'),
        channelId,
        wanted,
        shortsMax,
      );
    } catch (error) {
      if (isPlaylistNotFound(error)) {
        throw new Error(
          `YouTube channel ${channelId} was not found or has no uploads playlist`,
        );
      }

      throw error;
    }
  }

  /**
   * Title/description/owner of a public playlist. One `playlists.list` call
   * (1 quota unit).
   */
  async getPlaylist(playlistId: string): Promise<YouTubePlaylistInfo> {
    const response = await this.get<YouTubePlaylistsResponse>('playlists', {
      part: 'snippet,contentDetails',
      id: playlistId,
    });
    const item = response.items?.[0];

    if (!item?.id) {
      throw new YouTubeApiError(
        `YouTube playlist ${playlistId} was not found or is not public`,
        404,
        'playlistNotFound',
      );
    }

    return {
      youtubePlaylistId: item.id,
      title: item.snippet?.title ?? '',
      description: item.snippet?.description ?? '',
      channelId: item.snippet?.channelId ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      itemCount: item.contentDetails?.itemCount ?? 0,
    };
  }

  /**
   * Up to `max` videos of a playlist, in playlist order. Unlike
   * `listRecentVideos` it does not filter Shorts: the caller decides what to
   * skip so it can report exact counts. One quota unit per playlist page plus
   * one per 50 videos.
   */
  async listPlaylistVideos(
    playlistId: string,
    max: number,
  ): Promise<YouTubeSourceVideo[]> {
    const wanted = Math.min(
      Math.max(Math.floor(max) || 1, 1),
      MAX_PLAYLIST_VIDEOS,
    );
    const result: YouTubeSourceVideo[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;

    for (
      let page = 0;
      page < MAX_PLAYLIST_PAGES && result.length < wanted;
      page++
    ) {
      const playlist = await this.get<YouTubePlaylistItemsResponse>(
        'playlistItems',
        {
          part: 'contentDetails',
          playlistId,
          maxResults: String(PAGE_SIZE),
          ...(pageToken ? { pageToken } : {}),
        },
      );

      const videoIds = [
        ...new Set(
          (playlist.items ?? [])
            .map((item) => item.contentDetails?.videoId)
            .filter((id): id is string => Boolean(id)),
        ),
      ].filter((id) => !seen.has(id));

      if (videoIds.length > 0) {
        const videos = await this.fetchDetails(videoIds, '');

        for (const video of videos) {
          if (seen.has(video.youtubeVideoId)) {
            continue;
          }

          seen.add(video.youtubeVideoId);
          result.push(video);

          if (result.length >= wanted) {
            break;
          }
        }
      }

      pageToken = playlist.nextPageToken;

      if (!pageToken) {
        break;
      }
    }

    return result;
  }

  /** Pages through a playlist until `wanted` usable videos are collected. */
  private async collectFromPlaylist(
    playlistId: string,
    channelId: string,
    wanted: number,
    shortsMaxDurationSeconds: number,
  ): Promise<YouTubeSourceVideo[]> {
    const result: YouTubeSourceVideo[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES && result.length < wanted; page++) {
      const playlist = await this.get<YouTubePlaylistItemsResponse>(
        'playlistItems',
        {
          part: 'contentDetails',
          playlistId,
          maxResults: String(PAGE_SIZE),
          ...(pageToken ? { pageToken } : {}),
        },
      );

      const videoIds = [
        ...new Set(
          (playlist.items ?? [])
            .map((item) => item.contentDetails?.videoId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      if (videoIds.length > 0) {
        const videos = await this.fetchDetails(videoIds, channelId);

        for (const video of videos) {
          if (isShort(video.durationSeconds, shortsMaxDurationSeconds)) {
            continue;
          }

          result.push(video);

          if (result.length >= wanted) {
            break;
          }
        }
      }

      pageToken = playlist.nextPageToken;

      if (!pageToken) {
        break;
      }
    }

    return result;
  }

  /** One videos.list call (max 50 ids), returned in the order of `ids`. */
  private async fetchDetails(
    ids: string[],
    channelId: string,
  ): Promise<YouTubeSourceVideo[]> {
    const details = await this.get<YouTubeVideosResponse>('videos', {
      // `status` is what carries `embeddable`
      part: 'snippet,contentDetails,status',
      id: ids.join(','),
    });

    const order = new Map(ids.map((id, index) => [id, index]));

    return (details.items ?? [])
      .filter((item): item is YouTubeVideoResource & { id: string } =>
        Boolean(item.id),
      )
      .map((item) => ({
        youtubeVideoId: item.id,
        title: item.snippet?.title ?? '',
        description: item.snippet?.description ?? '',
        tags: item.snippet?.tags ?? [],
        channelId: item.snippet?.channelId ?? channelId,
        channelTitle: item.snippet?.channelTitle ?? '',
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        publishedAt: item.snippet?.publishedAt,
        embeddable: item.status?.embeddable,
        liveBroadcastContent: item.snippet?.liveBroadcastContent as
          YouTubeSourceVideo['liveBroadcastContent'] | undefined,
      }))
      .sort(
        (a, b) => order.get(a.youtubeVideoId)! - order.get(b.youtubeVideoId)!,
      );
  }

  private async get<T>(
    resource: string,
    params: Record<string, string>,
  ): Promise<T> {
    const apiKey = this.config.get<string>('YOUTUBE_API_KEY')?.trim();

    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY is not configured');
    }

    const url = new URL(`${API_BASE_URL}/${resource}`);

    for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // A non-JSON error page must not hide the real HTTP status
    const payload = (await response.json().catch(() => ({}))) as T &
      YouTubeErrorResponse;

    if (!response.ok) {
      throw new YouTubeApiError(
        `YouTube API ${resource} request failed (${response.status}): ${
          payload.error?.message ?? 'unknown error'
        }`,
        response.status,
        payload.error?.errors?.[0]?.reason,
      );
    }

    return payload;
  }
}

/** "UCxxxx" -> "UULFxxxx" / "UUxxxx" (playlists YouTube builds from the channel id). */
function withPrefix(channelId: string, prefix: 'UULF' | 'UU'): string {
  return channelId.replace(/^UC/, prefix);
}

function isPlaylistNotFound(error: unknown): boolean {
  return (
    error instanceof YouTubeApiError &&
    (error.reason === 'playlistNotFound' || error.status === 404)
  );
}

/** Zero/unknown durations are kept; `maxDurationSeconds <= 0` disables the check. */
function isShort(durationSeconds: number, maxDurationSeconds: number): boolean {
  return (
    maxDurationSeconds > 0 &&
    durationSeconds > 0 &&
    durationSeconds <= maxDurationSeconds
  );
}

/**
 * Accepts a YouTube playlist URL or a bare playlist id and returns the id.
 * Returns null for anything that is not a YouTube URL with a `list` parameter
 * or a plausible playlist id.
 */
export function parseYouTubePlaylistId(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (isPlaylistId(trimmed)) {
    return trimmed;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const isYouTube =
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtu.be' ||
    hostname.endsWith('.youtu.be');

  if (!isYouTube) {
    return null;
  }

  const list = url.searchParams.get('list');

  return list && isPlaylistId(list) ? list : null;
}

function isPlaylistId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,100}$/.test(value);
}

/** Converts a YouTube ISO 8601 duration (`PT1H2M10S`) to whole seconds. */
export function parseIsoDuration(value?: string): number {
  if (!value) {
    return 0;
  }

  const match =
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      value,
    );

  if (!match) {
    return 0;
  }

  const [, weeks = '0', days = '0', hours = '0', minutes = '0', seconds = '0'] =
    match;

  return (
    Number(weeks) * 604_800 +
    Number(days) * 86_400 +
    Number(hours) * 3_600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}
