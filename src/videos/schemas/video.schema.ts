import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VideoDocument = HydratedDocument<Video>;

export enum VideoStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Schema({ timestamps: true })
export class Video {
  @Prop({
    required: true,
    trim: true,
  })
  title!: string;

  @Prop({
    default: '',
    trim: true,
  })
  description!: string;

  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  youtubeVideoId!: string;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Category' }],
    default: [],
  })
  categories!: Types.ObjectId[];

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Tag' }],
    default: [],
  })
  tags!: Types.ObjectId[];

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Speaker' }],
    default: [],
  })
  speakers!: Types.ObjectId[];

  @Prop({
    type: String,
    enum: VideoStatus,
    default: VideoStatus.DRAFT,
    required: true,
  })
  status!: VideoStatus;

  @Prop({
    type: Date,
    default: null,
  })
  publishedAt!: Date | null;

  /** Number of times the video was watched. Server-controlled only. */
  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  views!: number;

  /** Length of the video in whole seconds. 0 when unknown. */
  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  duration!: number;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy!: Types.ObjectId;

  @Prop({
    type: Boolean,
    default: false,
  })
  isFeatured!: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  likes!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  dislikes!: number;

  @Prop({
    type: Boolean,
    default: false,
  })
  embeddable!: boolean;

  @Prop({
    type: String,
    enum: ['none', 'live', 'upcoming'],
    default: 'none',
  })
  liveBroadcastContent!: 'none' | 'live' | 'upcoming';

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  sourceChannelTitle!: string;
}

export const VideoSchema = SchemaFactory.createForClass(Video);

VideoSchema.index({ status: 1, publishedAt: -1 });
VideoSchema.index({ categories: 1, status: 1 });
