import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { VideoImportsService } from './video-imports.service';
import { YouTubeSourceVideo } from './youtube-data.service';

const ADMIN_ID = new Types.ObjectId().toHexString();
// Channel ids must look like real ones: "UC" + 22 characters.
const CHANNEL_ID = `UC${'x'.repeat(22)}`;
const OTHER_CHANNEL_ID = `UC${'y'.repeat(22)}`;
const CATEGORY_ID = new Types.ObjectId().toHexString();
const TAG_ID = new Types.ObjectId().toHexString();
const SPEAKER_ID = new Types.ObjectId().toHexString();

function makeSource(
  youtubeVideoId: string,
  overrides: Partial<YouTubeSourceVideo> = {},
): YouTubeSourceVideo {
  return {
    youtubeVideoId,
    title: `Source title ${youtubeVideoId}`,
    description: `Source description ${youtubeVideoId}`,
    tags: ['source-tag'],
    channelId: 'UC-channel-1',
    channelTitle: 'Channel name',
    durationSeconds: 600,
    ...overrides,
  };
}

function createService() {
  const config = {
    get: jest.fn((key: string): string | undefined => {
      if (key === 'YOUTUBE_IMPORT_MAX_VIDEOS_PER_CHANNEL') {
        return '5';
      }
      return undefined;
    }),
  };

  const youtube = {
    isConfigured: jest.fn().mockReturnValue(true),
    listRecentVideos: jest
      .fn()
      .mockResolvedValue([
        makeSource('aaaaaaaaaaa'),
        makeSource('bbbbbbbbbbb'),
      ]),
  };

  const ai = {
    isConfigured: jest.fn().mockReturnValue(false),
    suggest: jest.fn(),
  };

  const videos = {
    findExistingYoutubeIds: jest.fn() as jest.Mock<
      Promise<Set<string>>,
      [string[]]
    >,
    createDraft: jest.fn() as jest.Mock<
      Promise<unknown>,
      [Record<string, unknown>, Types.ObjectId]
    >,
  };

  videos.findExistingYoutubeIds.mockResolvedValue(new Set<string>());
  videos.createDraft.mockResolvedValue({});

  const categories = {
    findActiveOptions: jest.fn().mockResolvedValue([]),
  };

  const tags = {
    findAll: jest.fn().mockResolvedValue([]),
  };

  const speakers = {
    findActiveOptions: jest.fn().mockResolvedValue([]),
  };

  const service = new VideoImportsService(
    config as any,
    youtube as any,
    ai as any,
    videos as any,
    categories as any,
    tags as any,
    speakers as any,
  );

  return { service, config, youtube, ai, videos, categories, tags, speakers };
}

