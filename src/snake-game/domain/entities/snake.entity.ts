export class SnakeSegmentEntity {
  x: number;
  y: number;
}

export class SnakeEntity {
  id: string;
  name: string;
  segments: SnakeSegmentEntity[];
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  color: string;
  team: 'red' | 'blue';
  score: number;
  isDefeated: boolean;
  level: number;
  pendingDirection?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  isPaused?: boolean;
}
