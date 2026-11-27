import { Prop } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Schema } from '@nestjs/mongoose';

export type TagDocument = HydratedDocument<Tag>;

@Schema({ timestamps: true })
export class Tag {
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  })
  name!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 50,
  })
  nameAr!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 50,
  })
  nameEn!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    unique: true,
    lowercase: true,
  })
  slug!: string;

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive!: boolean;
}

import { SchemaFactory } from '@nestjs/mongoose';

export const TagSchema = SchemaFactory.createForClass(Tag);

TagSchema.index({ isActive: 1, name: 1 });
