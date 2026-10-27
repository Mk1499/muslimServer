import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { Types } from 'mongoose';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideosService } from './videos.service';
import { GetVideosQueryDto } from './dto/get-videos-query.dto';
import { GetRelatedVideosDto } from './dto/get-related-videos.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { BulkVideoIdsDto } from './dto/bulk-video-ids.dto';
import { BulkVideoMetadataDto } from './dto/bulk-video-metadata.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@ApiTags('Videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateVideoDto, @Req() req: AuthenticatedRequest) {
    return this.videosService.create(dto, new Types.ObjectId(req.user.id));
  }

  @Patch('bulk/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  publishMany(@Body() dto: BulkVideoIdsDto) {
    return this.videosService.publishMany(dto.ids);
  }

  @Patch('bulk/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  archiveMany(@Body() dto: BulkVideoIdsDto) {
    return this.videosService.archiveMany(dto.ids);
  }

  @Post('bulk/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteMany(@Body() dto: BulkVideoIdsDto) {
    return this.videosService.deleteMany(dto.ids);
  }

  @Patch('bulk/metadata')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  addMetadataMany(@Body() dto: BulkVideoMetadataDto) {
    return this.videosService.addMetadataMany(dto);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  publish(@Param('id') id: string) {
    return this.videosService.publish(id);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  archive(@Param('id') id: string) {
    return this.videosService.archive(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.videosService.update(id, dto);
  }

  @Get('all')
  findAll(@Query() query: GetVideosQueryDto) {
    return this.videosService.findAll(query);
  }

  @Get('published')
  findPublished(@Query() query: GetVideosQueryDto) {
    return this.videosService.findPublished(query);
  }

  @Get('drafted')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findDrafts(@Query() query: GetVideosQueryDto) {
    return this.videosService.findDraft(query);
  }

  @Get('archived')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findArchived(@Query() query: GetVideosQueryDto) {
    return this.videosService.findArchived(query);
  }

  @Get('featured')
  findFeatured(@Query() query: GetVideosQueryDto) {
    return this.videosService.findFeatured(query);
  }

  @Get('most-viewed')
  findMostViewed(@Query() query: GetVideosQueryDto) {
    return this.videosService.findMostViewed(query);
  }

  @Get('latest')
  findLatest(@Query() query: GetVideosQueryDto) {
    return this.videosService.findLatest(query);
  }

  /**
   * Public watch: counts the view and returns the video to play. Declared
   * before `:id` so the more specific path is matched first.
   */
  @Get(':id/watch')
  watch(@Param('id') id: string) {
    return this.videosService.watch(id);
  }

  /**
   * Related videos to watch next: shares categories, tags or speakers with
   * the given video. Declared before `:id` so the path is matched first.
   */
  @Get(':id/related')
  findRelated(@Param('id') id: string, @Query() query: GetRelatedVideosDto) {
    return this.videosService.findRelated(id, query);
  }

  @Get(':id')
  findPublishedById(@Param('id') id: string) {
    return this.videosService.findPublishedById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.videosService.delete(id);
  }
}
