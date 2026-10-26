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
import { GetRelatedVideosDto } from './dto/get-related-videos.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { CategoriesService } from 'src/categories/categories.service';
import { TagsService } from 'src/tags/tags.service';
import { SpeakersService } from 'src/speakers/speakers.service';
import { Innertube } from 'youtubei.js';
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
    const youtube = await Innertube.create();
    let info = {};
    try {
     info = await youtube.getInfo(createVideoDto.youtubeVideoId);
    } catch(err){
      console.error("Erorr while fetching video info : ", err)
    }

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
      description:
        (createVideoDto.description || (info?.basic_info && info?.basic_info?.short_description)) ??
        '',
      youtubeVideoId: createVideoDto.youtubeVideoId,
      duration:info?.basic_info ?  info?.basic_info?.duration : 0,
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
        .select(
          'title description youtubeVideoId publishedAt views duration isFeatured likes dislikes',
        )
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
        .select(
          'title description youtubeVideoId publishedAt views duration isFeatured likes dislikes',
        )
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('speakers categories tags')
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

  async findFeatured(query: GetVideosQueryDto) {
    const { limit, page } = query ?? {};
    const skip = (page - 1) * limit;

    const filter = { isFeatured: true, ...speakerFilter(query) };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('speakers categories tags')
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

  async findMostViewed(query: GetVideosQueryDto) {
    const { limit, page } = query ?? {};
    const skip = (page - 1) * limit;
    const filter = { status: VideoStatus.PUBLISHED, ...speakerFilter(query) };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
        .sort({ views: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('speakers categories tags')
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

  async findLatest(query: GetVideosQueryDto) {
    const { limit, page } = query ?? {};
    const skip = (page - 1) * limit;
    const filter = { status: VideoStatus.PUBLISHED, ...speakerFilter(query) };

    const [videos, total] = await Promise.all([
      this.videoModel
        .find(filter)
        .select('title description youtubeVideoId publishedAt views duration')
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('speakers categories tags')
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

  /**
   * Videos to watch next: published videos that share categories, tags or
   * speakers with the given one, ranked by how many of those they share.
   * Videos with nothing in common are not related and are left out.
   *
   * The ranking is done in an aggregation so the database does the scoring
   * and pagination; only the page's ids are then loaded and populated, which
   * keeps the populated shape identical to the other public lists.
   */
  async findRelated(id: string, query: GetRelatedVideosDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const video = await this.videoModel
      .findById(id)
      .select('categories tags speakers status')
      .lean()
      .exec();

    // Only published videos are public, so only they have a related list.
    if (!video || video.status !== VideoStatus.PUBLISHED) {
      throw new NotFoundException('Video not found');
    }

    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [result] = await this.videoModel
      .aggregate<{
        data: { _id: Types.ObjectId }[];
        total: { count: number }[];
      }>([
        {
          $match: {
            _id: { $ne: new Types.ObjectId(id) },
            status: VideoStatus.PUBLISHED,
          },
        },
        {
          $addFields: {
            score: {
              $add: [
                {
                  $size: {
                    $setIntersection: [
                      { $ifNull: ['$categories', []] },
                      video.categories ?? [],
                    ],
                  },
                },
                {
                  $size: {
                    $setIntersection: [
                      { $ifNull: ['$tags', []] },
                      video.tags ?? [],
                    ],
                  },
                },
                {
                  $size: {
                    $setIntersection: [
                      { $ifNull: ['$speakers', []] },
                      video.speakers ?? [],
                    ],
                  },
                },
              ],
            },
          },
        },
        { $match: { score: { $gt: 0 } } },
        {
          $facet: {
            data: [
              { $sort: { score: -1, publishedAt: -1, _id: -1 } },
              { $skip: skip },
              { $limit: limit },
              { $project: { _id: 1 } },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const total = result.total[0]?.count ?? 0;
    const ids = result.data.map((related) => related._id);

    if (ids.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const videos = await this.videoModel
      .find({ _id: { $in: ids } })
      .select(
        'title description youtubeVideoId categories tags speakers publishedAt views duration isFeatured likes dislikes',
      )
      .populate('speakers categories tags')
      .lean()
      .exec();

    // `$in` does not preserve the ranking order, so restore it.
    const byId = new Map(videos.map((found) => [String(found._id), found]));

    return {
      data: ids.map((relatedId) => byId.get(String(relatedId))).filter(Boolean),
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
