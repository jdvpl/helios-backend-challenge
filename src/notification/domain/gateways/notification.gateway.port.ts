import { NotificationEntity } from '../entities/notification.entity';
export abstract class NotificationGatewayPort {
  abstract emitToUser(
    userIdNumeric: number,
    notification: NotificationEntity,
  ): void;
  abstract emitToSocketId(socketId: string, event: string, data: any): void;
  abstract broadcast(event: string, data: any): void;
}
