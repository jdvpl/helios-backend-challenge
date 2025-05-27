import { Module } from '@nestjs/common';
import { PrismaNotificationRepository } from './infrastructure/repositories/prisma-notification.repository';
import { NotificationRepository } from './domain/repositories/notification.repository';
import { SocketNotificationGateway } from './infrastructure/gateways/socket-notification.gateway';
import { NotificationGatewayPort } from './domain/gateways/notification.gateway.port';
import { SendNotificationUseCase } from './application/use-cases/send-notification.usecase';
import { PreferencesModule } from '../preferences/preferences.module';

@Module({
  imports: [PreferencesModule],
  providers: [
    { provide: NotificationRepository, useClass: PrismaNotificationRepository },
    { provide: NotificationGatewayPort, useClass: SocketNotificationGateway },
    SendNotificationUseCase,
  ],
  exports: [SendNotificationUseCase],
})
export class NotificationsModule {}
