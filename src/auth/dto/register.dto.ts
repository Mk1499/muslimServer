import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Email address for the new account.',
    example: 'user@example.com',
    maxLength: 255,
  })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    description: 'Password, at least 8 characters.',
    example: 'your-password',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  @MinLength(8)
  password!: string;
}
