import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SheikhDocument = HydratedDocument<Sheikh>;

@Schema({ timestamps: true })
export class Sheikh {
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
    type: Number,
    required: true,
  })
  audioId!: number;

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
  listens!: number;

  @Prop({
    required: true,
    ref: 'User',
  })
  createdBy!: string;
}

export const SheikhSchema = SchemaFactory.createForClass(Sheikh);
