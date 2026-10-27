import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ImportPlaylistDto {
  /** A YouTube playlist URL (watch/playlist link) or a bare playlist id. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  playlist!: string;

  /**
   * Speakers to credit on every newly imported video and on the playlist
   * itself. AI suggestions can add up to two more per video.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsMongoId({ each: true })
  speakers?: string[];

  /** Overrides the YouTube playlist title. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  /** Overrides the YouTube playlist description. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Number of playlist entries to check in this run (1-200). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  maxVideos?: number;
}
