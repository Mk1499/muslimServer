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
import { CategoriesService } from 'src/categories/categories.service';
import { TagsService } from 'src/tags/tags.service';
import { SpeakersService } from 'src/speakers/speakers.service';

/**
 * Restricts a list query to the videos credited to one speaker. The DTO
 * already guarantees `speaker` is a valid ObjectId when present.
 */
function speakerFilter(query: GetVideosQueryDto): Record<string, unknown> {
  if (!query.speaker || !Types.ObjectId.isValid(query.speaker)) {
    return {};
  }
  return { speakers: new Types.ObjectId(query.speaker) };
}

@Injectable()
export class VideosService {
  constructor(
    @InjectModel(Video.name)
    private readonly videoModel: Model<VideoDocument>,
    private readonly categoriesService: CategoriesService,
    private readonly tagsService: TagsService,
    private readonly speakersService: SpeakersService,
  ) {}

  async create(
    createVideoDto: CreateVideoDto,
    createdBy: Types.ObjectId,
  ): Promise<VideoDocument> {
    const categories = createVideoDto.categories ?? [];
    const tags = createVideoDto.tags ?? [];
    const speakers = createVideoDto.speakers ?? [];

    const [categoriesValid, tagsValid, speakersValid] = await Promise.all([
      this.categoriesService.areActive(categories),
      this.tagsService.areActive(tags),
      this.speakersService.areActive(speakers),
    ]);

    if (!categoriesValid) {
      throw new BadRequestException(
        'One or more categories do not exist or are inactive',
      );
    }

    if (!tagsValid) {
      throw new BadRequestException(
        'One or more tags do not exist or are inactive',
      );
    }

    if (!speakersValid) {
      throw new BadRequestException(
        'One or more speakers do not exist or are inactive',
      );
    }

    const video = new this.videoModel({
      title: createVideoDto.title,
      description: createVideoDto.description,
      youtubeVideoId: createVideoDto.youtubeVideoId,
      duration: createVideoDto.duration ?? 0,
      categories: categories.map((id) => new Types.ObjectId(id)),
      tags: tags.map((id) => new Types.ObjectId(id)),
      speakers: speakers.map((id) => new Types.ObjectId(id)),
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

  async arePublished(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }

    const count = await this.videoModel.countDocuments({
      _id: { $in: ids },
      status: VideoStatus.PUBLISHED,
    });

    return count === ids.length;
  }

  async findAll(query: GetVideosQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const filter = speakerFilter(query);

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
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

  async findPublished(query: GetVideosQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const filter = { status: VideoStatus.PUBLISHED, ...speakerFilter(query) };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
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

    const filter = { status: VideoStatus.ARCHIVED, ...speakerFilter(query) };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
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

    const filter = { status: VideoStatus.DRAFT, ...speakerFilter(query) };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
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
        'title description youtubeVideoId categories tags speakers publishedAt views duration',
      )
      .lean()
      .exec();

    if (!video) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }

  /**
   * Counts a view and returns the video to watch. The increment and the read
   * are a single atomic `findOneAndUpdate`, so concurrent watches cannot
   * lose a count and the response always carries the post-increment value.
   *
   * Only published videos are counted — drafts and archived videos are not
   * publicly watchable, so they are not found here.
   *
   * The speakers credited on the video are credited with the view too, so a
   * speaker's count follows the reach of their videos.
   */
  async watch(id: string): Promise<VideoDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const video = await this.videoModel
      .findOneAndUpdate(
        { _id: id, status: VideoStatus.PUBLISHED },
        { $inc: { views: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .select(
        'title description youtubeVideoId categories tags speakers publishedAt views duration',
      )
      .lean()
      .exec();

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    await this.speakersService.incrementViews(video.speakers);

    return video;
  }
}
