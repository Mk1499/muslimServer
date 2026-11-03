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
    const [sheikhs, total] = await Promise.all([
      this.sheikhModel
        .find()
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.sheikhModel.countDocuments().exec(),
    ]);
    return {
      data: sheikhs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findActive(query: GetSheikhsDto) {
    const { page, limit } = query;
    const [sheikhs, total] = await Promise.all([
      this.sheikhModel
        .find({ isActive: true })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.sheikhModel.countDocuments({ isActive: true }).exec(),
    ]);
    return {
      data: sheikhs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async scrapeSheikhs(page: number, limit: number) {
    // Implement the scraping logic here
    const url = `https://way2quran.com/api/listening/world-popular-reciters?days=365&limit=${limit}&page=${page}&rankBy=sessions`;

    const response = await fetch(url);
    const data = await response.json();
    const sheikhs =
      data?.data?.rows?.map((row: any) => ({
        nameAr: row.arabicName || '',
        nameEn: row.englishName || '',
        imageUrl: row.photo || '',
        nationalityEn: row.nationality?.en || '',
        nationalityAr: row.nationality?.ar || '',
      })) || [];

    this.sheikhModel.insertMany(sheikhs);
    return sheikhs;
  }
}
