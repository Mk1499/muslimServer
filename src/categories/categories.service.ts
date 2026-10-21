import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateCategoryDto } from './dto/create-category.dto';
import { Category, CategoryDocument } from './schemas/category.schema';
import { GetCategoriesDto } from './dto/get-categories.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async create(dto: CreateCategoryDto) {
    const category = new this.categoryModel({
      ...dto,
      slug: dto.slug.toLowerCase().trim(),
    });

    return category.save();
  }

  async findAll(query: GetCategoriesDto) {
    const { page, limit } = query;
    const [categories, total] = await Promise.all([
      this.categoryModel
        .find({ isActive: true })
        .select('name nameAr nameEn slug description')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.categoryModel.countDocuments({ isActive: true }).exec(),
    ]);

    return {
      data: categories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async areActive(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }

    const count = await this.categoryModel.countDocuments({
      _id: { $in: ids },
      isActive: true,
    });

    return count === ids.length;
  }
}
