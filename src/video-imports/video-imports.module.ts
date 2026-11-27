import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { SpeakersModule } from '../speakers/speakers.module';
import { TagsModule } from '../tags/tags.module';
import { VideosModule } from '../videos/videos.module';

import { AiMetadataService } from './ai-metadata.service';
import { VideoImportsController } from './video-imports.controller';
import { VideoImportsService } from './video-imports.service';
import { YouTubeDataService } from './youtube-data.service';

@Module({
  imports: [VideosModule, CategoriesModule, TagsModule, SpeakersModule],
  controllers: [VideoImportsController],
  providers: [VideoImportsService, YouTubeDataService, AiMetadataService],
  exports: [YouTubeDataService, AiMetadataService],
})
export class VideoImportsModule {}
