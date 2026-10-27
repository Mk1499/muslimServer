import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlaylistDocument = HydratedDocument<Playlist>;

@Schema({ timestamps: true })
export class Playlist {
  @Prop({
    required: true,
    trim: true,
    maxlength: 150,
  })
  title!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 5000,
  })
  description!: string;

  /** The videos of the playlist, in playing order. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Video' }],
    default: [],
  })
  videos!: Types.ObjectId[];

  /** The YouTube playlist this playlist was imported from, if any. */
  @Prop({
    type: String,
    trim: true,
  })
  youtubePlaylistId?: string;

  /** The speakers that own the playlist. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Speaker' }],
    default: [],
  })
  speakers!: Types.ObjectId[];

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy!: Types.ObjectId;
}

export const PlaylistSchema = SchemaFactory.createForClass(Playlist);

PlaylistSchema.index({ isActive: 1, createdAt: -1 });
PlaylistSchema.index({ speakers: 1, isActive: 1 });
// Sparse so manually created playlists (no YouTube source) are not limited to
// one document, while a YouTube playlist can only be imported once.
PlaylistSchema.index({ youtubePlaylistId: 1 }, { unique: true, sparse: true });
