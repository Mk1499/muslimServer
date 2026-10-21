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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
