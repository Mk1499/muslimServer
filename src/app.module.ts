import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { VideosModule } from './videos/videos.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { SpeakersModule } from './speakers/speakers.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { VideoImportsModule } from './video-imports/video-imports.module';
import { PlaylistImportsModule } from './playlist-imports/playlist-imports.module';
import { SearchModule } from './search/search.module';
import { SheikhModule } from './sheikh/sheikh.module';

@Module({
  imports: [
    AppConfigModule,
    MongooseModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    VideosModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    TagsModule,
    SpeakersModule,
    PlaylistsModule,
    VideoImportsModule,
    PlaylistImportsModule,
    SearchModule,
    SheikhModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
