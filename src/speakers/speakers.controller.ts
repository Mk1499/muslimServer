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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

import { CreateSpeakerDto } from './dto/create-speaker.dto';
import { UpdateSpeakerDto } from './dto/update-speaker.dto';
import { SpeakersService } from './speakers.service';
import { GetSpeakersDto } from './dto/get-speakers.dto';
import { Types } from 'mongoose';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@Controller('speakers')
export class SpeakersController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get()
  findAll(@Query() query: GetSpeakersDto) {
    return this.speakersService.findAll(query);
  }

  /**
   * Active speakers ordered by their view count. Declared before `:id` so
   * "featured" is not captured as a speaker id.
   */
  @Get('featured')
  findFeatured(@Query() query: GetSpeakersDto) {
    return this.speakersService.findFeatured(query);
  }

  /** Public read, deleted ones included, so the admin profile page can deep-link. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.speakersService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSpeakerDto, @Req() req: AuthenticatedRequest) {
    return this.speakersService.create(dto, new Types.ObjectId(req.user.id));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSpeakerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.speakersService.update(
      id,
      dto,
      new Types.ObjectId(req.user.id),
    );
  }

  /** Soft delete — see `SpeakersService.remove`. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.speakersService.remove(id);
  }

  /** Undoes a soft delete. */
  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(@Param('id') id: string) {
    return this.speakersService.restore(id);
  }
}
