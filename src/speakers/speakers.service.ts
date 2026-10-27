import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateSpeakerDto } from './dto/create-speaker.dto';
import { Speaker, SpeakerDocument } from './schemas/speaker.schema';
import { GetSpeakersDto } from './dto/get-speakers.dto';
import { UpdateSpeakerDto } from './dto/update-speaker.dto';

@Injectable()
export class SpeakersService {
  constructor(
    @InjectModel(Speaker.name)
    private readonly speakerModel: Model<SpeakerDocument>,
  ) {}

  async create(
    dto: CreateSpeakerDto,
    createdBy: Types.ObjectId,
  ): Promise<SpeakerDocument> {
    const speaker = new this.speakerModel({ ...dto, createdBy });

    return speaker.save();
  }

  async findAll(query: GetSpeakersDto) {
    const { page, limit } = query;
    const [speakers, total] = await Promise.all([
      this.speakerModel
        .find({ isActive: true })
        .select(
          'name nameAr nameEn bio bioAr bioEn imageUrl instagramProfileUrl tiktokProfileUrl facebookProfileUrl youtubeProfileUrl views publishedVideosCount',
        )
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.speakerModel.countDocuments({ isActive: true }).exec(),
    ]);
    return {
      data: speakers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Minimal list of active speakers used by the importer/AI matcher. It is
   * intentionally unpaginated so id validation sees the whole catalog.
   */
  async findActiveOptions() {
    return this.speakerModel
      .find({ isActive: true })
      .select('name nameAr nameEn')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  async areActive(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }

    const count = await this.speakerModel.countDocuments({
      _id: { $in: ids },
      isActive: true,
    });

    return count === ids.length;
  }

  /**
   * Adds one view to every given speaker. Called when a video they are
   * credited on is watched, so their total follows the reach of their videos.
   */
  async incrementViews(ids: (string | Types.ObjectId)[]): Promise<void> {
    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return;
    }

    await this.speakerModel
      .updateMany({ _id: { $in: objectIds } }, { $inc: { views: 1 } })
      .exec();
  }

  /**
   * Moves `publishedVideosCount` by `delta` for every given speaker. Used when
   * a video is published (+1), archived (-1) or deleted (-1) so the speaker
   * profile can show how many published videos they take part in.
   *
   * Incrementing creates the field when an older document has none, and
   * decrementing is filtered to positive values so the counter can never go
   * below zero.
   */
  async adjustPublishedVideosCount(
    ids: (string | Types.ObjectId)[],
    delta: 1 | -1,
  ): Promise<void> {
    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return;
    }

    const filter =
      delta > 0
        ? { _id: { $in: objectIds } }
        : { _id: { $in: objectIds }, publishedVideosCount: { $gt: 0 } };

    await this.speakerModel
      .updateMany(filter, { $inc: { publishedVideosCount: delta } })
      .exec();
  }

  /**
   * Active speakers ordered by how many views their videos got — the
   * "featured" list. Only the fields a public listing needs are returned.
   */
  async findFeatured(query: GetSpeakersDto) {
    const { page, limit } = query;
    const filter = { isActive: true };

    const [speakers, total] = await Promise.all([
      this.speakerModel
        .find(filter)
        .select(
          'name nameAr nameEn bio bioAr bioEn imageUrl instagramProfileUrl tiktokProfileUrl facebookProfileUrl youtubeProfileUrl views publishedVideosCount',
        )
        .sort({ views: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.speakerModel.countDocuments(filter).exec(),
    ]);

    return {
      data: speakers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, dto: UpdateSpeakerDto, updatedBy: Types.ObjectId) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid speaker ID');
    }
    const speaker = await this.speakerModel
      .findByIdAndUpdate(
        id,
        { $set: dto },
        {
          new: true,
          runValidators: true,
        },
      )
      // `createdBy` is a String path with a `ref`, so mongoose re-casts it to
      // an ObjectId on hydrated reads and it serializes as garbage. It is an
      // internal field anyway — keep it out of the response.
      .select('-createdBy -__v')
      .exec();

    if (!speaker) {
      throw new NotFoundException('Speaker not found');
    }

    return speaker;
  }

  /**
   * Soft delete: the speaker disappears from listings and can no longer be
   * attached to new videos, while videos that already credit them keep a
   * valid reference. Restoring simply sets `isActive` back to true.
   */
  async remove(id: string): Promise<SpeakerDocument> {
    return this.setActive(id, false);
  }

  /** Undoes a soft delete. */
  async restore(id: string): Promise<SpeakerDocument> {
    return this.setActive(id, true);
  }

  private async setActive(
    id: string,
    isActive: boolean,
  ): Promise<SpeakerDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid speaker ID');
    }
    const speaker = await this.speakerModel
      .findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
      .select('-createdBy -__v')
      .exec();

    if (!speaker) {
      throw new NotFoundException('Speaker not found');
    }

    return speaker;
  }

  /**
   * One speaker by id, deleted ones included — the admin profile page must be
   * able to show (and restore) a speaker that no longer appears in the list.
   */
  async findOne(id: string): Promise<SpeakerDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid speaker ID');
    }
    const speaker = await this.speakerModel
      .findById(id)
      .select('-createdBy -__v')
      .lean()
      .exec();

    if (!speaker) {
      throw new NotFoundException('Speaker not found');
    }

    return speaker as unknown as SpeakerDocument;
  }
}
