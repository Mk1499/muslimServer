import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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

@Controller('admin/playlist-imports')
export class PlaylistImportsController {
  constructor(
    private readonly playlistImportsService: PlaylistImportsService,
  ) {}

  /** Imports one YouTube playlist. It is never scheduled or triggered automatically. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  run(@Req() req: AuthenticatedRequest, @Body() body: ImportPlaylistDto) {
    return this.playlistImportsService.run(req.user.id, body);
  }
}
