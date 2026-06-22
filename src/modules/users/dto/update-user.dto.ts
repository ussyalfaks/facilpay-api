import { IsOptional, IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User display name',
    example: 'Jane Doe',
    minLength: 1,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'User email address. Changing email triggers re-verification.',
    example: 'jane.new@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
