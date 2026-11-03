import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSheikhDto {
  @IsString()
  @MaxLength(100)
  nameAr!: string;

  @IsString()
  @MaxLength(100)
  nameEn!: string;

  @IsNumber()
  audioId!: number;

  @IsString()
  imageUrl!: string;

  @IsString()
  @MaxLength(400)
  @IsOptional()
  bioAr?: string;

  @IsString()
  @MaxLength(400)
  @IsOptional()
  bioEn?: string;
}
