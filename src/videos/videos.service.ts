import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateVideoDto } from './dto/create-video.dto';
import { Video, VideoDocument } from './schemas/video.schema';

@Injectable()
export class VideosService {
  constructor(
    @InjectModel(Video.name)
    private readonly videoModel: Model<VideoDocument>,
  ) {}

  async create(
    createVideoDto: CreateVideoDto,
    createdBy: Types.ObjectId,
  ): Promise<VideoDocument> {
    const video = new this.videoModel({
      ...createVideoDto,
      createdBy,
    });

    return video.save();
  }
}
