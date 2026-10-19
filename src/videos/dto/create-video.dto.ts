import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

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
}
