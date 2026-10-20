import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Video, VideoSchema } from './schemas/video.schema';
import { CategoriesModule } from 'src/categories/categories.module';
import { TagsModule } from 'src/tags/tags.module';
import { SpeakersModule } from 'src/speakers/speakers.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Video.name,
        schema: VideoSchema,
      },
    ]),
    CategoriesModule,
    TagsModule,
    SpeakersModule,
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
