import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Speaker, SpeakerDocument } from '../speakers/schemas/speaker.schema';
import {
  Video,
  VideoDocument,
  VideoStatus,
} from '../videos/schemas/video.schema';
import { SearchQueryDto } from './dto/search-query.dto';
import { PaginationResult } from './interfaces/search-result.interface';

type SearchField =
  | 'name'
  | 'nameAr'
  | 'nameEn'
  | 'bio'
  | 'bioAr'
  | 'bioEn'
  | 'title'
  | 'description'
  | 'youtubeVideoId';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function buildFieldMatch(fields: SearchField[], tokens: string[]) {
  return {
    $and: tokens.map((token) => ({
      $or: fields.map((field) => ({
        [field]: {
          $regex: escapeRegex(token),
          $options: 'i',
        },
      })),
    })),
  };
}

function buildScoreExpression(fields: SearchField[], query: string) {
  const escapedQuery = escapeRegex(query);
  const normalizedQuery = query.toLowerCase();

  return {
    $add: fields.flatMap((field) => [
      {
        $cond: [
          {
            $eq: [
              {
                $toLower: {
                  $ifNull: [`$${field}`, ''],
                },
              },
              normalizedQuery,
            ],
          },
          100,
          0,
        ],
      },
      {
        $cond: [
          {
            $regexMatch: {
              input: {
                $ifNull: [`$${field}`, ''],
              },
              regex: `^${escapedQuery}`,
              options: 'i',
            },
          },
          30,
          0,
        ],
      },
      {
        $cond: [
          {
            $regexMatch: {
              input: {
                $ifNull: [`$${field}`, ''],
              },
              regex: escapedQuery,
              options: 'i',
            },
          },
          5,
          0,
        ],
      },
    ]),
  };
}

function emptyPagination<T>(page: number, limit: number): PaginationResult<T> {
  return {
    data: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0,
    },
  };
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Video.name)
    private readonly videoModel: Model<VideoDocument>,
    @InjectModel(Speaker.name)
    private readonly speakerModel: Model<SpeakerDocument>,
  ) {}

  async search(queryDto: SearchQueryDto) {
    const query = normalizeQuery(queryDto.query ?? '');

    const page = Math.max(1, queryDto.page ?? 1);
    const limit = Math.min(50, Math.max(1, queryDto.limit ?? 10));

    if (!query) {
      return {
        query,
        ...emptyPagination(page, limit),
      };
    }

    const tokens = query.split(' ');

    const [videos, speakers] = await Promise.all([
      this.executeVideoSearch(query, tokens, page, limit),
      this.executeSpeakerSearch(query, tokens, page, limit),
    ]);

    return {
      query,
      videos,
      speakers,
    };
  }

  async searchVideos(queryDto: SearchQueryDto) {
    const query = normalizeQuery(queryDto.query ?? '');
    const page = Math.max(1, queryDto.page ?? 1);
    const limit = Math.min(50, Math.max(1, queryDto.limit ?? 10));

    if (!query) {
      return emptyPagination(page, limit);
    }

    return this.executeVideoSearch(query, query.split(' '), page, limit);
  }

  async searchSpeakers(queryDto: SearchQueryDto) {
    const query = normalizeQuery(queryDto.query ?? '');
    const page = Math.max(1, queryDto.page ?? 1);
    const limit = Math.min(50, Math.max(1, queryDto.limit ?? 10));

    if (!query) {
      return emptyPagination(page, limit);
    }

    return this.executeSpeakerSearch(query, query.split(' '), page, limit);
  }

  private async executeVideoSearch(
    query: string,
    tokens: string[],
    page: number,
    limit: number,
  ): Promise<PaginationResult<Record<string, unknown>>> {
    const videoFields: SearchField[] = [
      'title',
      'description',
      'youtubeVideoId',
    ];

    const pipeline = [
      {
        $match: {
          status: VideoStatus.PUBLISHED,
          ...buildFieldMatch(videoFields, tokens),
        },
      },
      {
        $addFields: {
          searchScore: buildScoreExpression(videoFields, query),
        },
      },
      {
        $sort: {
          searchScore: -1 as const,
          publishedAt: -1 as const,
          _id: -1 as const,
        },
      },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                title: 1,
                description: 1,
                youtubeVideoId: 1,
                publishedAt: 1,
                views: 1,
                duration: 1,
                isFeatured: 1,
                speakers: 1,
              },
            },
            {
              $lookup: {
                from: this.speakerModel.collection.name,
                localField: 'speakers',
                foreignField: '_id',
                pipeline: [
                  { $match: { isActive: true } },
                  {
                    $project: {
                      name: 1,
                      nameAr: 1,
                      nameEn: 1,
                      imageUrl: 1,
                    },
                  },
                ],
                as: 'speakers',
              },
            },
          ],
          metadata: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await this.videoModel
      .aggregate<{
        data: Record<string, unknown>[];
        metadata: { total: number }[];
      }>(pipeline)
      .exec();

    const data = result?.data ?? [];
    const total = result?.metadata[0]?.total ?? 0;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async executeSpeakerSearch(
    query: string,
    tokens: string[],
    page: number,
    limit: number,
  ): Promise<PaginationResult<Record<string, unknown>>> {
    const speakerFields: SearchField[] = [
      'name',
      'nameAr',
      'nameEn',
      'bio',
      'bioAr',
      'bioEn',
    ];

    const pipeline = [
      {
        $match: {
          isActive: true,
          ...buildFieldMatch(speakerFields, tokens),
        },
      },
      {
        $addFields: {
          searchScore: buildScoreExpression(
            ['name', 'nameAr', 'nameEn'],
            query,
          ),
        },
      },
      {
        $sort: {
          searchScore: -1 as const,
          _id: 1 as const,
        },
      },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                name: 1,
                nameAr: 1,
                nameEn: 1,
                bio: 1,
                bioAr: 1,
                bioEn: 1,
                imageUrl: 1,
                views: 1,
                publishedVideosCount: 1,
              },
            },
          ],
          metadata: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await this.speakerModel
      .aggregate<{
        data: Record<string, unknown>[];
        metadata: { total: number }[];
      }>(pipeline)
      .exec();

    const data = result?.data ?? [];
    const total = result?.metadata[0]?.total ?? 0;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
