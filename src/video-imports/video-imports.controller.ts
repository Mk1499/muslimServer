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
import { ImportsVideosDto } from './dto/importsVidoes.dto';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

import { VideoImportsService } from './video-imports.service';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@ApiTags('Admin - Video imports')
@ApiBearerAuth('access-token')
@Controller('admin/video-imports')
export class VideoImportsController {
  constructor(private readonly videoImportsService: VideoImportsService) {}

  /** Runs the import now. It is never scheduled or triggered automatically. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import recent channel uploads',
    description:
      'Admin only. Checks the latest uploads of the given YouTube channels ' +
      'and creates draft videos with AI-suggested categories, tags and ' +
      'speakers. Shorts and unavailable videos are skipped; re-running is ' +
      'safe because videos are de-duplicated by YouTube id.',
  })
  @ApiOkResponse({
    description: 'Import finished.',
    schema: {
      example: {
        channels: 4,
        videosPerChannel: 10,
        shortsMaxDurationSeconds: 180,
        aiEnabled: true,
        aiDisabledAfterFailures: false,
        discovered: 40,
        imported: 1,
        skipped: 39,
        skippedExisting: 15,
        skippedShorts: 24,
        skippedUnavailable: 0,
        deferred: 0,
        failed: 0,
        aiFailures: 0,
        durationMs: 4523,
        errors: [],
        warnings: [],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'No valid channel ids, or an invalid admin user id.',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiConflictResponse({ description: 'Another video import is running.' })
  @ApiServiceUnavailableResponse({
    description:
      'YOUTUBE_API_KEY is missing or the YouTube quota is exhausted.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  run(@Req() req: AuthenticatedRequest, @Body() body: ImportsVideosDto) {
    return this.videoImportsService.run(req.user.id, body.channelsIds);
  }
}
