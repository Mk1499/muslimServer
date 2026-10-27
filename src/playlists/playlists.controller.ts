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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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

@ApiTags('Playlists')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active playlists',
    description:
      'Public. Imported YouTube playlists are included and can be filtered by ' +
      'one of their speakers.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'speaker',
    required: false,
    type: String,
    description: 'Only return playlists that include this speaker id.',
  })
  @ApiOkResponse({ description: 'Paginated list of active playlists.' })
  findAll(@Query() query: GetPlaylistsDto) {
    return this.playlistsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one playlist by id',
    description:
      'Public. Returns the playlist videos in playing order, including ' +
      'imported YouTube playlists.',
  })
  @ApiParam({ name: 'id', description: 'Playlist id.' })
  @ApiOkResponse({
    description:
      'The playlist, including its speakers, categories and tags (ids).',
    schema: {
      example: {
        _id: '6ae006cdcf50a141752c2d38',
        title: 'Uploads from شريف علي',
        description: '',
        videos: ['507f1f77bcf86cd799439011'],
        speakers: ['507f191e810c19729de860ea'],
        categories: ['507f1f77bcf86cd799439012'],
        tags: ['507f1f77bcf86cd799439013'],
        youtubePlaylistId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Playlist not found.' })
  findOne(@Param('id') id: string) {
    return this.playlistsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a playlist',
    description:
      'Admin only. Manually created playlists can only reference published ' +
      'videos; imported playlists are created by the playlist importer. The ' +
      'playlist categories and tags are merged into every one of its videos.',
  })
  @ApiCreatedResponse({ description: 'The created playlist.' })
  @ApiBadRequestResponse({
    description:
      'Invalid ids, an inactive speaker, a video that is not published, or ' +
      'an inactive category/tag.',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePlaylistDto, @Req() req: AuthenticatedRequest) {
    return this.playlistsService.create(dto, new Types.ObjectId(req.user.id));
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update a playlist',
    description:
      'Categories and tags set here are inherited by every video in the ' +
      'playlist. Inheritance is merge-only: metadata already on a video is ' +
      'kept, including after it is removed from the playlist.',
  })
  @ApiParam({ name: 'id', description: 'Playlist id.' })
  @ApiOkResponse({ description: 'The updated playlist.' })
  @ApiBadRequestResponse({
    description: 'Invalid ids, inactive speaker, or inactive category/tag.',
  })
  @ApiNotFoundResponse({ description: 'Playlist not found.' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePlaylistDto) {
    return this.playlistsService.update(id, dto);
  }

  /** Soft delete — see `PlaylistsService.remove`. */
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Soft-delete a playlist' })
  @ApiParam({ name: 'id', description: 'Playlist id.' })
  @ApiOkResponse({ description: 'The soft-deleted playlist.' })
  @ApiNotFoundResponse({ description: 'Playlist not found.' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.playlistsService.remove(id);
  }

  /** Undoes a soft delete. */
  @Patch(':id/restore')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Restore a soft-deleted playlist' })
  @ApiParam({ name: 'id', description: 'Playlist id.' })
  @ApiOkResponse({ description: 'The restored playlist.' })
  @ApiNotFoundResponse({ description: 'Playlist not found.' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(@Param('id') id: string) {
    return this.playlistsService.restore(id);
  }
}
