import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class GetPlaylistsDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based).',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Items per page (1-50).',
    minimum: 1,
    maximum: 50,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  /** Restricts the result to playlists owned by this speaker. */
  @ApiPropertyOptional({
    description: 'Only return playlists that include this speaker id.',
    example: '507f191e810c19729de860ea',
  })
  @IsOptional()
  @IsMongoId()
  speaker?: string;
}
