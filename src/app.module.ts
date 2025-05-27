import { Module } from '@nestjs/common';
import { PreferencesModule } from './preferences/preferences.module';
import { NotificationsModule } from './notification/notifications.module';
import { SnakeGameModule } from './snake-game/snake-game.module';
import { GameResultModule } from './game-result/game-result.module';
import { PrismaModule } from './shared/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PreferencesModule,
    NotificationsModule,
    SnakeGameModule,
    GameResultModule,
  ],
})
export class AppModule {}
