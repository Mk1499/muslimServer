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
import { CategoriesService } from 'src/categories/categories.service';
import { SpeakersService } from 'src/speakers/speakers.service';
import { TagsService } from 'src/tags/tags.service';
import { VideosService } from 'src/videos/videos.service';

export interface ImportedPlaylistInput {
  youtubePlaylistId: string;
  title: string;
  description: string;
  videos: string[];
  speakers: string[];
  /** When omitted on a re-import, the stored playlist categories are kept. */
  categories?: string[];
  /** When omitted on a re-import, the stored playlist tags are kept. */
  tags?: string[];
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
    private readonly categoriesService: CategoriesService,
    private readonly tagsService: TagsService,
  ) {}

  async create(
    dto: CreatePlaylistDto,
    createdBy: Types.ObjectId,
  ): Promise<PlaylistDocument> {
    const videos = dto.videos ?? [];
    const speakers = dto.speakers ?? [];
    const categories = dto.categories ?? [];
    const tags = dto.tags ?? [];

    await Promise.all([
      this.assertMembersExist(videos, speakers),
      this.assertMetadataExist(categories, tags),
    ]);

    const playlist = new this.playlistModel({
      title: dto.title,
      description: dto.description,
      videos: videos.map((id) => new Types.ObjectId(id)),
      speakers: speakers.map((id) => new Types.ObjectId(id)),
      categories: categories.map((id) => new Types.ObjectId(id)),
      tags: tags.map((id) => new Types.ObjectId(id)),
      createdBy,
    });

    const saved = await playlist.save();

    // The playlist defines categories/tags for its videos; merge them in
    // without dropping metadata a video already has.
    await this.inheritMetadata(saved.videos, saved.categories, saved.tags);

    return saved;
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
    const categories = [...new Set(input.categories ?? [])];
    const tags = [...new Set(input.tags ?? [])];

    await Promise.all([
      this.assertImportedMembersExist(videos, speakers),
      this.assertMetadataExist(categories, tags),
    ]);

    const fields: {
      youtubePlaylistId: string;
      title: string;
      description: string;
      videos: Types.ObjectId[];
      speakers: Types.ObjectId[];
      categories?: Types.ObjectId[];
      tags?: Types.ObjectId[];
    } = {
      youtubePlaylistId: input.youtubePlaylistId,
      title: input.title,
      description: input.description,
      videos: videos.map((id) => new Types.ObjectId(id)),
      speakers: speakers.map((id) => new Types.ObjectId(id)),
    };

    // Omitting these on a re-import keeps whatever the playlist already had.
    if (input.categories !== undefined) {
      fields.categories = categories.map((id) => new Types.ObjectId(id));
    }

    if (input.tags !== undefined) {
      fields.tags = tags.map((id) => new Types.ObjectId(id));
    }

    const existing = await this.playlistModel
      .findOne({ youtubePlaylistId: input.youtubePlaylistId })
      .select('_id')
      .lean()
      .exec();

    let playlist: PlaylistDocument;
    let created = false;

    if (existing) {
      playlist = await this.updateImported(existing._id, fields);
    } else {
      const pending = new this.playlistModel({
        ...fields,
        isActive: true,
        createdBy,
      });

      try {
        playlist = await pending.save();
        created = true;
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

        playlist = await this.updateImported(winner._id, fields);
      }
    }

    // Playlist categories/tags are inherited by every video in it, including
    // videos that already existed before this import.
    await this.inheritMetadata(
      playlist.videos,
      playlist.categories,
      playlist.tags,
    );

    return { playlist, created };
  }

  private async updateImported(
    id: Types.ObjectId,
    fields: {
      youtubePlaylistId: string;
      title: string;
      description: string;
      videos: Types.ObjectId[];
      speakers: Types.ObjectId[];
      categories?: Types.ObjectId[];
      tags?: Types.ObjectId[];
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
          'title description videos speakers categories tags youtubePlaylistId createdAt updatedAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.playlistModel.countDocuments(filter).exec(),
    ]);

    const response = {
      data: playlists.map((playlist) => ({
        ...playlist,
        // Documents created before playlists had metadata do not store these
        // keys; normalize so every playlist has the same shape.
        categories: playlist.categories ?? [],
        tags: playlist.tags ?? [],
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    return response;
  }

  async findOne(id: string): Promise<PlaylistDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid playlist ID');
    }

    const playlist = await this.playlistModel
      .findById(id)
      .select(
        'title description videos speakers categories tags youtubePlaylistId isActive createdAt updatedAt',
      )
      .lean()
      .exec();

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    // Documents created before playlists had metadata do not store these
    // keys; normalize so one playlist always has the same shape.
    playlist.categories = playlist.categories ?? [];
    playlist.tags = playlist.tags ?? [];

    return playlist;
  }

  async update(id: string, dto: UpdatePlaylistDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid playlist ID');
    }

    await Promise.all([
      dto.videos || dto.speakers
        ? this.assertMembersExist(dto.videos ?? [], dto.speakers ?? [])
        : Promise.resolve(),
      dto.categories || dto.tags
        ? this.assertMetadataExist(dto.categories ?? [], dto.tags ?? [])
        : Promise.resolve(),
    ]);

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

    // Covers both edited categories/tags and videos added to the playlist:
    // every child video inherits the playlist metadata.
    await this.inheritMetadata(
      playlist.videos,
      playlist.categories,
      playlist.tags,
    );

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
   * Copies the playlist categories/tags onto its videos. Merge-only: metadata
   * a video already has is never removed, so removing an item from a playlist
   * does not rewrite videos that were once part of it.
   */
  private async inheritMetadata(
    videos: Types.ObjectId[] | undefined,
    categories: Types.ObjectId[] | undefined,
    tags: Types.ObjectId[] | undefined,
  ): Promise<void> {
    const videoIds = (videos ?? []).map(String);
    const categoryIds = (categories ?? []).map(String);
    const tagIds = (tags ?? []).map(String);

    if (
      videoIds.length === 0 ||
      (categoryIds.length === 0 && tagIds.length === 0)
    ) {
      return;
    }

    await this.videosService.addMetadata(videoIds, {
      categories: categoryIds,
      tags: tagIds,
    });
  }

  /** Playlist categories/tags must exist and be active, like video metadata. */
  private async assertMetadataExist(
    categories: string[],
    tags: string[],
  ): Promise<void> {
    const [categoriesValid, tagsValid] = await Promise.all([
      this.categoriesService.areActive(categories),
      this.tagsService.areActive(tags),
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
