import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateSpeakerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  bio!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bioAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bioEn?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  instagramProfileUrl?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  tiktokProfileUrl?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  facebookProfileUrl?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  youtubeProfileUrl?: string;
}
