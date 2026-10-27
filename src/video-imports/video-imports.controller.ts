import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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

@Controller('admin/video-imports')
export class VideoImportsController {
  constructor(private readonly videoImportsService: VideoImportsService) {}

  /** Runs the import now. It is never scheduled or triggered automatically. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  run(@Req() req: AuthenticatedRequest, @Body() body: ImportsVideosDto) {
    return this.videoImportsService.run(req.user.id, body.channelsIds);
  }
}
