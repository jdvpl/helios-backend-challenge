import { Module } from '@nestjs/common';
import { PrismaGameResultRepository } from './infrastructure/repositories/prisma-game-result.repository';
import { GameResultRepository } from './domain/repositories/game-result.repository';
import { SaveGameResultUseCase } from './application/use-cases/save-game-result.usecase';

@Module({
  providers: [
    {
      provide: GameResultRepository,
      useClass: PrismaGameResultRepository,
    },
    SaveGameResultUseCase,
  ],
  exports: [SaveGameResultUseCase],
})
export class GameResultModule {}
