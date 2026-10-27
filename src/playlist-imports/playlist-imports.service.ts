import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { CategoriesService } from 'src/categories/categories.service';
import { PlaylistsService } from 'src/playlists/playlists.service';
import { SpeakersService } from 'src/speakers/speakers.service';
import { TagsService } from 'src/tags/tags.service';
import { VideoStatus } from 'src/videos/schemas/video.schema';
import {
  VideosService,
  YoutubeVideoReference,
} from 'src/videos/videos.service';

import {
  AiMetadataService,
  AiMetadataSuggestion,
} from '../video-imports/ai-metadata.service';
import type { ImportIssue } from '../video-imports/import.types';
import {
  EMPTY_IMPORT_CATALOG,
  ImportCatalog,
  addIssue,
  buildImportedDraft,
  errorMessage,
  firstNonEmpty,
  isDuplicateKeyError,
  isShortVideo,
  mapWithConcurrency,
  toCatalogOption,
  unavailableReason,
  uniqueStrings,
} from '../video-imports/import.utils';
import { getShortsMaxDurationSeconds } from '../video-imports/video-imports.config';
import {
  YouTubeApiError,
  YouTubeDataService,
  YouTubePlaylistInfo,
  YouTubeSourceVideo,
  parseYouTubePlaylistId,
} from '../video-imports/youtube-data.service';

import { ImportPlaylistDto } from './dto/import-playlist.dto';

export interface PlaylistImportSummary {
  /** The app playlist id — use it with `GET /playlists/:id`. */
  appPlaylistId: string;
  youtubePlaylistId: string;
  title: string;
  /** False when the YouTube playlist had already been imported. */
  created: boolean;
  speakers: string[];
  maxVideos: number;
  shortsMaxDurationSeconds: number;
  aiEnabled: boolean;
  aiDisabledAfterFailures: boolean;
  discovered: number;
  imported: number;
  /** Videos actually placed in the app playlist. */
  playlistVideos: number;
  /** skippedExisting + skippedShorts + skippedUnavailable */
  skipped: number;
  skippedExisting: number;
  skippedShorts: number;
  skippedUnavailable: number;
  /** Existing videos left out because they are archived in the app. */
  skippedArchived: number;
  /** Playlist entries not checked because `maxVideos` was reached. */
  deferred: number;
  failed: number;
  aiFailures: number;
  durationMs: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

interface PreparedRun {
  createdBy: Types.ObjectId;
  playlistId: string;
  maxVideos: number;
  speakers: string[];
  title?: string;
  description?: string;
  warnings: ImportIssue[];
}

const DEFAULT_MAX_VIDEOS = 50;
const MAX_VIDEOS = 200;
const AI_CONCURRENCY = 3;
const AI_FAILURES_BEFORE_DISABLE = 3;

/**
 * Imports one public YouTube playlist as an app playlist.
 *
 * The videos are created as drafts through `VideosService.createDraft` (with
 * AI-suggested categories/tags/speakers), then the playlist is created or
 * updated through `PlaylistsService.upsertImported`. Re-importing the same
 * YouTube playlist updates the same document because of the unique
 * `youtubePlaylistId` index.
 *
 * Imported playlists may reference drafts until the admin publishes them.
 * Only a manual admin POST triggers a run; there is no queue or cron.
 */
@Injectable()
export class PlaylistImportsService {
  private readonly logger = new Logger(PlaylistImportsService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly youtube: YouTubeDataService,
    private readonly ai: AiMetadataService,
    private readonly videosService: VideosService,
    private readonly playlistsService: PlaylistsService,
    private readonly categoriesService: CategoriesService,
    private readonly tagsService: TagsService,
    private readonly speakersService: SpeakersService,
  ) {}

  async run(
    createdBy: string,
    dto: ImportPlaylistDto,
  ): Promise<PlaylistImportSummary> {
    return this.execute(this.prepare(createdBy, dto));
  }

  private prepare(createdBy: string, dto: ImportPlaylistDto): PreparedRun {
    if (this.running) {
      throw new ConflictException('A playlist import is already running');
    }

    if (!this.youtube.isConfigured()) {
      throw new ServiceUnavailableException(
        'YOUTUBE_API_KEY is not configured',
      );
    }

    if (!Types.ObjectId.isValid(createdBy)) {
      throw new BadRequestException('Invalid admin user id');
    }

    const playlistId = parseYouTubePlaylistId(dto.playlist);

    if (!playlistId) {
      throw new BadRequestException(
        'playlist must be a YouTube playlist URL or a valid playlist id',
      );
    }

    const maxVideos = clamp(dto.maxVideos ?? DEFAULT_MAX_VIDEOS, 1, MAX_VIDEOS);
    const speakers = uniqueStrings(dto.speakers ?? []);

    if (speakers.length > 5) {
      throw new BadRequestException('Too many speakers (max 5 per import)');
    }

    if (speakers.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('One or more speaker ids are invalid');
    }

    return {
      createdBy: new Types.ObjectId(createdBy),
      playlistId,
      maxVideos,
      speakers,
      title: dto.title?.trim() || undefined,
      description: dto.description,
      warnings: [],
    };
  }

