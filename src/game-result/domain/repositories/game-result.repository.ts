import { GameResultEntity } from '../entities/game-result.entity';

export abstract class GameResultRepository {
  abstract save(result: GameResultEntity): Promise<GameResultEntity>;
}
