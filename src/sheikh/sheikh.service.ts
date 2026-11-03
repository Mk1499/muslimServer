import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Sheikh, SheikhDocument } from './schemas/sheikh.schema';
import { Model } from 'mongoose';
import { CreateSheikhDto } from './dto/create-sheikh.dto';
import { GetSheikhsDto } from './dto/get-sheikh.dto';

@Injectable()
export class SheikhService {
  constructor(
    @InjectModel(Sheikh.name)
    private readonly sheikhModel: Model<Sheikh>,
  ) {}

  async create(createSheikhDto: CreateSheikhDto): Promise<SheikhDocument> {
    const createdSheikh = new this.sheikhModel(createSheikhDto);
    return createdSheikh.save();
  }

  async findAll(query: GetSheikhsDto) {
    const { page, limit } = query;
    return this.sheikhModel
      .find()
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();
  }
}
