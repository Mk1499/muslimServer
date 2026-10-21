import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class GetPlaylistsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  /** Restricts the result to playlists owned by this speaker. */
  @IsOptional()
  @IsMongoId()
  speaker?: string;
}
