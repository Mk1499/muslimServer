import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateVideoDto } from './dto/create-video.dto';
import { Video, VideoDocument } from './schemas/video.schema';
import { VideoStatus } from './schemas/video.schema';
import { GetVideosQueryDto } from './dto/get-videos-query.dto';
import { UpdateVideoDto } from './dto/update-video.dto';

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

  async update(id: string, dto: UpdateVideoDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }
    const video = await this.videoModel
      .findByIdAndUpdate(
        id,
        { $set: dto },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    return video;
  }

  async publish(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const video = await this.videoModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: VideoStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    return video;
  }

  async archive(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const video = await this.videoModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: VideoStatus.ARCHIVED,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    return video;
  }

  async findAll(query: GetVideosQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [videos, total] = await Promise.all([
      this.videoModel
        .find()
        .select('title description youtubeVideoId publishedAt')
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),

      this.videoModel.countDocuments().exec(),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublished(query: GetVideosQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const filter = { status: VideoStatus.PUBLISHED };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt')
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),

      this.videoModel.countDocuments(filter).exec(),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findArchived(query: GetVideosQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const filter = { status: VideoStatus.ARCHIVED };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt')
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),

      this.videoModel.countDocuments(filter).exec(),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findDraft(query: GetVideosQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const filter = { status: VideoStatus.DRAFT };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt')
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),

      this.videoModel.countDocuments(filter).exec(),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublishedById(id: string): Promise<VideoDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }
    const video = await this.videoModel
      .findOne({ _id: id, status: VideoStatus.PUBLISHED })
      .select(
        'title description youtubeVideoId categories tags speakers publishedAt',
      )
      .lean()
      .exec();

    if (!video) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }
}
