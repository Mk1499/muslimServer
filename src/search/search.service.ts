import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Speaker, SpeakerDocument } from '../speakers/schemas/speaker.schema';
import {
  Video,
  VideoDocument,
  VideoStatus,
} from '../videos/schemas/video.schema';
import { SearchQueryDto } from './dto/search-query.dto';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fieldMatch(fields: string[], tokens: string[]) {
  return tokens.map((token) => ({
    $or: fields.map((field) => ({ [field]: { $regex: token, $options: 'i' } })),
  }));
}

function textScore(
  fields: (string | null | undefined)[],
  query: string,
  tokens: string[],
) {
  const values = fields
    .filter((value): value is string => !!value)
    .map((value) => value.toLocaleLowerCase());
  const normalizedQuery = query.toLocaleLowerCase();
  let score = values.some((value) => value === normalizedQuery) ? 100 : 0;
  if (values.some((value) => value.startsWith(normalizedQuery))) score += 30;
  for (const token of tokens) {
    if (values.some((value) => value.includes(token))) score += 5;
  }
  return score;
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Video.name) private readonly videoModel: Model<VideoDocument>,
    @InjectModel(Speaker.name)
    private readonly speakerModel: Model<SpeakerDocument>,
  ) {}

  async search(queryDto: SearchQueryDto) {
    const query = queryDto.q.trim().replace(/\s+/g, ' ');
    const rawTokens = query.split(' ');
    const tokens = rawTokens.map(escapeRegex);
    const limit = queryDto.limit ?? 10;

    const speakers = await this.speakerModel
      .find({
        isActive: true,
        $and: fieldMatch(
          ['name', 'nameAr', 'nameEn', 'bio', 'bioAr', 'bioEn'],
          tokens,
        ),
      })
      .select(
        'name nameAr nameEn bio bioAr bioEn imageUrl views publishedVideosCount',
      )
      .limit(100)
      .lean()
      .exec();

    const videoFields = ['title', 'description', 'youtubeVideoId'];
    const videoTextMatch = { $and: fieldMatch(videoFields, tokens) };
    const matchingSpeakerIds = speakers.map(
      (speaker) => speaker._id as Types.ObjectId,
    );
    const videoConditions: Record<string, unknown>[] = [videoTextMatch];
    if (matchingSpeakerIds.length > 0) {
      videoConditions.push({ speakers: { $in: matchingSpeakerIds } });
    }

    const candidates = await this.videoModel
      .find({ status: VideoStatus.PUBLISHED, $or: videoConditions })
      .select(
        'title description youtubeVideoId publishedAt views duration isFeatured speakers',
      )
      .populate({ path: 'speakers', select: 'name nameAr nameEn imageUrl' })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(100)
      .lean()
      .exec();

    const rankedVideos = candidates
      .map((video) => {
        const speakerNames = (video.speakers ?? []).flatMap((speaker: any) => [
          speaker.name,
          speaker.nameAr,
          speaker.nameEn,
        ]);
        const score = textScore(
          [
            video.title,
            video.description,
            video.youtubeVideoId,
            ...speakerNames,
          ],
          query,
          rawTokens,
        );
        return { video, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ video }) => video);

    const rankedSpeakers = speakers
      .map((speaker) => ({
        speaker,
        score: textScore(
          [
            speaker.name,
            speaker.nameAr,
            speaker.nameEn,
            speaker.bio,
            speaker.bioAr,
            speaker.bioEn,
          ],
          query,
          rawTokens,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ speaker }) => speaker);

    return { query, videos: rankedVideos, speakers: rankedSpeakers };
  }
}
