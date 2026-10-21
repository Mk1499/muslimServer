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
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** The videos of the playlist, in playing order. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  videos?: string[];

  /** The speakers that own the playlist. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  speakers?: string[];
}
