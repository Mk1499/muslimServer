import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description:
      'A YouTube playlist URL (watch/playlist link) or a bare playlist id.',
    example:
      'https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  playlist!: string;

  /**
   * Speakers to credit on every newly imported video and on the playlist
   * itself. AI suggestions can add up to two more per video.
   */
  @ApiPropertyOptional({
    description:
      'Speakers credited on every newly imported video and on the playlist. ' +
      'AI suggestions can add up to two more speakers per video.',
    type: [String],
    maxItems: 5,
    example: ['507f1f77bcf86cd799439011'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsMongoId({ each: true })
  speakers?: string[];

  /**
   * Categories stored on the playlist and merged into every video it
   * contains. AI suggestions on new drafts are kept alongside them.
   */
  @ApiPropertyOptional({
    description:
      'Categories stored on the playlist and inherited by all of its videos. ' +
      'AI-suggested video categories are kept alongside them.',
    type: [String],
    maxItems: 10,
    example: ['507f1f77bcf86cd799439012'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsMongoId({ each: true })
  categories?: string[];

  /**
   * Tags stored on the playlist and merged into every video it contains.
   * AI suggestions on new drafts are kept alongside them.
   */
  @ApiPropertyOptional({
    description:
      'Tags stored on the playlist and inherited by all of its videos. ' +
      'AI-suggested video tags are kept alongside them.',
    type: [String],
    maxItems: 20,
    example: ['507f1f77bcf86cd799439013'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  tags?: string[];

  /** Overrides the YouTube playlist title. */
  @ApiPropertyOptional({
    description: 'Overrides the YouTube playlist title.',
    maxLength: 150,
    example: 'مجالس الشباب - شريف علي',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  /** Overrides the YouTube playlist description. */
  @ApiPropertyOptional({
    description: 'Overrides the YouTube playlist description.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Number of playlist entries to check in this run (1-200). */
  @ApiPropertyOptional({
    description:
      'Number of playlist entries checked in this run. Defaults to 50.',
    minimum: 1,
    maximum: 200,
    default: 50,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  maxVideos?: number;
}