  private async execute(prepared: PreparedRun): Promise<PlaylistImportSummary> {
    // Set synchronously, before any await, so two callers cannot both pass.
    this.running = true;
    const startedAt = Date.now();

    try {
      const summary = await this.runImport(prepared, startedAt);

      this.logger.log(
        `Playlist import finished in ${summary.durationMs}ms: ` +
          `${summary.discovered} discovered, ${summary.imported} imported, ` +
          `${summary.playlistVideos} in playlist, ${summary.skipped} skipped, ` +
          `${summary.failed} failed`,
      );

      return summary;
    } finally {
      this.running = false;
    }
  }

  private async runImport(
    prepared: PreparedRun,
    startedAt: number,
  ): Promise<PlaylistImportSummary> {
    const { createdBy, playlistId, maxVideos, speakers } = prepared;
    const shortsMaxDurationSeconds = getShortsMaxDurationSeconds(this.config);
    const aiEnabled = this.ai.isConfigured();

    const summary: PlaylistImportSummary = {
      // Both are filled after the playlist is upserted.
      appPlaylistId: '',
      youtubePlaylistId: playlistId,
      title: '',
      created: false,
      speakers: [...speakers],
      maxVideos,
      shortsMaxDurationSeconds,
      aiEnabled,
      aiDisabledAfterFailures: false,
      discovered: 0,
      imported: 0,
      playlistVideos: 0,
      skipped: 0,
      skippedExisting: 0,
      skippedShorts: 0,
      skippedUnavailable: 0,
      skippedArchived: 0,
      deferred: 0,
      failed: 0,
      aiFailures: 0,
      durationMs: 0,
      errors: [],
      warnings: [...prepared.warnings],
    };

    const finish = (): PlaylistImportSummary => {
      summary.skipped =
        summary.skippedExisting +
        summary.skippedShorts +
        summary.skippedUnavailable;
      summary.durationMs = Date.now() - startedAt;
      return summary;
    };

    // The explicit playlist speakers are used on every new video, so they must
    // be valid before anything is written.
    if (
      speakers.length > 0 &&
      !(await this.speakersService.areActive(speakers))
    ) {
      throw new BadRequestException(
        'One or more speakers do not exist or are inactive',
      );
    }

    let info: YouTubePlaylistInfo;
    let sources: YouTubeSourceVideo[];

    try {
      info = await this.youtube.getPlaylist(playlistId);
      sources = await this.youtube.listPlaylistVideos(
        playlistId,
        Math.min(maxVideos, info.itemCount > 0 ? info.itemCount : maxVideos),
      );
    } catch (error) {
      this.throwYouTubeError(error, playlistId);
    }

    summary.title = firstNonEmpty(
      prepared.title,
      info.title,
      info.youtubePlaylistId,
    ).slice(0, 150);
    summary.discovered = sources.length;
    summary.deferred = Math.max(0, info.itemCount - sources.length);

    if (summary.deferred > 0) {
      addIssue(summary.warnings, {
        playlistId,
        reason: `${summary.deferred} playlist entries were not checked because maxVideos is ${maxVideos}`,
      });
    }

    const eligible: YouTubeSourceVideo[] = [];
    const seen = new Set<string>();

    for (const video of sources) {
      if (seen.has(video.youtubeVideoId)) {
        continue;
      }

      seen.add(video.youtubeVideoId);

      const unavailable = unavailableReason(video);

      if (unavailable) {
        summary.skippedUnavailable += 1;
        addIssue(summary.warnings, {
          youtubeVideoId: video.youtubeVideoId,
          reason: `Skipped: ${unavailable}`,
        });
        continue;
      }

      if (isShortVideo(video.durationSeconds, shortsMaxDurationSeconds)) {
        summary.skippedShorts += 1;
        addIssue(summary.warnings, {
          youtubeVideoId: video.youtubeVideoId,
          reason: `Skipped YouTube Short: ${video.durationSeconds}s (limit ${shortsMaxDurationSeconds}s)`,
        });
        continue;
      }

      eligible.push(video);
    }

    // Existing videos are not rewritten, but they still belong in the
    // playlist. Their ids are resolved after the new drafts are created so the
    // final order can follow the YouTube playlist exactly.
    const existing = await this.videosService.findExistingYoutubeIds(
      eligible.map((video) => video.youtubeVideoId),
    );
    const pending = eligible.filter(
      (video) => !existing.has(video.youtubeVideoId),
    );
    summary.skippedExisting = eligible.length - pending.length;

    const catalog = aiEnabled ? await this.loadCatalog() : EMPTY_IMPORT_CATALOG;
    const createdReferences = new Map<string, YoutubeVideoReference>();

    let aiActive = aiEnabled;
    let consecutiveAiFailures = 0;

    await mapWithConcurrency(pending, AI_CONCURRENCY, async (source) => {
      let suggestion: AiMetadataSuggestion | undefined;

      if (aiActive) {
        try {
          suggestion = await this.ai.suggest({
            source: {
              title: source.title,
              description: source.description,
              tags: source.tags,
              channelTitle: source.channelTitle,
            },
            categories: catalog.categories,
            tags: catalog.tags,
            speakers: catalog.speakers,
          });
          consecutiveAiFailures = 0;
        } catch (error) {
          summary.aiFailures += 1;
          consecutiveAiFailures += 1;
          addIssue(summary.warnings, {
            youtubeVideoId: source.youtubeVideoId,
            reason: `AI suggestion failed, used source metadata: ${errorMessage(error)}`,
          });

          if (consecutiveAiFailures >= AI_FAILURES_BEFORE_DISABLE) {
            aiActive = false;
            summary.aiDisabledAfterFailures = true;
            addIssue(summary.warnings, {
              reason: `AI disabled for the rest of this run after ${AI_FAILURES_BEFORE_DISABLE} consecutive failures`,
            });
          }
        }
      }

      try {
        const dto = buildImportedDraft(source, suggestion, catalog, speakers);
        const created = await this.videosService.createDraft(dto, createdBy);

        createdReferences.set(source.youtubeVideoId, {
          _id: created._id,
          youtubeVideoId: source.youtubeVideoId,
          speakers: created.speakers ?? [],
          status: created.status,
        });
        summary.imported += 1;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          summary.skippedExisting += 1;
          return;
        }

        summary.failed += 1;
        addIssue(summary.errors, {
          youtubeVideoId: source.youtubeVideoId,
          reason: errorMessage(error),
        });
      }
    });

