import { Types } from 'mongoose';

import { VideoStatus } from './schemas/video.schema';
import { VideosService } from './videos.service';

// youtubei.js is ESM-only and is not used by the draft path; replace it so the
// unit test does not load it.
jest.mock('youtubei.js', () => ({
  Innertube: { create: jest.fn() },
}));

interface SavedDraft {
  title?: string;
  description?: string;
  youtubeVideoId?: string;
  duration?: number;
  status?: VideoStatus;
  publishedAt?: Date | null;
  createdBy?: Types.ObjectId;
  categories?: Types.ObjectId[];
  tags?: Types.ObjectId[];
  speakers?: Types.ObjectId[];
}

class FakeVideoModel {
  static lastPayload: SavedDraft = {};

  constructor(payload: SavedDraft) {
    FakeVideoModel.lastPayload = payload;
  }

  save = jest.fn(() =>
    Promise.resolve({
      _id: new Types.ObjectId(),
      ...FakeVideoModel.lastPayload,
    }),
  );
}

describe('VideosService.createDraft', () => {
  it('creates a draft with no publishedAt', async () => {
    const service = new VideosService(
      FakeVideoModel as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const adminId = new Types.ObjectId();
    const categoryId = new Types.ObjectId().toHexString();
    const tagId = new Types.ObjectId().toHexString();
    const speakerId = new Types.ObjectId().toHexString();

    await service.createDraft(
      {
        title: 'Imported title',
        description: 'Imported description',
        youtubeVideoId: 'aaaaaaaaaaa',
        duration: 125,
        categories: [categoryId],
        tags: [tagId],
        speakers: [speakerId],
      },
      adminId,
    );

    expect(FakeVideoModel.lastPayload.status).toBe(VideoStatus.DRAFT);
    expect(FakeVideoModel.lastPayload.publishedAt).toBeNull();
    expect(FakeVideoModel.lastPayload.createdBy).toBe(adminId);
    expect(FakeVideoModel.lastPayload.duration).toBe(125);
    expect(FakeVideoModel.lastPayload.youtubeVideoId).toBe('aaaaaaaaaaa');
    expect(FakeVideoModel.lastPayload.categories).toEqual([
      new Types.ObjectId(categoryId),
    ]);
    expect(FakeVideoModel.lastPayload.tags).toEqual([
      new Types.ObjectId(tagId),
    ]);
    expect(FakeVideoModel.lastPayload.speakers).toEqual([
      new Types.ObjectId(speakerId),
    ]);
  });
});

interface FakeStatusDocument {
  status: VideoStatus;
  speakers: Types.ObjectId[];
}

class FakeStatusVideoModel {
  static current: FakeStatusDocument | null = null;
  static updated: Record<string, unknown> | null = null;
  static deleteResult = { deletedCount: 1 };

  findById = jest.fn(() => ({
    select: () => ({
      lean: () => ({
        exec: () => Promise.resolve(FakeStatusVideoModel.current),
      }),
    }),
  }));

  findByIdAndUpdate = jest.fn(() => ({
    exec: () => Promise.resolve(FakeStatusVideoModel.updated),
  }));

  deleteOne = jest.fn(() => ({
    exec: () => Promise.resolve(FakeStatusVideoModel.deleteResult),
  }));
}

describe('VideosService speaker published counts', () => {
  let speakerId: Types.ObjectId;
  let speakersService: { adjustPublishedVideosCount: jest.Mock };

  beforeEach(() => {
    speakerId = new Types.ObjectId();
    FakeStatusVideoModel.current = {
      status: VideoStatus.DRAFT,
      speakers: [speakerId],
    };
    FakeStatusVideoModel.updated = {
      _id: new Types.ObjectId(),
      status: VideoStatus.PUBLISHED,
    };
    FakeStatusVideoModel.deleteResult = { deletedCount: 1 };
    speakersService = {
      adjustPublishedVideosCount: jest.fn().mockResolvedValue(undefined),
    };
  });

  function createService(): VideosService {
    return new VideosService(
      new FakeStatusVideoModel() as unknown as never,
      {} as never,
      {} as never,
      speakersService as never,
    );
  }

  it('increments every speaker when a draft is published', async () => {
    await createService().publish(speakerId.toHexString());

    expect(speakersService.adjustPublishedVideosCount).toHaveBeenCalledWith(
      [speakerId],
      1,
    );
  });

  it('does not count again when an already published video is published', async () => {
    FakeStatusVideoModel.current = {
      status: VideoStatus.PUBLISHED,
      speakers: [speakerId],
    };

    await createService().publish(speakerId.toHexString());

    expect(speakersService.adjustPublishedVideosCount).not.toHaveBeenCalled();
  });

  it('decrements every speaker when a published video is archived', async () => {
    FakeStatusVideoModel.current = {
      status: VideoStatus.PUBLISHED,
      speakers: [speakerId],
    };

    await createService().archive(speakerId.toHexString());

    expect(speakersService.adjustPublishedVideosCount).toHaveBeenCalledWith(
      [speakerId],
      -1,
    );
  });

  it('does not decrement when a draft is archived', async () => {
    await createService().archive(speakerId.toHexString());

    expect(speakersService.adjustPublishedVideosCount).not.toHaveBeenCalled();
  });

  it('decrements every speaker when a published video is deleted', async () => {
    FakeStatusVideoModel.current = {
      status: VideoStatus.PUBLISHED,
      speakers: [speakerId],
    };

    await createService().delete(speakerId.toHexString());

    expect(speakersService.adjustPublishedVideosCount).toHaveBeenCalledWith(
      [speakerId],
      -1,
    );
  });

  it('moves counters when a published video changes its speakers', async () => {
    const kept = speakerId;
    const added = new Types.ObjectId();
    const removed = new Types.ObjectId();
    FakeStatusVideoModel.current = {
      status: VideoStatus.PUBLISHED,
      speakers: [kept, removed],
    };

    await createService().update(new Types.ObjectId().toHexString(), {
      speakers: [kept.toHexString(), added.toHexString()],
    });

    expect(speakersService.adjustPublishedVideosCount).toHaveBeenCalledWith(
      [added.toHexString()],
      1,
    );
    expect(speakersService.adjustPublishedVideosCount).toHaveBeenCalledWith(
      [removed.toHexString()],
      -1,
    );
  });

  it('leaves counters alone when a draft changes its speakers', async () => {
    FakeStatusVideoModel.current = {
      status: VideoStatus.DRAFT,
      speakers: [speakerId],
    };

    await createService().update(new Types.ObjectId().toHexString(), {
      speakers: [new Types.ObjectId().toHexString()],
    });

    expect(speakersService.adjustPublishedVideosCount).not.toHaveBeenCalled();
  });
});
