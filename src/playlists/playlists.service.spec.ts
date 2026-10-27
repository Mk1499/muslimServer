import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PlaylistsService } from './playlists.service';

interface FakePlaylistPayload {
  youtubePlaylistId?: string;
  title?: string;
  description?: string;
  videos?: Types.ObjectId[];
  speakers?: Types.ObjectId[];
  categories?: Types.ObjectId[];
  tags?: Types.ObjectId[];
  isActive?: boolean;
  createdBy?: Types.ObjectId;
}

class FakePlaylistModel {
  static existing: { _id: Types.ObjectId } | null = null;
  static saved: FakePlaylistPayload | null = null;
  static updated: Record<string, unknown> | null = null;
  static updateResult: unknown = null;

  static findOne = jest.fn(() => ({
    select: () => ({
      lean: () => ({
        exec: () => Promise.resolve(FakePlaylistModel.existing),
      }),
    }),
  }));

  static findByIdAndUpdate = jest.fn(
    (_id: Types.ObjectId, update: { $set: Record<string, unknown> }) => {
      FakePlaylistModel.updated = update.$set;
      return {
        exec: () => Promise.resolve(FakePlaylistModel.updateResult),
      };
    },
  );

  constructor(payload: FakePlaylistPayload) {
    FakePlaylistModel.saved = payload;
  }

  save = jest.fn(() =>
    Promise.resolve({
      _id: new Types.ObjectId(),
      ...(FakePlaylistModel.saved ?? {}),
    }),
  );
}

function createService() {
  const videos = {
    arePublished: jest.fn().mockResolvedValue(false),
    areExisting: jest.fn().mockResolvedValue(true),
    addMetadata: jest.fn().mockResolvedValue(undefined),
  };
  const speakers = {
    areActive: jest.fn().mockResolvedValue(true),
  };
  const categories = {
    areActive: jest.fn().mockResolvedValue(true),
  };
  const tags = {
    areActive: jest.fn().mockResolvedValue(true),
  };
  const service = new PlaylistsService(
    FakePlaylistModel as never,
    videos as never,
    speakers as never,
    categories as never,
    tags as never,
  );

  return { service, videos, speakers, categories, tags };
}

