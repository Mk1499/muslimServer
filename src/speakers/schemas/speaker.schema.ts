import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SpeakerDocument = HydratedDocument<Speaker>;

@Schema({ timestamps: true })
export class Speaker {
  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  name!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 100,
  })
  nameAr!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 100,
  })
  nameEn!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 2000,
  })
  bio!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 2000,
  })
  bioAr!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 2000,
  })
  bioEn!: string;

  @Prop({
    default: '',
    trim: true,
  })
  imageUrl!: string;

  @Prop({
    default: '',
    trim: true,
  })
  instagramProfileUrl!: string;

  @Prop({
    default: '',
    trim: true,
  })
  tiktokProfileUrl!: string;

  @Prop({
    default: '',
    trim: true,
  })
  facebookProfileUrl!: string;

  @Prop({
    default: '',
    trim: true,
  })
  youtubeProfileUrl!: string;

  @Prop({
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

  @Prop({
    required: true,
    ref: 'User',
  })
  createdBy!: string;
}

export const SpeakerSchema = SchemaFactory.createForClass(Speaker);

// Backs the "featured speakers" ordering: active speakers by view count.
SpeakerSchema.index({ isActive: 1, views: -1 });
