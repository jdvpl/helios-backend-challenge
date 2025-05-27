import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class ChangeDirectionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['UP', 'DOWN', 'LEFT', 'RIGHT'])
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
}
