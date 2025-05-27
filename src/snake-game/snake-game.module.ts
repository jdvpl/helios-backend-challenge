import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notification/notifications.module';
import { GameResultModule } from 'src/game-result/game-result.module';
import { SnakeGameService } from './services/snake-game.service';
import { SnakeGameGateway } from './gateways/snake-game.gateway';

@Module({
  imports: [forwardRef(() => NotificationsModule), GameResultModule],
  providers: [SnakeGameGateway, SnakeGameService],
})
export class SnakeGameModule {}
