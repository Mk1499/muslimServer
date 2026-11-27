import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SpeakerDocument = HydratedDocument<Speaker>;

@Schema({ timestamps: true })
export class Speaker {
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  })
  name!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 100,
  })
  nameAr!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 100,
  })
  nameEn!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 2000,
  })
  bio!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 2000,
  })
  bioAr!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 2000,
  })
  bioEn!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  imageUrl!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  instagramProfileUrl!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  tiktokProfileUrl!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  facebookProfileUrl!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  youtubeProfileUrl!: string;

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive!: boolean;

  /**
   * Total views of every video this speaker is credited on. Server-controlled
   * only — it is incremented when one of their videos is watched.
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  views!: number;

  /**
   * Number of published videos this speaker is credited on. Server-controlled
   * only — it follows the publish/archive/delete transitions of their videos.
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  publishedVideosCount!: number;

  @Prop({
    type: String,
    required: true,
    ref: 'User',
  })
  createdBy!: string;
}

export const SpeakerSchema = SchemaFactory.createForClass(Speaker);

// Backs the "featured speakers" ordering: active speakers by view count.
SpeakerSchema.index({ isActive: 1, views: -1 });
