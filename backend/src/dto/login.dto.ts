import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password: string;
}