    const references = await this.videosService.findReferencesByYoutubeIds(
      eligible.map((video) => video.youtubeVideoId),
    );
    const byYoutubeId = new Map(
      references.map((reference) => [reference.youtubeVideoId, reference]),
    );

    for (const [youtubeVideoId, reference] of createdReferences) {
      if (!byYoutubeId.has(youtubeVideoId)) {
        byYoutubeId.set(youtubeVideoId, reference);
      }
    }

    const ordered = eligible
      .map((video) => byYoutubeId.get(video.youtubeVideoId))
      .filter((reference): reference is YoutubeVideoReference =>
        Boolean(reference),
      );
    const usable = ordered.filter(
      (reference) => reference.status !== VideoStatus.ARCHIVED,
    );

    summary.skippedArchived = ordered.length - usable.length;

    if (summary.skippedArchived > 0) {
      addIssue(summary.warnings, {
        playlistId,
        reason: `${summary.skippedArchived} archived video(s) were left out of the playlist`,
      });
    }

    const playlistSpeakers = new Set(speakers);

    for (const reference of usable) {
      for (const speakerId of reference.speakers ?? []) {
        playlistSpeakers.add(String(speakerId));
      }
    }

    const { playlist, created } = await this.playlistsService.upsertImported(
      {
        youtubePlaylistId: info.youtubePlaylistId,
        title: summary.title,
        description: (prepared.description ?? info.description ?? '').slice(
          0,
          5_000,
        ),
        videos: usable.map((reference) => String(reference._id)),
        speakers: [...playlistSpeakers],
      },
      createdBy,
    );

    summary.appPlaylistId = String(playlist._id);
    summary.created = created;
    summary.playlistVideos = usable.length;
    summary.speakers = [...playlistSpeakers];

    if (usable.length === 0) {
      addIssue(summary.warnings, {
        playlistId,
        reason:
          'No importable videos were found; the playlist was created empty',
      });
    }

    return finish();
  }

  private async loadCatalog(): Promise<ImportCatalog> {
    const [categories, tags, speakers] = await Promise.all([
      this.categoriesService.findActiveOptions(),
      this.tagsService.findAll(),
      this.speakersService.findActiveOptions(),
    ]);

    return {
      categories: categories.map(toCatalogOption),
      tags: tags.map(toCatalogOption),
      speakers: speakers.map(toCatalogOption),
    };
  }

  private throwYouTubeError(error: unknown, playlistId: string): never {
    if (error instanceof YouTubeApiError) {
      if (error.reason === 'playlistNotFound' || error.status === 404) {
        throw new BadRequestException(
          `YouTube playlist ${playlistId} was not found or is not public`,
        );
      }

      if (error.status === 403 && /quota/i.test(error.message)) {
        throw new ServiceUnavailableException(
          'YouTube API quota is exhausted, try again later',
        );
      }

      if (error.status === 400) {
        throw new BadRequestException(
          `YouTube rejected the playlist id: ${error.message}`,
        );
      }

      throw new ServiceUnavailableException(
        `YouTube playlist request failed: ${error.message}`,
      );
    }

    throw new ServiceUnavailableException(
      `Could not read the YouTube playlist: ${errorMessage(error)}`,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value) || min, min), max);
}
