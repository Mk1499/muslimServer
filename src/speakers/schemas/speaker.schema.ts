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
    maxlength: 2000,
  })
  bio!: string;

  @Prop({
    default: '',
    trim: true,
  })
  imageUrl!: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop({
    required: true,
    ref: 'User',
  })
  createdBy!: string;
}

export const SpeakerSchema = SchemaFactory.createForClass(Speaker);
