import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SheikhService } from './sheikh.service';
import { CreateSheikhDto } from './dto/create-sheikh.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users/user-role.enum';
import { GetSheikhsDto } from './dto/get-sheikh.dto';

@Controller('sheikh')
export class SheikhController {
  constructor(private readonly sheikhService: SheikhService) {}

  @Get('')
  findAll(@Query() query: GetSheikhsDto) {
    return this.sheikhService.findAll(query);
  }

  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createSheikh(@Body() createSheikhDto: CreateSheikhDto) {
    return this.sheikhService.create(createSheikhDto);
  }
}
