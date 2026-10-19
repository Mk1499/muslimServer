import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(64)
  @MinLength(8)
  password!: string;
}
