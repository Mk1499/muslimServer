import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PlaylistsService } from './playlists.service';

interface FakePlaylistPayload {
  youtubePlaylistId?: string;
  title?: string;
  description?: string;
  videos?: Types.ObjectId[];
  speakers?: Types.ObjectId[];
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
  };
  const speakers = {
    areActive: jest.fn().mockResolvedValue(true),
  };
  const service = new PlaylistsService(
    FakePlaylistModel as never,
    videos as never,
    speakers as never,
  );

  return { service, videos, speakers };
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
});
