import { ArrayUnique, IsArray } from 'class-validator';

export class ImportsVideosDto {
  @IsArray()
  @ArrayUnique()
  channelsIds!: string[];
}
