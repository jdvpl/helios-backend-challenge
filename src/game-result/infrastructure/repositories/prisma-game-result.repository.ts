import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { GameResultRepository } from '../../domain/repositories/game-result.repository';
import { GameResultEntity } from '../../domain/entities/game-result.entity';

@Injectable()
export class PrismaGameResultRepository extends GameResultRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(result: GameResultEntity): Promise<GameResultEntity> {
    const saved = await this.prisma.gameResult.create({
      data: {
        gameType: result.gameType,
        winnerInfo: result.winnerInfo,
        redScore: result.redScore,
        blueScore: result.blueScore,
        playedAt: result.playedAt,
      },
    });

    return new GameResultEntity({
      id: saved.id,
      gameType: saved.gameType,
      winnerInfo: saved.winnerInfo,
      redScore: saved.redScore,
      blueScore: saved.blueScore,
      playedAt: saved.playedAt,
    });
  }
}