describe('VideoImportsService', () => {
  describe('duplicate detection', () => {
    it('skips videos whose youtubeVideoId already exists', async () => {
      const { service, youtube, videos } = createService();

      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa'),
        makeSource('bbbbbbbbbbb'),
      ]);
      videos.findExistingYoutubeIds.mockResolvedValue(new Set(['aaaaaaaaaaa']));

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        discovered: 2,
        imported: 1,
        skipped: 1,
        failed: 0,
      });
      expect(videos.createDraft).toHaveBeenCalledTimes(1);
      const [firstDraft] = videos.createDraft.mock.calls[0];
      expect(firstDraft.youtubeVideoId).toBe('bbbbbbbbbbb');
    });

    it('counts a unique-index conflict as skipped, not failed', async () => {
      const { service, youtube, videos } = createService();

      youtube.listRecentVideos.mockResolvedValue([makeSource('aaaaaaaaaaa')]);
      videos.createDraft.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: 11000 }),
      );

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        discovered: 1,
        imported: 0,
        skipped: 1,
        failed: 0,
      });
    });
  });

  describe('Shorts filtering', () => {
    it('skips videos at or below the 180s limit by default', async () => {
      const { service, youtube, videos } = createService();

      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa', { durationSeconds: 45 }),
        makeSource('bbbbbbbbbbb', { durationSeconds: 180 }),
        makeSource('ccccccccccc', { durationSeconds: 181 }),
      ]);

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        discovered: 3,
        imported: 1,
        skipped: 2,
        skippedShorts: 2,
        failed: 0,
        shortsMaxDurationSeconds: 180,
      });
      expect(summary.warnings).toHaveLength(2);
      expect(summary.warnings[0].reason).toContain('Skipped YouTube Short');
      expect(videos.createDraft).toHaveBeenCalledTimes(1);
      expect(videos.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeVideoId: 'ccccccccccc',
          duration: 181,
        }),
        expect.anything(),
      );
    });

    it('honours a custom Shorts duration limit', async () => {
      const { service, youtube, videos, config } = createService();

      config.get.mockImplementation((key: string): string | undefined => {
        if (key === 'YOUTUBE_IMPORT_MAX_VIDEOS_PER_CHANNEL') {
          return '5';
        }
        if (key === 'YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS') {
          return '60';
        }
        return undefined;
      });
      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa', { durationSeconds: 45 }),
        makeSource('bbbbbbbbbbb', { durationSeconds: 90 }),
      ]);

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        imported: 1,
        skipped: 1,
        skippedShorts: 1,
        shortsMaxDurationSeconds: 60,
      });
      expect(videos.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({ youtubeVideoId: 'bbbbbbbbbbb' }),
        expect.anything(),
      );
    });

    it('can disable the Shorts filter with 0', async () => {
      const { service, youtube, config } = createService();

      config.get.mockImplementation((key: string): string | undefined => {
        if (key === 'YOUTUBE_IMPORT_MAX_VIDEOS_PER_CHANNEL') {
          return '5';
        }
        if (key === 'YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS') {
          return '0';
        }
        return undefined;
      });
      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa', { durationSeconds: 30 }),
      ]);

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        imported: 1,
        skipped: 0,
        skippedShorts: 0,
        shortsMaxDurationSeconds: 0,
      });
    });
  });

  describe('AI handling', () => {
    it('uses a minimal source-only draft when AI is not configured', async () => {
      const { service, youtube, ai, videos } = createService();

      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa', { title: 'Source title' }),
      ]);
      ai.isConfigured.mockReturnValue(false);

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({ imported: 1, failed: 0 });
      expect(ai.suggest).not.toHaveBeenCalled();
      expect(videos.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Source title',
          categories: [],
          tags: [],
          speakers: [],
        }),
        expect.anything(),
      );
    });

    it('falls back to source metadata when the AI request fails', async () => {
      const { service, youtube, ai, videos } = createService();

      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa', {
          title: 'Source title',
          description: 'Source description',
        }),
      ]);
      ai.isConfigured.mockReturnValue(true);
      ai.suggest.mockRejectedValue(new Error('AI is down'));

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        discovered: 1,
        imported: 1,
        skipped: 0,
        failed: 0,
      });
      expect(summary.warnings).toHaveLength(1);
      expect(summary.warnings[0].reason).toContain('AI is down');

      expect(videos.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Source title',
          description: 'Source description',
          categories: [],
          tags: [],
          speakers: [],
        }),
        expect.anything(),
      );
    });

    it('only keeps suggested ids that exist in the active catalog', async () => {
      const { service, youtube, ai, videos, categories, tags, speakers } =
        createService();

      youtube.listRecentVideos.mockResolvedValue([makeSource('aaaaaaaaaaa')]);
      ai.isConfigured.mockReturnValue(true);
      ai.suggest.mockResolvedValue({
        title: 'Suggested title',
        description: 'Suggested description',
        categoryIds: [CATEGORY_ID, 'not-a-real-id'],
        tagIds: [TAG_ID],
        speakerIds: ['not-a-real-id', SPEAKER_ID],
      });

      categories.findActiveOptions.mockResolvedValue([
        { _id: CATEGORY_ID, name: 'Adhkar', nameAr: '', nameEn: 'Adhkar' },
      ]);
      tags.findAll.mockResolvedValue([
        { _id: TAG_ID, name: 'Dua', nameAr: '', nameEn: 'Dua' },
      ]);
      speakers.findActiveOptions.mockResolvedValue([
        { _id: SPEAKER_ID, name: 'Speaker', nameAr: '', nameEn: 'Speaker' },
      ]);

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary.imported).toBe(1);
      expect(videos.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Suggested title',
          description: 'Suggested description',
          categories: [CATEGORY_ID],
          tags: [TAG_ID],
          speakers: [SPEAKER_ID],
        }),
        expect.anything(),
      );
    });
  });

  describe('run guards and errors', () => {
    it('rejects a second run while one is in progress', async () => {
      const { service, youtube } = createService();

      (service as unknown as { running: boolean }).running = true;

      await expect(service.run(ADMIN_ID, [CHANNEL_ID])).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(youtube.listRecentVideos).not.toHaveBeenCalled();
    });

    it('rejects a run without valid channel ids', async () => {
      const { service, youtube } = createService();

      await expect(service.run(ADMIN_ID, ['UC-broken'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(youtube.listRecentVideos).not.toHaveBeenCalled();
    });

    it('refuses to run without a YouTube API key', async () => {
      const { service, youtube } = createService();

      youtube.isConfigured.mockReturnValue(false);

      await expect(service.run(ADMIN_ID, [CHANNEL_ID])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('continues with other videos when one create fails', async () => {
      const { service, youtube, videos } = createService();

      youtube.listRecentVideos.mockResolvedValue([
        makeSource('aaaaaaaaaaa'),
        makeSource('bbbbbbbbbbb'),
      ]);
      videos.createDraft
        .mockRejectedValueOnce(new Error('database write failed'))
        .mockResolvedValue({});

      const summary = await service.run(ADMIN_ID, [CHANNEL_ID]);

      expect(summary).toMatchObject({
        discovered: 2,
        imported: 1,
        skipped: 0,
        failed: 1,
      });
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toMatchObject({
        youtubeVideoId: 'aaaaaaaaaaa',
        reason: 'database write failed',
      });
    });

    it('continues with other channels when one channel fails', async () => {
      const { service, youtube } = createService();

      youtube.listRecentVideos
        .mockRejectedValueOnce(new Error('channel not found'))
        .mockResolvedValue([makeSource('aaaaaaaaaaa')]);

      const summary = await service.run(ADMIN_ID, [
        CHANNEL_ID,
        OTHER_CHANNEL_ID,
      ]);

      expect(summary).toMatchObject({
        channels: 2,
        discovered: 1,
        imported: 1,
        failed: 0,
      });
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toMatchObject({
        channelId: CHANNEL_ID,
        reason: 'channel not found',
      });
    });
  });
});
