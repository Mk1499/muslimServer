import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { PlaylistsModule } from '../playlists/playlists.module';
import { SpeakersModule } from '../speakers/speakers.module';
import { TagsModule } from '../tags/tags.module';
import { VideoImportsModule } from '../video-imports/video-imports.module';
import { VideosModule } from '../videos/videos.module';

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
