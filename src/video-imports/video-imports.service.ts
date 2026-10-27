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
import { SpeakersService } from 'src/speakers/speakers.service';
import { TagsService } from 'src/tags/tags.service';
import { VideosService } from 'src/videos/videos.service';

import { AiMetadataService, AiMetadataSuggestion } from './ai-metadata.service';
import type { ImportIssue } from './import.types';
import {
  EMPTY_IMPORT_CATALOG,
  ImportCatalog as Catalog,
  addIssue,
  buildImportedDraft,
  errorMessage,
  isDuplicateKeyError,
  isQuotaError,
  isShortVideo,
  mapWithConcurrency,
  toCatalogOption,
  unavailableReason,
} from './import.utils';
import {
  getImportVideosPerChannel,
  getShortsMaxDurationSeconds,
} from './video-imports.config';
import { YouTubeDataService, YouTubeSourceVideo } from './youtube-data.service';

export interface VideoImportSummary {
  channels: number;
  videosPerChannel: number;
  shortsMaxDurationSeconds: number;
  aiEnabled: boolean;
  /** True when the AI was switched off mid-run after repeated failures. */
  aiDisabledAfterFailures: boolean;
  discovered: number;
  imported: number;
  /** skippedExisting + skippedShorts + skippedUnavailable */
  skipped: number;
  skippedExisting: number;
  skippedShorts: number;
  skippedUnavailable: number;
  /** New videos left for the next run because of the per-run cap. */
  deferred: number;
  failed: number;
  aiFailures: number;
  durationMs: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface ImportRunStatus {
  startedAt: Date;
  finishedAt?: Date;
  summary?: VideoImportSummary;
  error?: string;
}

interface PreparedRun {
  createdBy: Types.ObjectId;
  channelIds: string[];
  warnings: ImportIssue[];
}

/** Run-level guards: they bound cost, duration and response size. */
const MAX_CHANNELS_PER_RUN = 50;
const MAX_NEW_VIDEOS_PER_RUN = 100;
const AI_CONCURRENCY = 3;
const AI_FAILURES_BEFORE_DISABLE = 3;

/** A YouTube channel id is "UC" followed by 22 URL-safe characters. */
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

/**
 * Importer: triggered manually by an admin, reads the given channels, skips
 * videos that already exist and creates drafts only (an admin reviews them).
 *
 * `run()` waits for the result; `start()` returns immediately and the result
 * is available through `getStatus()`, which avoids HTTP timeouts on long runs.
 *
 * The `running` flag stops two requests in the same instance from
 * overlapping; a multi-instance deployment would need a shared lock
 * (for example a document in MongoDB with a TTL).
 */
@Injectable()
export class VideoImportsService {
  private readonly logger = new Logger(VideoImportsService.name);
  private running = false;
  private lastRun: ImportRunStatus | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly youtube: YouTubeDataService,
    private readonly ai: AiMetadataService,
    private readonly videosService: VideosService,
    private readonly categoriesService: CategoriesService,
    private readonly tagsService: TagsService,
    private readonly speakersService: SpeakersService,
  ) {}

  /** Runs the import and resolves with the summary. */
  async run(
    createdBy: string,
    channelsIds: string[],
  ): Promise<VideoImportSummary> {
    return this.execute(this.prepare(createdBy, channelsIds));
  }

  /**
   * Validates synchronously (so the caller still gets 4xx errors), then runs
   * in the background. Poll `getStatus()` for the outcome.
   */
  start(createdBy: string, channelsIds: string[]): { started: true } {
    const prepared = this.prepare(createdBy, channelsIds);

    void this.execute(prepared).catch((error) => {
      this.logger.error(
        `Background video import failed: ${errorMessage(error)}`,
      );
    });

    return { started: true };
  }

  getStatus(): { running: boolean; lastRun: ImportRunStatus | null } {
    return { running: this.running, lastRun: this.lastRun };
  }

  private prepare(createdBy: string, channelsIds: string[]): PreparedRun {
    if (this.running) {
      throw new ConflictException('A video import is already running');
    }

    if (!this.youtube.isConfigured()) {
      throw new ServiceUnavailableException(
        'YOUTUBE_API_KEY is not configured',
      );
    }

    if (!Types.ObjectId.isValid(createdBy)) {
      throw new BadRequestException('Invalid admin user id');
    }

    const warnings: ImportIssue[] = [];
    const channelIds = normalizeChannelIds(channelsIds, warnings);

    if (channelIds.length === 0) {
      throw new BadRequestException(
        'No valid YouTube channel ids were provided',
      );
    }

    if (channelIds.length > MAX_CHANNELS_PER_RUN) {
      throw new BadRequestException(
        `Too many channels (max ${MAX_CHANNELS_PER_RUN} per run)`,
      );
    }

    return { createdBy: new Types.ObjectId(createdBy), channelIds, warnings };
  }

