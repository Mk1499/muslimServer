import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class CreatePlaylistDto {
  @ApiProperty({
    description: 'Playlist title.',
    maxLength: 150,
    example: 'برنامج اسويا',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({
    description: 'Playlist description.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** The videos of the playlist, in playing order. */
  @ApiPropertyOptional({
    description:
      'Videos in playing order. Manually created playlists only accept ' +
      'published videos.',
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  videos?: string[];

  /** The speakers that own the playlist. */
  @ApiPropertyOptional({
    description: 'Speakers that own the playlist.',
    type: [String],
    example: ['507f191e810c19729de860ea'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  speakers?: string[];

  /**
   * Categories shared by the playlist. They are added to every video in the
   * playlist without removing the categories a video already has.
   */
  @ApiPropertyOptional({
    description:
      'Categories shared by the playlist and inherited by all of its videos. ' +
      'Existing video categories are kept.',
    type: [String],
    example: ['507f1f77bcf86cd799439012'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  categories?: string[];

  /**
   * Tags shared by the playlist. They are added to every video in the
   * playlist without removing the tags a video already has.
   */
  @ApiPropertyOptional({
    description:
      'Tags shared by the playlist and inherited by all of its videos. ' +
      'Existing video tags are kept.',
    type: [String],
    example: ['507f1f77bcf86cd799439013'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  tags?: string[];
}
