import { IsString, IsInt, IsDate, IsOptional, Min } from 'class-validator';

export class GameResultEntity {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  gameType: string;

  @IsOptional()
  @IsString()
  winnerInfo: string | null;

  @IsInt()
  @Min(0)
  redScore: number;

  @IsInt()
  @Min(0)
  blueScore: number;

  @IsDate()
  playedAt: Date;

  constructor(params: {
    gameType: string;
    winnerInfo: string | null;
    redScore: number;
    blueScore: number;
    playedAt: Date;
    id?: string;
  }) {
    Object.assign(this, params);
  }
}
