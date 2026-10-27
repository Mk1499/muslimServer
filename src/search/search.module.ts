import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Speaker, SpeakerSchema } from '../speakers/schemas/speaker.schema';
import { Video, VideoSchema } from '../videos/schemas/video.schema';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Video.name, schema: VideoSchema },
      { name: Speaker.name, schema: SpeakerSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
