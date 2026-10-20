import {
  Body,
  Controller,
  Get,
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

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSpeakerDto, @Req() req: AuthenticatedRequest) {
    return this.speakersService.create(dto, new Types.ObjectId(req.user.id));
  }
}
