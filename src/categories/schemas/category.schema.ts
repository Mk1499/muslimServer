import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
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
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  slug!: string;

  @Prop({
    default: '',
    trim: true,
    maxlength: 500,
  })
  description!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ isActive: 1, name: 1 });
