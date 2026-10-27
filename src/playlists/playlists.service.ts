import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { GetPlaylistsDto } from './dto/get-playlists.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { Playlist, PlaylistDocument } from './schemas/playlist.schema';
import { SpeakersService } from 'src/speakers/speakers.service';
import { VideosService } from 'src/videos/videos.service';

export interface ImportedPlaylistInput {
  youtubePlaylistId: string;
  title: string;
  description: string;
  videos: string[];
  speakers: string[];
}

/**
 * Restricts a list query to the playlists owned by one speaker. The DTO
 * already guarantees `speaker` is a valid ObjectId when present.
 */
function speakerFilter(query: GetPlaylistsDto): Record<string, unknown> {
  if (!query.speaker || !Types.ObjectId.isValid(query.speaker)) {
    return {};
  }
  return { speakers: new Types.ObjectId(query.speaker) };
}

@Injectable()
export class PlaylistsService {
  constructor(
    @InjectModel(Playlist.name)
    private readonly playlistModel: Model<PlaylistDocument>,
    private readonly videosService: VideosService,
    private readonly speakersService: SpeakersService,
  ) {}

  async create(
    dto: CreatePlaylistDto,
    createdBy: Types.ObjectId,
  ): Promise<PlaylistDocument> {
    const videos = dto.videos ?? [];
    const speakers = dto.speakers ?? [];

    await this.assertMembersExist(videos, speakers);

    const playlist = new this.playlistModel({
      title: dto.title,
      description: dto.description,
      videos: videos.map((id) => new Types.ObjectId(id)),
      speakers: speakers.map((id) => new Types.ObjectId(id)),
      createdBy,
    });

    return playlist.save();
  }

  /**
   * Creates or updates the playlist produced by a YouTube playlist import.
   *
   * Unlike `create`, this path accepts draft videos: an import always starts
   * with drafts, and the playlist must exist before the admin reviews them.
   * The unique `youtubePlaylistId` index makes re-imports update the same
   * document instead of creating duplicates.
   */
  async upsertImported(
    input: ImportedPlaylistInput,
    createdBy: Types.ObjectId,
  ): Promise<{ playlist: PlaylistDocument; created: boolean }> {
    const videos = [...new Set(input.videos)];
    const speakers = [...new Set(input.speakers)];

    await this.assertImportedMembersExist(videos, speakers);

    const fields = {
      youtubePlaylistId: input.youtubePlaylistId,
      title: input.title,
      description: input.description,
      videos: videos.map((id) => new Types.ObjectId(id)),
      speakers: speakers.map((id) => new Types.ObjectId(id)),
    };

    const existing = await this.playlistModel
      .findOne({ youtubePlaylistId: input.youtubePlaylistId })
      .select('_id')
      .lean()
      .exec();

    if (existing) {
      return {
        playlist: await this.updateImported(existing._id, fields),
        created: false,
      };
    }

    const playlist = new this.playlistModel({
      ...fields,
      isActive: true,
      createdBy,
    });

    try {
      return { playlist: await playlist.save(), created: true };
    } catch (error) {
      // Another request may have created it between the lookup and the save;
      // the unique index wins and this request updates the winner.
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const winner = await this.playlistModel
        .findOne({ youtubePlaylistId: input.youtubePlaylistId })
        .select('_id')
        .lean()
        .exec();

      if (!winner) {
        throw error;
      }

      return {
        playlist: await this.updateImported(winner._id, fields),
        created: false,
      };
    }
  }

  private async updateImported(
    id: Types.ObjectId,
    fields: {
      youtubePlaylistId: string;
      title: string;
      description: string;
      videos: Types.ObjectId[];
      speakers: Types.ObjectId[];
    },
  ): Promise<PlaylistDocument> {
    const playlist = await this.playlistModel
      .findByIdAndUpdate(
        id,
        { $set: fields },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    return playlist;
  }

  async findAll(query: GetPlaylistsDto) {
    const { page, limit } = query;
    const filter = { isActive: true, ...speakerFilter(query) };

    const [playlists, total] = await Promise.all([
      this.playlistModel
        .find(filter)
        .select(
          'title description videos speakers youtubePlaylistId createdAt updatedAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.playlistModel.countDocuments(filter).exec(),
    ]);

    return {
      data: playlists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<PlaylistDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid playlist ID');
    }

    const playlist = await this.playlistModel
      .findById(id)
      .select(
        'title description videos speakers youtubePlaylistId isActive createdAt updatedAt',
      )
      .lean()
      .exec();

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    return playlist;
  }

  async update(id: string, dto: UpdatePlaylistDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid playlist ID');
    }

    if (dto.videos || dto.speakers) {
      await this.assertMembersExist(dto.videos ?? [], dto.speakers ?? []);
    }

    const playlist = await this.playlistModel
      .findByIdAndUpdate(
        id,
        { $set: dto },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    return playlist;
  }

  /**
   * Soft delete: the playlist disappears from listings but keeps its videos
   * and speakers, so restoring brings it back as it was.
   */
  async remove(id: string): Promise<PlaylistDocument> {
    return this.setActive(id, false);
  }

  /** Undoes a soft delete. */
  async restore(id: string): Promise<PlaylistDocument> {
    return this.setActive(id, true);
  }

  private async setActive(
    id: string,
    isActive: boolean,
  ): Promise<PlaylistDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid playlist ID');
    }

    const playlist = await this.playlistModel
      .findByIdAndUpdate(
        id,
        { $set: { isActive } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    return playlist;
  }

  /**
   * Imported playlists are allowed to reference draft videos, but every id must
   * still point at a real video and an active speaker.
   */
  private async assertImportedMembersExist(
    videos: string[],
    speakers: string[],
  ): Promise<void> {
    const [videosValid, speakersValid] = await Promise.all([
      this.videosService.areExisting(videos),
      this.speakersService.areActive(speakers),
    ]);

    if (!videosValid) {
      throw new BadRequestException('One or more videos do not exist');
    }

    if (!speakersValid) {
      throw new BadRequestException(
        'One or more speakers do not exist or are inactive',
      );
    }
  }

  /**
   * A playlist can only reference videos that are published and speakers
   * that exist and are active — a playlist pointing at a draft video or a
   * removed speaker would be broken for the public.
   */
  private async assertMembersExist(
    videos: string[],
    speakers: string[],
  ): Promise<void> {
    const [videosValid, speakersValid] = await Promise.all([
      this.videosService.arePublished(videos),
      this.speakersService.areActive(speakers),
    ]);

    if (!videosValid) {
      throw new BadRequestException(
        'One or more videos do not exist or are not published',
      );
    }

    if (!speakersValid) {
      throw new BadRequestException(
        'One or more speakers do not exist or are inactive',
      );
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
