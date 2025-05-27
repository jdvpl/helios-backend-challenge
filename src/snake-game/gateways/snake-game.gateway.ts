import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  Logger,
  UsePipes,
  ValidationPipe,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SnakeGameService } from '../services/snake-game.service';
import { JoinGameDto } from '../dto/join-game.dto';
import { ChangeDirectionDto } from '../dto/change-direction.dto';

import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

class SocialFriendRequestDto {
  @IsString() @IsNotEmpty() toPlayerId: string;
  @IsOptional() @IsString() @MaxLength(20) fromPlayerName?: string;
}
class SocialAcceptFriendRequestDto {
  @IsString() @IsNotEmpty() requestFromPlayerId: string;
}

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@WebSocketGateway({ namespace: '/snake', cors: { origin: '*' } })
export class SnakeGameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SnakeGameGateway.name);

  constructor(
    @Inject(forwardRef(() => SnakeGameService))
    private readonly snakeGameService: SnakeGameService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Snake Game Gateway (Individual Boards v2) Initialized');
  }

  handleConnection(client: Socket) {
    try {
      const sharedState = this.snakeGameService.getSharedGameState();
      client.emit('game:shared_state', sharedState);
    } catch (error) {
      this.logger.error(
        `[GATEWAY] Error in handleConnection for client ${client.id}:`,
        error.stack,
      );
    }
  }

  handleDisconnect(client: Socket) {
    this.snakeGameService.handleClientDisconnect(client.id);
  }

  @SubscribeMessage('player:join_game')
  handlePlayerJoinGame(
    @MessageBody() data: JoinGameDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const result = this.snakeGameService.handlePlayerJoin(
      client.id,
      data.name,
      data.preferredTeam,
    );
    if (!result.success) {
      client.emit('game:join_failed', {
        message: result.message || 'Could not join the game.',
      });
    }
  }

  @SubscribeMessage('player:start_my_game')
  handlePlayerStartMyGame(@ConnectedSocket() client: Socket): void {
    this.snakeGameService.handlePlayerStartTheirGame(client.id);
  }

  @SubscribeMessage('player:pause_my_game')
  handlePlayerPauseMyGame(@ConnectedSocket() client: Socket): void {
    this.logger.log(`[GATEWAY] Player ${client.id} wants to pause their game.`);
    this.snakeGameService.handlePlayerPauseTheirGame(client.id);
  }

  @SubscribeMessage('player:change_direction')
  handleChangeDirection(
    @MessageBody() data: ChangeDirectionDto,
    @ConnectedSocket() client: Socket,
  ): void {
    this.snakeGameService.handleChangeDirection(client.id, data.direction);
  }

  @SubscribeMessage('player:request_retry')
  handlePlayerRetry(@ConnectedSocket() client: Socket): void {
    this.sendToClient(client.id, 'info', {
      message: "To retry, click 'Join / Retry Game' again with your details.",
    });
  }

  @SubscribeMessage('social:send_friend_request')
  handleSendFriendRequest(
    @MessageBody() data: SocialFriendRequestDto,
    @ConnectedSocket() client: Socket,
  ): void {
    this.snakeGameService.handleFriendRequest(
      client.id,
      data.fromPlayerName,
      data.toPlayerId,
    );
  }

  @SubscribeMessage('social:accept_friend_request')
  handleAcceptFriendRequest(
    @MessageBody() data: SocialAcceptFriendRequestDto,
    @ConnectedSocket() client: Socket,
  ): void {
    this.snakeGameService.handleAcceptFriendRequest(
      client.id,
      data.requestFromPlayerId,
    );
  }

  public broadcast(event: string, data: any): void {
    if (this.server) this.server.emit(event, data);
  }

  public sendToClient(clientId: string, event: string, data: any): void {
    if (this.server) this.server.to(clientId).emit(event, data);
  }

  public sendNotificationToClient(
    clientId: string,
    notificationData: any,
  ): void {
    this.sendToClient(clientId, 'notification:new', notificationData);
  }
}
