import { PartialType } from '@nestjs/mapped-types';
import { CreateSheikhDto } from './create-sheikh.dto';

export class UpdateSheikhDto extends PartialType(CreateSheikhDto) {}
