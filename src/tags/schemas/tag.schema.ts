import { Prop } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Schema } from '@nestjs/mongoose';

export type TagDocument = HydratedDocument<Tag>;

@Schema({ timestamps: true })
export class Tag {
  @Prop({
    required: true,
    trim: true,
    maxlength: 50,
  })
  name!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 50,
  })
  nameAr!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 50,
  })
  nameEn!: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 50,
    unique: true,
    lowercase: true,
  })
  slug!: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;
}

import { SchemaFactory } from '@nestjs/mongoose';

export const TagSchema = SchemaFactory.createForClass(Tag);

TagSchema.index({ isActive: 1, name: 1 });
