import { Types } from 'mongoose';

import { SpeakersService } from './speakers.service';

class FakeSpeakerModel {
  updateMany = jest.fn(() => ({
    exec: () => Promise.resolve({ modifiedCount: 1 }),
  }));
}

function createService() {
  const model = new FakeSpeakerModel();
  const service = new SpeakersService(model as never);

  return { service, model };
}

describe('SpeakersService.adjustPublishedVideosCount', () => {
  it('increments the counter for every valid speaker id', async () => {
    const { service, model } = createService();
    const speakerId = new Types.ObjectId();

    await service.adjustPublishedVideosCount([speakerId], 1);

    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [speakerId] } },
      { $inc: { publishedVideosCount: 1 } },
    );
  });

  it('never decrements below zero', async () => {
    const { service, model } = createService();
    const speakerId = new Types.ObjectId();

    await service.adjustPublishedVideosCount([speakerId], -1);

    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [speakerId] }, publishedVideosCount: { $gt: 0 } },
      { $inc: { publishedVideosCount: -1 } },
    );
  });

  it('ignores ids that are not ObjectIds', async () => {
    const { service, model } = createService();

    await service.adjustPublishedVideosCount(['not-an-id'], 1);

    expect(model.updateMany).not.toHaveBeenCalled();
  });
});
