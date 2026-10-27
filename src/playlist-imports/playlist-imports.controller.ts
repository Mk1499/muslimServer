import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

import { ImportPlaylistDto } from './dto/import-playlist.dto';
import { PlaylistImportsService } from './playlist-imports.service';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@ApiTags('Admin - Playlist imports')
@ApiBearerAuth('access-token')
@Controller('admin/playlist-imports')
export class PlaylistImportsController {
  constructor(
    private readonly playlistImportsService: PlaylistImportsService,
  ) {}

  /** Imports one YouTube playlist. It is never scheduled or triggered automatically. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import a YouTube playlist',
    description:
      'Admin only. Imports one public YouTube playlist as an app playlist. ' +
      'New videos are created as drafts with AI-suggested categories, tags ' +
      'and speakers; Shorts and unavailable videos are skipped. The ' +
      'categories and tags stored on the playlist are inherited by every ' +
      'video in it. Re-importing the same YouTube playlist updates the ' +
      'existing app playlist.',
  })
  @ApiOkResponse({
    description:
      'Import finished. The playlist exists immediately, even if ' +
      'its videos are still drafts.',
    schema: {
      example: {
        appPlaylistId: '6ae006cdcf50a141752c2d38',
        youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        title: 'Uploads from شريف علي',
        created: true,
        speakers: ['507f191e810c19729de860ea'],
        categories: ['507f1f77bcf86cd799439012'],
        tags: ['507f1f77bcf86cd799439013'],
        maxVideos: 50,
        shortsMaxDurationSeconds: 180,
        aiEnabled: true,
        aiDisabledAfterFailures: false,
        discovered: 20,
        imported: 5,
        playlistVideos: 11,
        skipped: 15,
        skippedExisting: 6,
        skippedShorts: 9,
        skippedUnavailable: 0,
        skippedArchived: 0,
        deferred: 1282,
        failed: 0,
        aiFailures: 0,
        durationMs: 6373,
        errors: [],
        warnings: [],
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid playlist URL/id, invalid speakers/categories/tags, or a ' +
      'private/missing playlist.',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiConflictResponse({ description: 'Another playlist import is running.' })
  @ApiServiceUnavailableResponse({
    description:
      'YOUTUBE_API_KEY is missing or the YouTube quota is exhausted.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  run(@Req() req: AuthenticatedRequest, @Body() body: ImportPlaylistDto) {
    return this.playlistImportsService.run(req.user.id, body);
  }
}
