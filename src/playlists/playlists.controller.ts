import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Types } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { GetPlaylistsDto } from './dto/get-playlists.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { PlaylistsService } from './playlists.service';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Get()
  findAll(@Query() query: GetPlaylistsDto) {
    return this.playlistsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.playlistsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePlaylistDto, @Req() req: AuthenticatedRequest) {
    return this.playlistsService.create(dto, new Types.ObjectId(req.user.id));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePlaylistDto) {
    return this.playlistsService.update(id, dto);
  }

  /** Soft delete — see `PlaylistsService.remove`. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.playlistsService.remove(id);
  }

  /** Undoes a soft delete. */
  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(@Param('id') id: string) {
    return this.playlistsService.restore(id);
  }
}
