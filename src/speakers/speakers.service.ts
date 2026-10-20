import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateSpeakerDto } from './dto/create-speaker.dto';
import { Speaker, SpeakerDocument } from './schemas/speaker.schema';
import { GetSpeakersDto } from './dto/get-speakers.dto';

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
}
