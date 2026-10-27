import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { CategoriesService } from 'src/categories/categories.service';
import {
  ImportedPlaylistInput,
  PlaylistsService,
} from 'src/playlists/playlists.service';
import { SpeakersService } from 'src/speakers/speakers.service';
import { TagsService } from 'src/tags/tags.service';
import { CreateVideoDto } from 'src/videos/dto/create-video.dto';
import { VideoStatus } from 'src/videos/schemas/video.schema';
import {
  VideosService,
  YoutubeVideoReference,
} from 'src/videos/videos.service';
import {
  AiMetadataService,
  AiMetadataSuggestion,
  AiSuggestionInput,
} from 'src/video-imports/ai-metadata.service';
import {
  YouTubeDataService,
  YouTubePlaylistInfo,
  YouTubeSourceVideo,
} from 'src/video-imports/youtube-data.service';

import { PlaylistImportsService } from './playlist-imports.service';

const ADMIN_ID = new Types.ObjectId().toHexString();
const PLAYLIST_ID = `PL${'a'.repeat(32)}`;
const SPEAKER_ID = new Types.ObjectId().toHexString();
const AI_SPEAKER_ID = new Types.ObjectId().toHexString();
const CATEGORY_ID = new Types.ObjectId().toHexString();
const TAG_ID = new Types.ObjectId().toHexString();
const CHANNEL_ID = `UC${'x'.repeat(22)}`;

/** The subset of a catalog document that `toCatalogOption` reads. */
interface CatalogRow {
  _id: unknown;
  name: string;
  nameAr?: string;
  nameEn?: string;
}

/** What the mocked `createDraft` resolves to; the service only reads these. */
interface CreatedDraft {
  _id: Types.ObjectId;
  youtubeVideoId: string;
  status: VideoStatus;
  speakers: Types.ObjectId[];
}

interface ConfigMock {
  get: jest.Mock<string | undefined, [string]>;
}

interface YoutubeMock {
  isConfigured: jest.Mock<boolean, []>;
  getPlaylist: jest.Mock<Promise<YouTubePlaylistInfo>, [string]>;
  listPlaylistVideos: jest.Mock<
    Promise<YouTubeSourceVideo[]>,
    [string, number]
  >;
}

interface AiMock {
  isConfigured: jest.Mock<boolean, []>;
  suggest: jest.Mock<
    Promise<AiMetadataSuggestion | undefined>,
    [AiSuggestionInput]
  >;
}

interface VideosMock {
  findExistingYoutubeIds: jest.Mock<Promise<Set<string>>, [string[]]>;
  createDraft: jest.Mock<Promise<CreatedDraft>, [CreateVideoDto]>;
  findReferencesByYoutubeIds: jest.Mock<
    Promise<YoutubeVideoReference[]>,
    [string[]]
  >;
}

interface PlaylistsMock {
  upsertImported: jest.Mock<
    Promise<{
      playlist: {
        _id: Types.ObjectId;
        videos?: Types.ObjectId[];
        categories?: Types.ObjectId[];
        tags?: Types.ObjectId[];
      };
      created: boolean;
    }>,
    [ImportedPlaylistInput, Types.ObjectId]
  >;
}

interface CategoriesMock {
  findActiveOptions: jest.Mock<Promise<CatalogRow[]>, []>;
  areActive: jest.Mock<Promise<boolean>, [string[]]>;
}

interface TagsMock {
  findAll: jest.Mock<Promise<CatalogRow[]>, []>;
  areActive: jest.Mock<Promise<boolean>, [string[]]>;
}

interface SpeakersMock {
  findActiveOptions: jest.Mock<Promise<CatalogRow[]>, []>;
  areActive: jest.Mock<Promise<boolean>, [string[]]>;
}

const APP_IDS: Record<string, Types.ObjectId> = {
  aaaaaaaaaaa: new Types.ObjectId(),
  bbbbbbbbbbb: new Types.ObjectId(),
  ccccccccccc: new Types.ObjectId(),
};

function appId(youtubeVideoId: string): Types.ObjectId {
  return APP_IDS[youtubeVideoId] ?? new Types.ObjectId();
}

