import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SheikhDocument = HydratedDocument<Sheikh>;

@Schema({ timestamps: true })
export class Sheikh {
  @Prop({
    default: '',
    trim: true,
    maxlength: 100,
    unique: true,
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
    type: String,
  })
  ayahAudioId?: string;

  @Prop({
    type: String,
  })
  surahAudioId?: string;

  @Prop({
    default: false,
  })
  isActive!: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  listens!: number;

  @Prop({
    type: String,
    default: '',
  })
  nationalityEn!: string;

  @Prop({
    type: String,
    default: '',
  })
  nationalityAr!: string;
}

export const SheikhSchema = SchemaFactory.createForClass(Sheikh);
