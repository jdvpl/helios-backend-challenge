import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { NotificationGatewayPort } from '../../domain/gateways/notification.gateway.port';

@WebSocketGateway({ namespace: '/notifications', cors: { origin: '*' } })
@Injectable()
export class SocketNotificationGateway
  extends NotificationGatewayPort
  implements OnGatewayInit, OnGatewayConnection
{
  @WebSocketServer() server: Server;
  private logger = new Logger(SocketNotificationGateway.name);
  afterInit(server: Server) {
    this.logger.log(
      'Notification WebSocket Gateway Initialized (Namespace: /notifications)',
    );
  }
  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId && !isNaN(parseInt(userId, 10))) client.join(`user_${userId}`);
  }
  emitToUser(userIdNumeric: number, notification: NotificationEntity): void {
    this.server
      .to(`user_${userIdNumeric}`)
      .emit('notification:new', notification);
  }
  emitToSocketId(socketId: string, event: string, data: any): void {
    this.logger.log(
      `Attempting to emit event '<span class="math-inline">\{event\}' to socketId '</span>{socketId}' with data: ${JSON.stringify(data)}`,
    );
    this.server.to(socketId).emit(event, data);
  }
  broadcast(event: string, data: any): void {
    this.server.emit(event, data);
  }
}