  private async execute(prepared: PreparedRun): Promise<VideoImportSummary> {
    // Set synchronously, before any await, so two callers cannot both pass.
    this.running = true;
    const startedAt = Date.now();
    this.lastRun = { startedAt: new Date(startedAt) };

    try {
      const summary = await this.runImport(prepared, startedAt);

      this.lastRun = { ...this.lastRun, finishedAt: new Date(), summary };
      this.logger.log(
        `Video import finished in ${summary.durationMs}ms: ` +
          `${summary.discovered} discovered, ${summary.imported} imported, ` +
          `${summary.skipped} skipped (${summary.skippedShorts} Shorts, ` +
          `${summary.skippedUnavailable} unavailable), ` +
          `${summary.deferred} deferred, ${summary.failed} failed`,
      );

      return summary;
    } catch (error) {
      this.lastRun = {
        ...this.lastRun,
        finishedAt: new Date(),
        error: errorMessage(error),
      };
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async runImport(
    prepared: PreparedRun,
    startedAt: number,
  ): Promise<VideoImportSummary> {
    const { createdBy, channelIds, warnings } = prepared;
    const videosPerChannel = getImportVideosPerChannel(this.config);
    const shortsMaxDurationSeconds = getShortsMaxDurationSeconds(this.config);
    // With AI_API_KEY empty this resolves to false, so no AI calls are made.
    const aiEnabled = this.ai.isConfigured();

    const summary: VideoImportSummary = {
      channels: channelIds.length,
      videosPerChannel,
      shortsMaxDurationSeconds,
      aiEnabled,
      aiDisabledAfterFailures: false,
      discovered: 0,
      imported: 0,
      skipped: 0,
      skippedExisting: 0,
      skippedShorts: 0,
      skippedUnavailable: 0,
      deferred: 0,
      failed: 0,
      aiFailures: 0,
      durationMs: 0,
      errors: [],
      warnings: [...warnings],
    };

    const finish = (): VideoImportSummary => {
      summary.skipped =
        summary.skippedExisting +
        summary.skippedShorts +
        summary.skippedUnavailable;
      summary.durationMs = Date.now() - startedAt;
      return summary;
    };

    // 1) Discover recent videos from every channel.
    const discovered: YouTubeSourceVideo[] = [];
    const seen = new Set<string>();

    for (const channelId of channelIds) {
      try {
        const videos = await this.youtube.listRecentVideos(
          channelId,
          videosPerChannel,
          { shortsMaxDurationSeconds },
        );

        for (const video of videos) {
          if (seen.has(video.youtubeVideoId)) {
            continue;
          }

          seen.add(video.youtubeVideoId);
          discovered.push(video);
        }
      } catch (error) {
        // One broken channel must not stop the others.
        addIssue(summary.errors, { channelId, reason: errorMessage(error) });

        // ...but once the daily quota is gone every other channel will fail too.
        if (isQuotaError(error)) {
          addIssue(summary.errors, {
            reason: 'YouTube API quota exhausted, discovery stopped early',
          });
          break;
        }
      }
    }

    summary.discovered = discovered.length;

    if (discovered.length === 0) {
      return finish();
    }

    // 2) Drop what can never be useful in the app.
    const eligible: YouTubeSourceVideo[] = [];

    for (const video of discovered) {
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

    if (eligible.length === 0) {
      return finish();
    }

    // 3) Skip videos we already know. The lookup should include rejected and
    // soft-deleted videos too, otherwise they come back on every run.
    const existing = await this.videosService.findExistingYoutubeIds(
      eligible.map((video) => video.youtubeVideoId),
    );

    const pending = eligible.filter(
      (video) => !existing.has(video.youtubeVideoId),
    );

    summary.skippedExisting += eligible.length - pending.length;

    if (pending.length === 0) {
      return finish();
    }

    // 4) Cap the work per run; the rest is picked up by the next run.
    const toProcess = pending.slice(0, MAX_NEW_VIDEOS_PER_RUN);
    summary.deferred = pending.length - toProcess.length;

    if (summary.deferred > 0) {
      addIssue(summary.warnings, {
        reason: `${summary.deferred} new videos deferred to the next run (limit ${MAX_NEW_VIDEOS_PER_RUN} per run)`,
      });
    }

    // The catalog is only needed to validate AI suggestions.
    const catalog = aiEnabled ? await this.loadCatalog() : EMPTY_IMPORT_CATALOG;

    let aiActive = aiEnabled;
    let consecutiveAiFailures = 0;

    // 5) Suggest metadata and create drafts, a few videos at a time.
    // The worker never throws: every failure is recorded in the summary.
    await mapWithConcurrency(toProcess, AI_CONCURRENCY, async (source) => {
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

          // A bad key or a rate limit fails every call: stop paying for it.
          if (aiActive && consecutiveAiFailures >= AI_FAILURES_BEFORE_DISABLE) {
            aiActive = false;
            summary.aiDisabledAfterFailures = true;
            addIssue(summary.warnings, {
              reason: `AI disabled for the rest of this run after ${AI_FAILURES_BEFORE_DISABLE} consecutive failures`,
            });
          }
        }
      }

      try {
        const dto = buildImportedDraft(source, suggestion, catalog);

        await this.videosService.createDraft(dto, createdBy);
        summary.imported += 1;
      } catch (error) {
        // The unique index is the final guard against a duplicate that
        // appeared between the pre-check and this insert.
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

    return finish();
  }

  private async loadCatalog(): Promise<Catalog> {
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
}

/** Trims, de-duplicates and validates ids; invalid ones become warnings. */
function normalizeChannelIds(
  raw: string[] | undefined,
  warnings: ImportIssue[],
): string[] {
  const unique = new Set<string>();

  for (const value of raw ?? []) {
    const id = value?.trim();

    if (!id) {
      continue;
    }

    if (!CHANNEL_ID_PATTERN.test(id)) {
      addIssue(warnings, {
        channelId: id,
        reason: 'Invalid channel id (expected "UC" + 22 characters), skipped',
      });
      continue;
    }

    unique.add(id);
  }

  return [...unique];
}
