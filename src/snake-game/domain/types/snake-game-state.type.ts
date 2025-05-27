import { SnakeEntity } from '../entities/snake.entity';
import { FoodPelletEntity } from '../entities/food-pellet.entity';

export interface IndividualPlayerGameState {
  snake: SnakeEntity;
  food: FoodPelletEntity | null;
  gameBoard: { width: number; height: number; gridSize: number };
  isActive: boolean;
  isPaused: boolean;
}

export interface JoinGamePayload {
  name: string;
  preferredTeam: 'red' | 'blue';
}

export interface PlayerPublicInfo {
  id: string;
  name: string;
  team: 'red' | 'blue';
  score: number;
  level: number;
  isDefeated?: boolean;
  isPaused?: boolean;
}

export interface SharedGameState {
  teamScores: { red: number; blue: number };
  activePlayers: PlayerPublicInfo[];
}
