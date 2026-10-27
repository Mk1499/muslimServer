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

export interface YoutubeVideoReference {
  _id: Types.ObjectId;
  youtubeVideoId: string;
  speakers: Types.ObjectId[];
  status: VideoStatus;
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
    let info;
    try {
      info = await youtube.getInfo(createVideoDto.youtubeVideoId);
    } catch (err) {
      console.error('Erorr while fetching video info : ', err);
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
        (createVideoDto.description ||
          (info?.basic_info && info?.basic_info?.short_description)) ??
        '',
      youtubeVideoId: createVideoDto.youtubeVideoId,
      duration: info?.basic_info ? info?.basic_info?.duration : 0,
      categories: categories.map((id) => new Types.ObjectId(id)),
      tags: tags.map((id) => new Types.ObjectId(id)),
      speakers: speakers.map((id) => new Types.ObjectId(id)),
      createdBy,
    });

    return video.save();
  }

  /**
   * Creates an imported video as a draft. Unlike `create`, the duration and
   * relations are supplied by the importer, so this path does not perform the
   * YouTube lookup used by the manual create flow. The importer validates the
   * relations before calling this.
   */
  async createDraft(
    dto: CreateVideoDto,
    createdBy: Types.ObjectId,
  ): Promise<VideoDocument> {
    const video = new this.videoModel({
      title: dto.title,
      description: dto.description ?? '',
      youtubeVideoId: dto.youtubeVideoId,
      duration: dto.duration ?? 0,
      categories: (dto.categories ?? []).map((id) => new Types.ObjectId(id)),
      tags: (dto.tags ?? []).map((id) => new Types.ObjectId(id)),
      speakers: (dto.speakers ?? []).map((id) => new Types.ObjectId(id)),
      status: VideoStatus.DRAFT,
      publishedAt: null,
      createdBy,
    });

    return video.save();
  }

  async update(id: string, dto: UpdateVideoDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const current = await this.videoModel
      .findById(id)
      .select('status speakers')
      .lean()
      .exec();

    if (!current) {
      throw new NotFoundException('Video not found');
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

    // Changing the speakers of a published video moves their counters too.
    if (current.status === VideoStatus.PUBLISHED && dto.speakers) {
      const before = new Set(current.speakers.map(String));
      const after = new Set(dto.speakers);

      const added = [...after].filter((speaker) => !before.has(speaker));
      const removed = [...before].filter((speaker) => !after.has(speaker));

      if (added.length > 0) {
        await this.speakersService.adjustPublishedVideosCount(added, 1);
      }

      if (removed.length > 0) {
        await this.speakersService.adjustPublishedVideosCount(removed, -1);
      }
    }

    return video;
  }

  async publish(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const current = await this.videoModel
      .findById(id)
      .select('status speakers')
      .lean()
      .exec();

    if (!current) {
      throw new NotFoundException('Video not found');
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

    // Only a real draft -> published transition changes the counter, so
    // publishing an already published video never double counts.
    if (current.status !== VideoStatus.PUBLISHED) {
      await this.speakersService.adjustPublishedVideosCount(
        current.speakers ?? [],
        1,
      );
    }

    return video;
  }

  async archive(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    const current = await this.videoModel
      .findById(id)
      .select('status speakers')
      .lean()
      .exec();

    if (!current) {
      throw new NotFoundException('Video not found');
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

    // Archiving a draft never counted, so only a published video decrements.
    if (current.status === VideoStatus.PUBLISHED) {
      await this.speakersService.adjustPublishedVideosCount(
        current.speakers ?? [],
        -1,
      );
    }

    return video;
  }

  /**
   * Adds categories/tags to several videos without removing metadata they
   * already have. Playlists use this so their categories and tags inherit down
   * to their videos.
   */
  async addMetadata(
    ids: string[],
    metadata: { categories?: string[]; tags?: string[] },
  ): Promise<void> {
    const unique = [...new Set(ids)];

    if (unique.length === 0) {
      return;
    }

    const addToSet: {
      categories?: { $each: Types.ObjectId[] };
      tags?: { $each: Types.ObjectId[] };
    } = {};

    const categories = [...new Set(metadata.categories ?? [])];
    const tags = [...new Set(metadata.tags ?? [])];

    if (categories.length > 0) {
      addToSet.categories = {
        $each: categories.map((id) => new Types.ObjectId(id)),
      };
    }

    if (tags.length > 0) {
      addToSet.tags = { $each: tags.map((id) => new Types.ObjectId(id)) };
    }

    if (Object.keys(addToSet).length === 0) {
      return;
    }

    await this.videoModel
      .updateMany({ _id: { $in: unique } }, { $addToSet: addToSet })
      .exec();
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

  /** True when every id points at an existing video, whatever its status. */
  async areExisting(ids: string[]): Promise<boolean> {
    const unique = [...new Set(ids)];

    if (unique.length === 0) {
      return true;
    }

    const count = await this.videoModel.countDocuments({
      _id: { $in: unique },
    });

    return count === unique.length;
  }

  /**
   * App-side references for the given YouTube ids: the playlist importer needs
   * their `_id` (to build the playlist), status (to leave archived videos out)
   * and speakers (to make the playlist filterable by speaker).
   */
  async findReferencesByYoutubeIds(
    youtubeVideoIds: string[],
  ): Promise<YoutubeVideoReference[]> {
    if (youtubeVideoIds.length === 0) {
      return [];
    }

    const videos = await this.videoModel
      .find({ youtubeVideoId: { $in: youtubeVideoIds } })
      .select('youtubeVideoId speakers status')
      .lean()
      .exec();

    return videos.map((video) => ({
      _id: video._id,
      youtubeVideoId: video.youtubeVideoId,
      speakers: video.speakers ?? [],
      status: video.status,
    }));
  }

  /**
   * The subset of the given YouTube ids that are already in the collection.
   * One query for the whole batch, used by the importer to skip duplicates.
   */
  async findExistingYoutubeIds(
    youtubeVideoIds: string[],
  ): Promise<Set<string>> {
    if (youtubeVideoIds.length === 0) {
      return new Set();
    }

    const videos = await this.videoModel
      .find({ youtubeVideoId: { $in: youtubeVideoIds } })
      .select('youtubeVideoId')
      .lean()
      .exec();

    return new Set(videos.map((video) => video.youtubeVideoId));
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

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }

    // Deleting a published video removes one published video from each of its
    // speakers, so the counter has to follow.
    const video = await this.videoModel
      .findById(id)
      .select('status speakers')
      .lean()
      .exec();

    const result = await this.videoModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Video not found');
    }

    if (video?.status === VideoStatus.PUBLISHED) {
      await this.speakersService.adjustPublishedVideosCount(
        video.speakers ?? [],
        -1,
      );
    }
  }
}
