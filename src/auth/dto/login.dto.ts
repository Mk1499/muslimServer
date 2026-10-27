import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Registered email address.',
    example: 'admin@example.com',
    maxLength: 255,
  })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    description: 'Account password.',
    example: 'your-password',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  @MinLength(8)
  password!: string;
}