function makeSource(
  youtubeVideoId: string,
  overrides: Partial<YouTubeSourceVideo> = {},
): YouTubeSourceVideo {
  return {
    youtubeVideoId,
    title: `Source title ${youtubeVideoId}`,
    description: `Source description ${youtubeVideoId}`,
    tags: ['source-tag'],
    channelId: CHANNEL_ID,
    channelTitle: 'Channel name',
    durationSeconds: 600,
    ...overrides,
  };
}

function makeInfo(itemCount = 2): YouTubePlaylistInfo {
  return {
    youtubePlaylistId: PLAYLIST_ID,
    title: 'Playlist title',
    description: 'Playlist description',
    channelId: CHANNEL_ID,
    channelTitle: 'Playlist channel',
    itemCount,
  };
}

function createService() {
  const config: ConfigMock = {
    get: jest.fn((key: string): string | undefined => {
      if (key === 'YOUTUBE_IMPORT_SHORTS_MAX_DURATION_SECONDS') {
        return '180';
      }
      return undefined;
    }),
  };

  const youtube: YoutubeMock = {
    isConfigured: jest.fn<boolean, []>().mockReturnValue(true),
    getPlaylist: jest
      .fn<Promise<YouTubePlaylistInfo>, [string]>()
      .mockResolvedValue(makeInfo()),
    listPlaylistVideos: jest
      .fn<Promise<YouTubeSourceVideo[]>, [string, number]>()
      .mockResolvedValue([
        makeSource('aaaaaaaaaaa'),
        makeSource('bbbbbbbbbbb'),
      ]),
  };

  const ai: AiMock = {
    isConfigured: jest.fn<boolean, []>().mockReturnValue(false),
    suggest: jest.fn<
      Promise<AiMetadataSuggestion | undefined>,
      [AiSuggestionInput]
    >(),
  };

  const videos: VideosMock = {
    findExistingYoutubeIds: jest
      .fn<Promise<Set<string>>, [string[]]>()
      .mockResolvedValue(new Set<string>()),
    createDraft: jest.fn<Promise<CreatedDraft>, [CreateVideoDto]>(),
    findReferencesByYoutubeIds: jest
      .fn<Promise<YoutubeVideoReference[]>, [string[]]>()
      .mockResolvedValue([]),
  };

  videos.createDraft.mockImplementation(
    (dto: { youtubeVideoId: string; speakers?: string[] }) =>
      Promise.resolve({
        _id: appId(dto.youtubeVideoId),
        youtubeVideoId: dto.youtubeVideoId,
        status: VideoStatus.DRAFT,
        speakers: (dto.speakers ?? []).map((id) => new Types.ObjectId(id)),
      }),
  );

  const playlists: PlaylistsMock = {
    upsertImported: jest
      .fn<
        Promise<{ playlist: { _id: Types.ObjectId }; created: boolean }>,
        [ImportedPlaylistInput, Types.ObjectId]
      >()
      .mockResolvedValue({
        playlist: { _id: new Types.ObjectId() },
        created: true,
      }),
  };

  const categories: CategoriesMock = {
    findActiveOptions: jest
      .fn<Promise<CatalogRow[]>, []>()
      .mockResolvedValue([]),
    areActive: jest.fn<Promise<boolean>, [string[]]>().mockResolvedValue(true),
  };
  const tags: TagsMock = {
    findAll: jest.fn<Promise<CatalogRow[]>, []>().mockResolvedValue([]),
    areActive: jest.fn<Promise<boolean>, [string[]]>().mockResolvedValue(true),
  };
  const speakers: SpeakersMock = {
    findActiveOptions: jest
      .fn<Promise<CatalogRow[]>, []>()
      .mockResolvedValue([]),
    areActive: jest.fn<Promise<boolean>, [string[]]>().mockResolvedValue(true),
  };

  const service = new PlaylistImportsService(
    config as unknown as ConfigService,
    youtube as unknown as YouTubeDataService,
    ai as unknown as AiMetadataService,
    videos as unknown as VideosService,
    playlists as unknown as PlaylistsService,
    categories as unknown as CategoriesService,
    tags as unknown as TagsService,
    speakers as unknown as SpeakersService,
  );

  return {
    service,
    config,
    youtube,
    ai,
    videos,
    playlists,
    categories,
    tags,
    speakers,
  };
}

