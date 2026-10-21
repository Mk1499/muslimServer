import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SpeakersModule } from 'src/speakers/speakers.module';
import { VideosModule } from 'src/videos/videos.module';

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
  ],
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
