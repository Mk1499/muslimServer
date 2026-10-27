import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{11}$/, {
    message: 'youtubeVideoId must be a valid YouTube video ID',
  })
  youtubeVideoId!: string;

  /** Length of the video in whole seconds. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  duration?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  categories?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  speakers?: string[];

  @IsOptional()
  @IsBoolean()
  embeddable?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^(none|live|upcoming)$/, {
    message: 'liveBroadcastContent must be one of: none, live, upcoming',
  })
  liveBroadcastContent?: 'none' | 'live' | 'upcoming';

  @IsOptional()
  @IsString()
  sourceChannelTitle?: string;
}
