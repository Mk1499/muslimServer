import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
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
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  slug!: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  })
  description!: string;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ isActive: 1, name: 1 });
