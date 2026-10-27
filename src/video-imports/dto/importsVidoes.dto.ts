import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray } from 'class-validator';

export class ImportsVideosDto {
  @ApiProperty({
    description:
      'YouTube channel ids to check (each starts with "UC"). At least one ' +
      'valid id is required.',
    type: [String],
    example: [`UC${'x'.repeat(22)}`],
  })
  @IsArray()
  @ArrayUnique()
  channelsIds!: string[];
}
