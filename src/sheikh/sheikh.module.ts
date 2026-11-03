import { Module } from '@nestjs/common';
import { SheikhService } from './sheikh.service';
import { SheikhController } from './sheikh.controller';

@Module({
  providers: [SheikhService],
  controllers: [SheikhController]
})
export class SheikhModule {}
