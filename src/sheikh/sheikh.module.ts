import { Module } from '@nestjs/common';
import { SheikhService } from './sheikh.service';
import { SheikhController } from './sheikh.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Sheikh, SheikhSchema } from './schemas/sheikh.schema';

@Module({
  providers: [SheikhService],
  controllers: [SheikhController],
  imports: [
    MongooseModule.forFeature([{ name: Sheikh.name, schema: SheikhSchema }]),
  ],
})
export class SheikhModule {}
