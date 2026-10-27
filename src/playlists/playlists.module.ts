import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SpeakersModule } from 'src/speakers/speakers.module';
import { VideosModule } from 'src/videos/videos.module';
import { CategoriesModule } from 'src/categories/categories.module';
import { TagsModule } from 'src/tags/tags.module';

import { PlaylistsController } from './playlists.controller';
import { PlaylistsService } from './playlists.service';
import { Playlist, PlaylistSchema } from './schemas/playlist.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Playlist.name, schema: PlaylistSchema },
    ]),
    VideosModule,
    SpeakersModule,
    CategoriesModule,
    TagsModule,
  ],
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
