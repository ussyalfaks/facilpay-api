import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Password reset token from the email',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  token: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  @ApiProperty({
    description: 'Email address of the account',
    example: 'user@example.com',
  })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @ApiProperty({
    description: 'New password (minimum 8 characters)',
    example: 'NewP@ssw0rd!',
    minLength: 8,
  })
  newPassword: string;
}
