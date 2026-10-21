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
        .select('name bio imageUrl')
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
