import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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
    ConfigModule.forRoot({
      isGlobal: true,
      // Worker bindings are exposed through process.env, but there is no
      // deployable .env file in Workers. Keep dotenv loading for local Node.
      ignoreEnvFile: process.env.CLOUDFLARE_WORKER === 'true',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
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