describe('PlaylistsService.upsertImported', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakePlaylistModel.existing = null;
    FakePlaylistModel.saved = null;
    FakePlaylistModel.updated = null;
    FakePlaylistModel.updateResult = null;
  });

  it('creates an imported playlist that may contain drafts', async () => {
    const { service, videos, speakers } = createService();
    const createdBy = new Types.ObjectId();
    const videoId = new Types.ObjectId();
    const speakerId = new Types.ObjectId();

    const result = await service.upsertImported(
      {
        youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        title: 'Imported playlist',
        description: 'Description',
        videos: [videoId.toHexString()],
        speakers: [speakerId.toHexString()],
      },
      createdBy,
    );

    expect(result.created).toBe(true);
    expect(videos.areExisting).toHaveBeenCalledWith([videoId.toHexString()]);
    expect(videos.arePublished).not.toHaveBeenCalled();
    expect(speakers.areActive).toHaveBeenCalledWith([speakerId.toHexString()]);
    expect(FakePlaylistModel.saved).toMatchObject({
      youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      title: 'Imported playlist',
      description: 'Description',
      videos: [videoId],
      speakers: [speakerId],
      isActive: true,
      createdBy,
    });
  });

  it('updates the same playlist on a re-import', async () => {
    const { service } = createService();
    const playlistId = new Types.ObjectId();
    const videoId = new Types.ObjectId();

    FakePlaylistModel.existing = { _id: playlistId };
    FakePlaylistModel.updateResult = { _id: playlistId, title: 'Updated' };

    const result = await service.upsertImported(
      {
        youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        title: 'Updated',
        description: 'New description',
        videos: [videoId.toHexString()],
        speakers: [],
      },
      new Types.ObjectId(),
    );

    expect(result.created).toBe(false);
    expect(FakePlaylistModel.updated).toMatchObject({
      youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      title: 'Updated',
      description: 'New description',
      videos: [videoId],
      speakers: [],
    });
    expect(FakePlaylistModel.updated).not.toHaveProperty('createdBy');
    expect(FakePlaylistModel.updated).not.toHaveProperty('isActive');
    // Omitted metadata keeps whatever the playlist already had.
    expect(FakePlaylistModel.updated).not.toHaveProperty('categories');
    expect(FakePlaylistModel.updated).not.toHaveProperty('tags');
  });

  it('rejects videos that do not exist', async () => {
    const { service, videos } = createService();
    videos.areExisting.mockResolvedValue(false);

    await expect(
      service.upsertImported(
        {
          youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          title: 'Imported playlist',
          description: '',
          videos: [new Types.ObjectId().toHexString()],
          speakers: [],
        },
        new Types.ObjectId(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive speakers', async () => {
    const { service, speakers } = createService();
    speakers.areActive.mockResolvedValue(false);

    await expect(
      service.upsertImported(
        {
          youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          title: 'Imported playlist',
          description: '',
          videos: [],
          speakers: [new Types.ObjectId().toHexString()],
        },
        new Types.ObjectId(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('inherits its categories and tags into the playlist videos', async () => {
    const { service, videos } = createService();
    const playlistId = new Types.ObjectId();
    const videoId = new Types.ObjectId();
    const categoryId = new Types.ObjectId();
    const tagId = new Types.ObjectId();

    FakePlaylistModel.existing = { _id: playlistId };
    FakePlaylistModel.updateResult = {
      _id: playlistId,
      videos: [videoId],
      categories: [categoryId],
      tags: [tagId],
    };

    await service.upsertImported(
      {
        youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        title: 'Imported playlist',
        description: '',
        videos: [videoId.toHexString()],
        speakers: [],
        categories: [categoryId.toHexString()],
        tags: [tagId.toHexString()],
      },
      new Types.ObjectId(),
    );

    expect(FakePlaylistModel.updated).toMatchObject({
      categories: [categoryId],
      tags: [tagId],
    });
    expect(videos.addMetadata).toHaveBeenCalledWith([videoId.toHexString()], {
      categories: [categoryId.toHexString()],
      tags: [tagId.toHexString()],
    });
  });
});

describe('PlaylistsService.create/update metadata inheritance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakePlaylistModel.existing = null;
    FakePlaylistModel.saved = null;
    FakePlaylistModel.updated = null;
    FakePlaylistModel.updateResult = null;
  });

  it('stores playlist categories/tags and merges them into its videos', async () => {
    const { service, videos, categories, tags } = createService();
    videos.arePublished.mockResolvedValue(true);

    const videoId = new Types.ObjectId();
    const categoryId = new Types.ObjectId();
    const tagId = new Types.ObjectId();

    await service.create(
      {
        title: 'Series',
        videos: [videoId.toHexString()],
        categories: [categoryId.toHexString()],
        tags: [tagId.toHexString()],
      },
      new Types.ObjectId(),
    );

    expect(categories.areActive).toHaveBeenCalledWith([
      categoryId.toHexString(),
    ]);
    expect(tags.areActive).toHaveBeenCalledWith([tagId.toHexString()]);
    expect(FakePlaylistModel.saved).toMatchObject({
      categories: [categoryId],
      tags: [tagId],
    });
    expect(videos.addMetadata).toHaveBeenCalledWith([videoId.toHexString()], {
      categories: [categoryId.toHexString()],
      tags: [tagId.toHexString()],
    });
  });

  it('rejects inactive categories', async () => {
    const { service, videos, categories } = createService();
    videos.arePublished.mockResolvedValue(true);
    categories.areActive.mockResolvedValue(false);

    await expect(
      service.create(
        {
          title: 'Series',
          categories: [new Types.ObjectId().toHexString()],
        },
        new Types.ObjectId(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('merges the playlist categories/tags into its videos on update', async () => {
    const { service, videos } = createService();
    const playlistId = new Types.ObjectId();
    const videoId = new Types.ObjectId();
    const categoryId = new Types.ObjectId();
    const tagId = new Types.ObjectId();

    FakePlaylistModel.updateResult = {
      _id: playlistId,
      videos: [videoId],
      categories: [categoryId],
      tags: [tagId],
    };

    await service.update(playlistId.toHexString(), {
      categories: [categoryId.toHexString()],
      tags: [tagId.toHexString()],
    });

    expect(videos.addMetadata).toHaveBeenCalledWith([videoId.toHexString()], {
      categories: [categoryId.toHexString()],
      tags: [tagId.toHexString()],
    });
  });
});
