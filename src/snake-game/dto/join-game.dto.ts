import { IsString, IsNotEmpty, MaxLength, IsIn } from 'class-validator';

export class JoinGameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['red', 'blue'])
  preferredTeam: 'red' | 'blue';
}
