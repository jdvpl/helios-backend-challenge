import { Injectable } from '@nestjs/common';
import { GameResultRepository } from '../../domain/repositories/game-result.repository';
import { GameResultEntity } from '../../domain/entities/game-result.entity';

@Injectable()
export class SaveGameResultUseCase {
  constructor(private readonly gameResultRepository: GameResultRepository) {}

  async execute(
    data: Omit<GameResultEntity, 'playedAt' | 'id'>,
  ): Promise<GameResultEntity> {
    const resultEntity = new GameResultEntity({
      gameType: data.gameType,
      winnerInfo: data.winnerInfo,
      redScore: data.redScore,
      blueScore: data.blueScore,
      playedAt: new Date(),
    });

    return this.gameResultRepository.save(resultEntity);
  }
}