describe('PlaylistImportsService', () => {
  it('imports videos in YouTube order and creates a playlist', async () => {
    const { service, videos, playlists } = createService();

    const summary = await service.run(ADMIN_ID, {
      playlist: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
      speakers: [SPEAKER_ID],
    });

    expect(summary).toMatchObject({
      youtubePlaylistId: PLAYLIST_ID,
      title: 'Playlist title',
      created: true,
      imported: 2,
      playlistVideos: 2,
      skippedExisting: 0,
      failed: 0,
    });
    expect(summary.appPlaylistId).toBeTruthy();
    expect(videos.createDraft).toHaveBeenCalledTimes(2);
    expect(videos.createDraft.mock.calls[0][0]).toMatchObject({
      speakers: [SPEAKER_ID],
    });

    const [playlistInput] = playlists.upsertImported.mock.calls[0];
    expect(playlistInput.youtubePlaylistId).toBe(PLAYLIST_ID);
    expect(playlistInput.videos).toEqual([
      String(APP_IDS.aaaaaaaaaaa),
      String(APP_IDS.bbbbbbbbbbb),
    ]);
    expect(playlistInput.speakers).toEqual([SPEAKER_ID]);
  });

  it('stores playlist categories/tags and passes them to the import', async () => {
    const { service, playlists, categories, tags } = createService();
    const playlistCategory = new Types.ObjectId(CATEGORY_ID);
    const playlistTag = new Types.ObjectId(TAG_ID);

    playlists.upsertImported.mockResolvedValue({
      playlist: {
        _id: new Types.ObjectId(),
        videos: [],
        categories: [playlistCategory],
        tags: [playlistTag],
      },
      created: true,
    });

    const summary = await service.run(ADMIN_ID, {
      playlist: PLAYLIST_ID,
      categories: [CATEGORY_ID],
      tags: [TAG_ID],
    });

    expect(categories.areActive).toHaveBeenCalledWith([CATEGORY_ID]);
    expect(tags.areActive).toHaveBeenCalledWith([TAG_ID]);

    const [playlistInput] = playlists.upsertImported.mock.calls[0];
    expect(playlistInput.categories).toEqual([CATEGORY_ID]);
    expect(playlistInput.tags).toEqual([TAG_ID]);
    expect(summary.categories).toEqual([CATEGORY_ID]);
    expect(summary.tags).toEqual([TAG_ID]);
  });

  it('adds existing videos to the playlist without creating them again', async () => {
    const { service, videos, playlists } = createService();

    videos.findExistingYoutubeIds.mockResolvedValue(new Set(['aaaaaaaaaaa']));
    videos.findReferencesByYoutubeIds.mockResolvedValue([
      {
        _id: APP_IDS.aaaaaaaaaaa,
        youtubeVideoId: 'aaaaaaaaaaa',
        speakers: [],
        status: VideoStatus.DRAFT,
      },
    ]);

    const summary = await service.run(ADMIN_ID, { playlist: PLAYLIST_ID });

    expect(summary.imported).toBe(1);
    expect(summary.skippedExisting).toBe(1);
    expect(videos.createDraft).toHaveBeenCalledTimes(1);
    expect(videos.createDraft.mock.calls[0][0]).toMatchObject({
      youtubeVideoId: 'bbbbbbbbbbb',
    });

    const [playlistInput] = playlists.upsertImported.mock.calls[0];
    expect(playlistInput.videos).toEqual([
      String(APP_IDS.aaaaaaaaaaa),
      String(APP_IDS.bbbbbbbbbbb),
    ]);
  });

  it('skips YouTube Shorts and keeps the rest in order', async () => {
    const { service, youtube, videos, playlists } = createService();

    youtube.listPlaylistVideos.mockResolvedValue([
      makeSource('aaaaaaaaaaa', { durationSeconds: 120 }),
      makeSource('bbbbbbbbbbb'),
    ]);

    const summary = await service.run(ADMIN_ID, { playlist: PLAYLIST_ID });

    expect(summary).toMatchObject({
      discovered: 2,
      imported: 1,
      skippedShorts: 1,
      playlistVideos: 1,
      failed: 0,
    });
    expect(videos.createDraft).toHaveBeenCalledTimes(1);
    expect(videos.createDraft.mock.calls[0][0]).toMatchObject({
      youtubeVideoId: 'bbbbbbbbbbb',
    });

    const [playlistInput] = playlists.upsertImported.mock.calls[0];
    expect(playlistInput.videos).toEqual([String(APP_IDS.bbbbbbbbbbb)]);
  });

  it('still creates drafts when the AI fails', async () => {
    const { service, youtube, ai, videos } = createService();

    youtube.listPlaylistVideos.mockResolvedValue([makeSource('aaaaaaaaaaa')]);
    ai.isConfigured.mockReturnValue(true);
    ai.suggest.mockRejectedValue(new Error('rate limited'));
    videos.findReferencesByYoutubeIds.mockResolvedValue([
      {
        _id: APP_IDS.aaaaaaaaaaa,
        youtubeVideoId: 'aaaaaaaaaaa',
        speakers: [],
        status: VideoStatus.DRAFT,
      },
    ]);

    const summary = await service.run(ADMIN_ID, { playlist: PLAYLIST_ID });

    expect(summary.imported).toBe(1);
    expect(summary.aiFailures).toBe(1);
    expect(
      summary.warnings.some((warning) => /rate limited/.test(warning.reason)),
    ).toBe(true);
    expect(videos.createDraft.mock.calls[0][0]).toMatchObject({
      title: 'Source title aaaaaaaaaaa',
    });
  });

  it('validates AI suggestions against the active catalog', async () => {
    const { service, youtube, ai, videos, categories, tags, speakers } =
      createService();

    youtube.listPlaylistVideos.mockResolvedValue([makeSource('aaaaaaaaaaa')]);
    ai.isConfigured.mockReturnValue(true);
    ai.suggest.mockResolvedValue({
      categoryIds: [CATEGORY_ID, new Types.ObjectId().toHexString()],
      tagIds: [TAG_ID],
      speakerIds: [AI_SPEAKER_ID, new Types.ObjectId().toHexString()],
    });
    categories.findActiveOptions.mockResolvedValue([
      { _id: CATEGORY_ID, name: 'Category', nameAr: '', nameEn: '' },
    ]);
    tags.findAll.mockResolvedValue([
      { _id: TAG_ID, name: 'Tag', nameAr: '', nameEn: '' },
    ]);
    speakers.findActiveOptions.mockResolvedValue([
      { _id: AI_SPEAKER_ID, name: 'Speaker', nameAr: '', nameEn: '' },
    ]);

    await service.run(ADMIN_ID, {
      playlist: PLAYLIST_ID,
      speakers: [SPEAKER_ID],
    });

    expect(videos.createDraft.mock.calls[0][0]).toMatchObject({
      categories: [CATEGORY_ID],
      tags: [TAG_ID],
      speakers: [SPEAKER_ID, AI_SPEAKER_ID],
    });
  });

  it('reports a re-import as an update', async () => {
    const { service, playlists } = createService();

    playlists.upsertImported.mockResolvedValue({
      playlist: { _id: new Types.ObjectId() },
      created: false,
    });

    const summary = await service.run(ADMIN_ID, { playlist: PLAYLIST_ID });

    expect(summary.created).toBe(false);
  });

  it('leaves archived videos out of the playlist', async () => {
    const { service, videos, playlists } = createService();

    videos.findExistingYoutubeIds.mockResolvedValue(new Set(['aaaaaaaaaaa']));
    videos.findReferencesByYoutubeIds.mockResolvedValue([
      {
        _id: APP_IDS.aaaaaaaaaaa,
        youtubeVideoId: 'aaaaaaaaaaa',
        speakers: [],
        status: VideoStatus.ARCHIVED,
      },
    ]);

    const summary = await service.run(ADMIN_ID, { playlist: PLAYLIST_ID });

    expect(summary.skippedArchived).toBe(1);
    const [playlistInput] = playlists.upsertImported.mock.calls[0];
    expect(playlistInput.videos).toEqual([String(APP_IDS.bbbbbbbbbbb)]);
  });

  it('rejects a non-YouTube URL', async () => {
    const { service, youtube } = createService();

    await expect(
      service.run(ADMIN_ID, {
        playlist: `https://example.com/playlist?list=${PLAYLIST_ID}`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(youtube.getPlaylist).not.toHaveBeenCalled();
  });

  it('refuses to run two imports at once', async () => {
    const { service } = createService();

    (service as unknown as { running: boolean }).running = true;

    await expect(
      service.run(ADMIN_ID, { playlist: PLAYLIST_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
