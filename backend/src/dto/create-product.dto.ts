import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'The unique ID of the product' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id: string;

  @ApiProperty({ description: 'The name of the product' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
