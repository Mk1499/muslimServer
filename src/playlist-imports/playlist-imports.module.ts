import { Module } from '@nestjs/common';

import { CategoriesModule } from 'src/categories/categories.module';
import { PlaylistsModule } from 'src/playlists/playlists.module';
import { SpeakersModule } from 'src/speakers/speakers.module';
import { TagsModule } from 'src/tags/tags.module';
import { VideoImportsModule } from 'src/video-imports/video-imports.module';
import { VideosModule } from 'src/videos/videos.module';

import { PlaylistImportsController } from './playlist-imports.controller';
import { PlaylistImportsService } from './playlist-imports.service';

@Module({
  imports: [
    VideoImportsModule,
    PlaylistsModule,
    VideosModule,
    CategoriesModule,
    TagsModule,
    SpeakersModule,
  ],
  controllers: [PlaylistImportsController],
  providers: [PlaylistImportsService],
})
export class PlaylistImportsModule {}
