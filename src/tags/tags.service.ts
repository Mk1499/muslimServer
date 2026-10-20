import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateTagDto } from './dto/create-tag.dto';
import { Tag, TagDocument } from './schemas/tag.schema';

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(Tag.name)
    private readonly tagModel: Model<TagDocument>,
  ) {}

  async create(dto: CreateTagDto) {
    const tag = new this.tagModel({
      ...dto,
      slug: dto.slug.toLowerCase().trim(),
    });

    return tag.save();
  }

  async findAll() {
    return this.tagModel
      .find({ isActive: true })
      .select('name slug')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  async areActive(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }

    const count = await this.tagModel.countDocuments({
      _id: { $in: ids },
      isActive: true,
    });

    return count === ids.length;
  }
}
