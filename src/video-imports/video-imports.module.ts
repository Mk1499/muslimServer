import { Module } from '@nestjs/common';

import { CategoriesModule } from 'src/categories/categories.module';
import { SpeakersModule } from 'src/speakers/speakers.module';
import { TagsModule } from 'src/tags/tags.module';
import { VideosModule } from 'src/videos/videos.module';

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
