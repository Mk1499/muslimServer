import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SheikhService } from './sheikh.service';
import { CreateSheikhDto } from './dto/create-sheikh.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users/user-role.enum';
import { GetSheikhsDto } from './dto/get-sheikh.dto';
import { UpdateSheikhDto } from './dto/update-sheikh.dto';
import { Types } from 'mongoose';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@Controller('sheikh')
export class SheikhController {
  constructor(private readonly sheikhService: SheikhService) {}

  @Get('active')
  findActive(@Query() query: GetSheikhsDto) {
    return this.sheikhService.findActive(query);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: GetSheikhsDto) {
    return this.sheikhService.findAll(query);
  }
  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createSheikh(@Body() createSheikhDto: CreateSheikhDto) {
    return this.sheikhService.create(createSheikhDto);
  }

  @Get('scrape')
  scrapeSheikhs(@Query('page') page: number, @Query('limit') limit: number) {
    return this.sheikhService.scrapeSheikhs(page, limit);
  }

  @Patch('update/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSheikhDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sheikhService.update(id, dto, new Types.ObjectId(req.user.id));
  }
}
