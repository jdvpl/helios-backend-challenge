import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SnakeEntity } from '../domain/entities/snake.entity';
import {
  IndividualPlayerGameState,
  SharedGameState,
} from '../domain/types/snake-game-state.type';
import { SnakeGameGateway } from '../gateways/snake-game.gateway';
import { SendNotificationUseCase } from '../../notification/application/use-cases/send-notification.usecase';
import { SaveGameResultUseCase } from '../../game-result/application/use-cases/save-game-result.usecase';
import { nanoid } from 'nanoid';

const BOARD_WIDTH = 20;
const BOARD_HEIGHT = 15;
const GRID_SIZE = 20;
const INITIAL_SNAKE_LENGTH = 3;
const BASE_GAME_SPEED_MS = 320;
const SPEED_INCREMENT_PER_LEVEL_GROUP = 25;
const LEVEL_GROUP_FOR_SPEED_INCREASE = 3;
const MIN_GAME_SPEED_MS = 100;

const POINTS_PER_FOOD = 10;
const FOODS_PER_LEVEL = 3;
const MILESTONE_LEVEL_INTERVAL = 5;
const SCORE_BONUS_PER_MILESTONE = 50;
const TEAM_SCORE_MILESTONE_NOTIFICATION = 200;

const SNAKE_COLORS = [
  '#60DBFB',
  '#FB60F2',
  '#FBF360',
  '#60FB7A',
  '#FB8C60',
  '#C560FB',
  '#FF6B6B',
  '#4ECDC4',
];

@Injectable()
export class SnakeGameService {
  private readonly logger = new Logger(SnakeGameService.name);
  private playerGames: Map<string, IndividualPlayerGameState> = new Map();
  private sharedGameState: SharedGameState = {
    teamScores: { red: 0, blue: 0 },
    activePlayers: [],
  };
  private playerGameLoops: Map<string, NodeJS.Timeout> = new Map();
  private readonly gameBoardConfig = {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    gridSize: GRID_SIZE,
  };
  private foodsEatenThisLevel: Map<string, number> = new Map();
  private teamMilestoneNotified: { red: Set<number>; blue: Set<number> } = {
    red: new Set(),
    blue: new Set(),
  };

  constructor(
    @Inject(forwardRef(() => SnakeGameGateway))
    private readonly gameGateway: SnakeGameGateway,
    private readonly sendNotificationUseCase: SendNotificationUseCase,
    private readonly saveGameResultUseCase: SaveGameResultUseCase,
  ) {}

  private getNextAvailableColor(): string {
    const usedColors = new Set<string>();
    this.playerGames.forEach((pg) => usedColors.add(pg.snake.color));
    const availableColors = SNAKE_COLORS.filter((c) => !usedColors.has(c));
    return availableColors.length > 0
      ? availableColors[Math.floor(Math.random() * availableColors.length)]
      : SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
  }

  public handlePlayerJoin(
    clientId: string,
    name: string,
    preferredTeam: 'red' | 'blue',
  ): { success: boolean; message?: string } {
    this.logger.log(
      `Player ${name} (${clientId}) attempting to join team ${preferredTeam}.`,
    );

    if (this.playerGames.has(clientId)) {
      const playerGame = this.playerGames.get(clientId)!;
      this.logger.warn(
        `Player ${name} (${clientId}) already has game instance. State: Defeated=${playerGame.snake.isDefeated}, Paused=${playerGame.isPaused}, Active=${playerGame.isActive}`,
      );

      this.gameGateway.sendToClient(
        clientId,
        'game:your_state',
        this.getSanitizedIndividualState(playerGame),
      );
      this.gameGateway.sendToClient(
        clientId,
        'game:shared_state',
        this.getSharedGameState(),
      );
      this.gameGateway.sendToClient(clientId, 'game:joined_successfully', {
        playerId: playerGame.snake.id,
        name: playerGame.snake.name,
        team: playerGame.snake.team,
        color: playerGame.snake.color,
      });
      return {
        success: true,
        message:
          'Player already in session. State refreshed. Click Start/Retry to play.',
      };
    }

    const newSnake = new SnakeEntity();
    newSnake.id = clientId;
    newSnake.name = name.trim() || `Player-${clientId.substring(0, 4)}`;
    newSnake.color = this.getNextAvailableColor();
    newSnake.team = preferredTeam;
    this._initializeSnakeForPlayer(newSnake);
    this.foodsEatenThisLevel.set(clientId, 0);

    const individualGameState: IndividualPlayerGameState = {
      snake: newSnake,
      food: null,
      gameBoard: { ...this.gameBoardConfig },
      isActive: false,
      isPaused: false,
    };
    this._spawnFoodForPlayer(individualGameState);
    this.playerGames.set(clientId, individualGameState);

    this.logger.log(
      `Player ${newSnake.name} (${clientId}) created new game instance. Total players: ${this.playerGames.size}`,
    );
    this.updateActivePlayersList();

    this.gameGateway.sendToClient(clientId, 'game:joined_successfully', {
      playerId: newSnake.id,
      name: newSnake.name,
      team: newSnake.team,
      color: newSnake.color,
    });
    this.gameGateway.sendToClient(
      clientId,
      'game:your_state',
      this.getSanitizedIndividualState(individualGameState),
    );
    this.broadcastSharedGameState();
    return { success: true };
  }

  public handlePlayerStartTheirGame(clientId: string): void {
    const playerGame = this.playerGames.get(clientId);
    if (!playerGame) {
      this.gameGateway.sendToClient(clientId, 'error', {
        message: 'Your game session was not found. Please rejoin.',
      });
      return;
    }
    if (playerGame.isActive && !playerGame.isPaused) {
      this.gameGateway.sendToClient(clientId, 'info', {
        message: 'Your game is already running.',
      });
      return;
    }

    this.logger.log(
      `Player ${clientId} is starting/resuming their game. Was defeated: ${playerGame.snake.isDefeated}`,
    );
    if (playerGame.snake.isDefeated) {
      this._initializeSnakeForPlayer(playerGame.snake);
      this.foodsEatenThisLevel.set(clientId, 0);
      this._spawnFoodForPlayer(playerGame);
      this.sendGameNotification(
        clientId,
        'GAME_EVENT',
        'Retrying your game! Good luck!',
        { title: 'Game Retry' },
      );
    }

    playerGame.isPaused = false;
    this._startGameLoopForPlayer(clientId, playerGame);
    this.updateActivePlayersList();
    this.broadcastSharedGameState();
    this.gameGateway.sendToClient(
      clientId,
      'game:your_state',
      this.getSanitizedIndividualState(playerGame),
    );
    this.sendGameNotification(
      clientId,
      'GAME_EVENT',
      playerGame.snake.isDefeated ? 'Game Restarted!' : 'Game Resumed!',
      {},
    );
  }

  public handlePlayerPauseTheirGame(clientId: string): void {
    const playerGame = this.playerGames.get(clientId);
    if (
      !playerGame ||
      !playerGame.isActive ||
      playerGame.snake.isDefeated ||
      playerGame.isPaused
    ) {
      this.gameGateway.sendToClient(clientId, 'info', {
        message: 'Cannot pause: Game not running or already paused/defeated.',
      });
      return;
    }
    this.logger.log(`Player ${clientId} is pausing their game.`);
    playerGame.isPaused = true;
    this.updateActivePlayersList();
    this.broadcastSharedGameState();
    this.gameGateway.sendToClient(
      clientId,
      'game:your_state',
      this.getSanitizedIndividualState(playerGame),
    );
    this.sendGameNotification(
      clientId,
      'GAME_EVENT',
      "Game Paused. Click 'Resume Game' or press Space to continue.",
      { title: 'Game Paused' },
    );
  }

  private _initializeSnakeForPlayer(snake: SnakeEntity): void {
    snake.score = 0;
    snake.level = 1;
    snake.isDefeated = false;
    snake.pendingDirection = undefined;
    snake.isPaused = false;
    const startX = Math.floor(
      Math.random() * (this.gameBoardConfig.width - INITIAL_SNAKE_LENGTH),
    );
    const startY = Math.floor(Math.random() * this.gameBoardConfig.height);
    snake.segments = Array.from({ length: INITIAL_SNAKE_LENGTH }, (_, i) => ({
      x: startX + i,
      y: startY,
    })).reverse();
    snake.direction = 'RIGHT';
    this.logger.debug(
      `Snake ${snake.id} initialized/reset. Pos: X:${startX}, Y:${startY}. Level: ${snake.level}`,
    );
  }

  public handleClientDisconnect(clientId: string): void {
    this.logger.log(`Client ${clientId} disconnecting...`);
    if (this.playerGames.has(clientId)) {
      this._stopGameLoopForPlayer(clientId, true);
      const playerGame = this.playerGames.get(clientId)!;
      this.logger.log(
        `Player ${playerGame.snake.name} (${clientId}) removed from active games.`,
      );
      this.playerGames.delete(clientId);
      this.foodsEatenThisLevel.delete(clientId);
      this.updateActivePlayersList();
      this.broadcastSharedGameState();

      if (this.playerGames.size === 0) {
        this.logger.log('No players left. All game loops stopped.');
      }
    }
  }

  private _startGameLoopForPlayer(
    playerId: string,
    playerGame: IndividualPlayerGameState,
  ): void {
    if (this.playerGameLoops.has(playerId)) {
      clearInterval(this.playerGameLoops.get(playerId)!);
    }
    playerGame.isActive = true;
    playerGame.isPaused = false;

    const currentSpeed = this._calculateSpeed(playerGame.snake.level);
    this.logger.log(
      `Starting/Resuming game loop for player ${playerId} with speed ${currentSpeed}ms (Level: ${playerGame.snake.level})`,
    );

    const loop = setInterval(
      () => this._playerGameTick(playerId),
      currentSpeed,
    );
    this.playerGameLoops.set(playerId, loop);
  }

  private _stopGameLoopForPlayer(
    playerId: string,
    markCompletelyInactive: boolean,
  ): void {
    if (this.playerGameLoops.has(playerId)) {
      clearInterval(this.playerGameLoops.get(playerId)!);
      this.playerGameLoops.delete(playerId);
      this.logger.log(`Game loop explicitly stopped for player ${playerId}.`);
    }
    const playerGame = this.playerGames.get(playerId);
    if (playerGame && markCompletelyInactive) {
      playerGame.isActive = false;
    }
  }

  public handleChangeDirection(
    playerId: string,
    newDirection: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
  ): void {
    const playerGame = this.playerGames.get(playerId);
    if (
      !playerGame ||
      !playerGame.isActive ||
      playerGame.isPaused ||
      playerGame.snake.isDefeated
    )
      return;
    const snake = playerGame.snake;

    if (snake.segments.length > 1) {
      const head = snake.segments[0];
      const neck = snake.segments[1];
      if (
        (newDirection === 'UP' && head.y - 1 === neck.y) ||
        (newDirection === 'DOWN' && head.y + 1 === neck.y) ||
        (newDirection === 'LEFT' && head.x - 1 === neck.x) ||
        (newDirection === 'RIGHT' && head.x + 1 === neck.x)
      ) {
        return;
      }
    }
    snake.pendingDirection = newDirection;
  }

  private _playerGameTick(playerId: string): void {
    const playerGame = this.playerGames.get(playerId);
    if (
      !playerGame ||
      !playerGame.isActive ||
      playerGame.isPaused ||
      playerGame.snake.isDefeated
    ) {
      if (
        this.playerGameLoops.has(playerId) &&
        (!playerGame || !playerGame.isActive || playerGame.isPaused)
      ) {
        this.logger.debug(
          `Player ${playerId} tick: Game no longer running (active: ${playerGame?.isActive}, paused: ${playerGame?.isPaused}, defeated: ${playerGame?.snake.isDefeated}). Halting their loop.`,
        );
        this._stopGameLoopForPlayer(playerId, !playerGame?.isPaused);
      }
      return;
    }

    this._moveSnakeForPlayer(playerGame);
    this._checkCollisionsForPlayer(playerGame);

    if (!playerGame.snake.isDefeated) {
      this._checkFoodEatenForPlayer(playerGame);
    }

    this.gameGateway.sendToClient(
      playerId,
      'game:your_state',
      this.getSanitizedIndividualState(playerGame),
    );
  }

  private _moveSnakeForPlayer(playerGame: IndividualPlayerGameState): void {
    const { snake } = playerGame;
    if (snake.pendingDirection) {
      snake.direction = snake.pendingDirection;
      snake.pendingDirection = undefined;
    }
    if (!snake.segments || snake.segments.length === 0) {
      this._handlePlayerDefeat(playerGame, 'Invalid state (no segments)');
      return;
    }
    const head = { ...snake.segments[0] };
    switch (snake.direction) {
      case 'UP':
        head.y--;
        break;
      case 'DOWN':
        head.y++;
        break;
      case 'LEFT':
        head.x--;
        break;
      case 'RIGHT':
        head.x++;
        break;
    }
    snake.segments.unshift(head);
  }

  private _checkCollisionsForPlayer(
    playerGame: IndividualPlayerGameState,
  ): void {
    const { snake, gameBoard } = playerGame;
    if (!snake.segments || snake.segments.length === 0) return;
    const head = snake.segments[0];

    if (
      head.x < 0 ||
      head.x >= gameBoard.width ||
      head.y < 0 ||
      head.y >= gameBoard.height
    ) {
      this._handlePlayerDefeat(playerGame, 'collided with wall');
      return;
    }

    for (let i = 1; i < snake.segments.length; i++) {
      if (head.x === snake.segments[i].x && head.y === snake.segments[i].y) {
        this._handlePlayerDefeat(playerGame, 'collided with itself');
        return;
      }
    }
  }

  private _checkFoodEatenForPlayer(
    playerGame: IndividualPlayerGameState,
  ): void {
    const { snake } = playerGame;
    let ateFood = false;
    if (
      playerGame.food &&
      snake.segments[0].x === playerGame.food.x &&
      snake.segments[0].y === playerGame.food.y
    ) {
      ateFood = true;
      const foodValue = POINTS_PER_FOOD;
      snake.score += foodValue;
      this.sharedGameState.teamScores[snake.team] =
        (this.sharedGameState.teamScores[snake.team] || 0) + foodValue;

      let currentFoodsThisLevel =
        (this.foodsEatenThisLevel.get(snake.id) || 0) + 1;

      const itemAcquiredDetails = {
        item: 'Nutrient Pellet',
        value: foodValue,
        currentScore: snake.score,
        currentLevel: snake.level,
        title: 'Item Acquired!',
      };
      this.sendGameNotification(
        snake.id,
        'ITEM_ACQUIRED',
        `${snake.name} ate a pellet! +${foodValue} score.`,
        itemAcquiredDetails,
      );

      playerGame.food = null;
      this._spawnFoodForPlayer(playerGame);

      if (currentFoodsThisLevel >= FOODS_PER_LEVEL) {
        currentFoodsThisLevel = 0;
        const oldLevel = snake.level;
        snake.level++;

        this.sendGameNotification(
          snake.id,
          'LEVEL_UP',
          `Congratulations, ${snake.name}! You've reached Level ${snake.level}! (Length: ${snake.segments.length})`,
          {
            newLevel: snake.level,
            length: snake.segments.length,
            previousLevel: oldLevel,
            title: 'Level Up!',
          },
        );

        if (snake.level % MILESTONE_LEVEL_INTERVAL === 0) {
          this.sharedGameState.teamScores[snake.team] +=
            SCORE_BONUS_PER_MILESTONE;
          const rewardMessage = `${snake.name} (Team ${snake.team}) reached Level ${snake.level} & earned ${SCORE_BONUS_PER_MILESTONE} points for the team! Amazing!`;
          const challengeDetails = {
            achievement: `Level ${snake.level} Milestone!`,
            reward: `${SCORE_BONUS_PER_MILESTONE} points to Team ${snake.team}`,
            playerName: snake.name,
            team: snake.team,
            points: SCORE_BONUS_PER_MILESTONE,
            level: snake.level,
            title: 'Challenge Completed!',
          };

          this.sendGameNotification(
            snake.id,
            'CHALLENGE_COMPLETED',
            `Milestone Achievement: Level ${snake.level}! Your team gets +${SCORE_BONUS_PER_MILESTONE} points as a reward!`,
            challengeDetails,
          );

          this.playerGames.forEach((pg) => {
            if (pg.snake.id !== snake.id) {
              this.sendGameNotification(
                pg.snake.id,
                'GAME_EVENT',
                rewardMessage,
                challengeDetails,
              );
            }
          });
        }

        const previousSpeedGroup = Math.floor(
          (oldLevel - 1) / LEVEL_GROUP_FOR_SPEED_INCREASE,
        );
        const currentSpeedGroup = Math.floor(
          (snake.level - 1) / LEVEL_GROUP_FOR_SPEED_INCREASE,
        );
        if (snake.level > 1 && currentSpeedGroup > previousSpeedGroup) {
          this._stopGameLoopForPlayer(snake.id, false);
          this._startGameLoopForPlayer(snake.id, playerGame);
          this.sendGameNotification(
            snake.id,
            'GAME_EVENT',
            'Your snake feels faster!',
            {
              newSpeedInterval: this._calculateSpeed(snake.level),
              title: 'Speed Increased!',
            },
          );
        }
      }
      this.foodsEatenThisLevel.set(snake.id, currentFoodsThisLevel);

      this.checkTeamScoreMilestones(snake.team);
      this.updateActivePlayersList();
      this.broadcastSharedGameState();
    }
    if (!ateFood && snake.segments.length > 0) {
      snake.segments.pop();
    }
  }

  private checkTeamScoreMilestones(team: 'red' | 'blue'): void {
    const currentScore = this.sharedGameState.teamScores[team];
    const milestoneBase = TEAM_SCORE_MILESTONE_NOTIFICATION;
    const currentMilestoneValue =
      Math.floor(currentScore / milestoneBase) * milestoneBase;

    if (
      currentMilestoneValue > 0 &&
      !this.teamMilestoneNotified[team].has(currentMilestoneValue)
    ) {
      this.teamMilestoneNotified[team].add(currentMilestoneValue);

      const messageToOpponent = `Team ${team.toUpperCase()} has just reached ${currentMilestoneValue} points! Watch out!`;
      const opponentTeam = team === 'red' ? 'blue' : 'red';
      const messageToOwnTeam = `Your team (Team ${team.toUpperCase()}) reached ${currentMilestoneValue} points! Great work!`;

      this.playerGames.forEach((pg) => {
        if (pg.snake.team === opponentTeam) {
          this.sendGameNotification(
            pg.snake.id,
            'GAME_EVENT',
            messageToOpponent,
            {
              achievingTeam: team,
              scoreReached: currentMilestoneValue,
              title: 'Opponent Team Score Alert!',
            },
          );
        } else if (pg.snake.team === team) {
          this.sendGameNotification(
            pg.snake.id,
            'GAME_EVENT',
            messageToOwnTeam,
            {
              achievingTeam: team,
              scoreReached: currentMilestoneValue,
              title: 'Your Team Milestone!',
            },
          );
        }
      });
      this.logger.log(
        `Team ${team} reached ${currentMilestoneValue} points. Notified players.`,
      );
    }
  }

  private _calculateSpeed(level: number): number {
    return Math.max(
      MIN_GAME_SPEED_MS,
      BASE_GAME_SPEED_MS -
        Math.floor((level - 1) / LEVEL_GROUP_FOR_SPEED_INCREASE) *
          SPEED_INCREMENT_PER_LEVEL_GROUP,
    );
  }

  private _handlePlayerDefeat(
    playerGame: IndividualPlayerGameState,
    reason: string,
  ): void {
    const { snake } = playerGame;
    if (snake.isDefeated) return;

    snake.isDefeated = true;
    playerGame.isActive = false;
    this._stopGameLoopForPlayer(snake.id, true);
    this.logger.log(
      `Player ${snake.name} (${snake.id}) defeated: ${reason}. Final Score: ${snake.score}, Level: ${snake.level}`,
    );

    this.gameGateway.sendToClient(snake.id, 'player:you_are_defeated', {
      reason,
      finalScore: snake.score,
      levelReached: snake.level,
    });
    this.sendGameNotification(
      snake.id,
      'GAME_OVER',
      `Game Over: ${reason}. Your final score: ${snake.score}, Level: ${snake.level}.`,
      { reason, score: snake.score, level: snake.level, title: 'Defeated!' },
    );

    const defeatMessage = `${snake.name} (Team ${snake.team}) was defeated on their board (Score: ${snake.score}, Lvl: ${snake.level}).`;
    this.playerGames.forEach((pg) => {
      if (pg.snake.id !== snake.id) {
        this.sendGameNotification(pg.snake.id, 'PVP_EVENT', defeatMessage, {
          defeatedPlayerName: snake.name,
          team: snake.team,
          score: snake.score,
          level: snake.level,
          title: 'Player Defeated',
        });
      }
    });
    this.updateActivePlayersList();
    this.broadcastSharedGameState();
  }

  private _spawnFoodForPlayer(playerGame: IndividualPlayerGameState): void {
    if (playerGame.food) return;
    let pos: { x: number; y: number } | undefined;
    let valid = false;
    let attempts = 0;
    const { snake, gameBoard } = playerGame;
    do {
      pos = {
        x: Math.floor(Math.random() * gameBoard.width),
        y: Math.floor(Math.random() * gameBoard.height),
      };
      valid = !snake.segments.some(
        (seg) => seg.x === pos!.x && seg.y === pos!.y,
      );
      attempts++;
    } while (!valid && attempts < 50);

    if (valid && pos) {
      playerGame.food = {
        id: nanoid(5),
        ...pos,
        color: SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)],
        value: POINTS_PER_FOOD,
      };
    } else {
      playerGame.food = null;
      this.logger.warn(`Could not spawn food for player ${snake.id}`);
    }
  }

  private updateActivePlayersList(): void {
    this.sharedGameState.activePlayers = Array.from(this.playerGames.values())
      .map((pg) => ({
        id: pg.snake.id,
        name: pg.snake.name,
        team: pg.snake.team,
        score: pg.snake.score,
        level: pg.snake.level,
        isDefeated: pg.snake.isDefeated,
        isPaused: pg.isPaused,
      }))
      .sort((a, b) => b.score - a.score);
  }

  public broadcastSharedGameState(): void {
    if (!this.gameGateway) {
      this.logger.warn(
        '[SERVICE] broadcastSharedGameState called but gameGateway is not (yet) available.',
      );
      return;
    }
    this.updateActivePlayersList();
    this.gameGateway.broadcast('game:shared_state', this.sharedGameState);
  }

  public getSanitizedIndividualState(
    playerGame: IndividualPlayerGameState,
  ): Omit<IndividualPlayerGameState, 'isActive' | 'isPaused'> {
    const { isActive, isPaused, ...rest } = playerGame;
    return rest;
  }

  public getSharedGameState(): SharedGameState {
    this.updateActivePlayersList();
    return this.sharedGameState;
  }

  private async sendGameNotification(
    targetId: string,
    type: string,
    message: string,
    details?: any,
  ) {
    this.logger.log(
      `[SERVICE_SEND_NOTIF] Target: ${targetId}, Type: ${type}, Msg: "${message}", Details: ${JSON.stringify(details)}`,
    );
    try {
      const notificationToSend = await this.sendNotificationUseCase.execute({
        targetId: String(targetId),
        type,
        message,
        details,
      });
      if (notificationToSend) {
        this.gameGateway.sendNotificationToClient(
          String(targetId),
          notificationToSend,
        );
      } else {
        this.logger.log(
          `[SERVICE] Notification for ${targetId} (type ${type}) was NOT processed for sending by UseCase (e.g. preferences).`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `[SERVICE] Error in sendGameNotification pipeline for ${targetId} (Type: ${type}): ${error.message}`,
        error.stack,
      );
    }
  }

  public handleFriendRequest(
    fromPlayerId: string,
    fromPlayerNameProvided: string | undefined,
    toPlayerId: string,
  ): void {
    const fromPlayerGame = this.playerGames.get(fromPlayerId);
    const toPlayerGame = this.playerGames.get(toPlayerId);
    const fromName =
      fromPlayerNameProvided ||
      fromPlayerGame?.snake.name ||
      `Player ${fromPlayerId.substring(0, 4)}`;

    if (!toPlayerGame) {
      this.sendGameNotification(
        fromPlayerId,
        'error',
        'Target player not in game.',
        { title: 'Error' },
      );
      return;
    }
    if (fromPlayerId === toPlayerId) {
      this.sendGameNotification(
        fromPlayerId,
        'error',
        'You cannot send a friend request to yourself.',
        { title: 'Error' },
      );
      return;
    }

    this.sendGameNotification(
      toPlayerId,
      'FRIEND_REQUEST',
      `${fromName} sent you a friend request.`,
      { fromPlayerId, fromPlayerName: fromName, title: 'New Friend Request' },
    );
    this.sendGameNotification(
      fromPlayerId,
      'info',
      `Friend request sent to ${toPlayerGame.snake.name}.`,
      { title: 'Request Sent' },
    );
  }

  public handleAcceptFriendRequest(
    acceptingPlayerId: string,
    requestFromPlayerId: string,
  ): void {
    const acceptingPlayerGame = this.playerGames.get(acceptingPlayerId);
    const originalRequesterGame = this.playerGames.get(requestFromPlayerId);

    if (!acceptingPlayerGame || !originalRequesterGame) {
      this.sendGameNotification(
        acceptingPlayerId,
        'error',
        `Could not accept: ${!originalRequesterGame ? 'Original requester' : 'You are'} not in game.`,
        { title: 'Error' },
      );
      return;
    }

    this.sendGameNotification(
      requestFromPlayerId,
      'FRIEND_ACCEPTED',
      `${acceptingPlayerGame.snake.name} accepted your friend request!`,
      {
        acceptedByPlayerName: acceptingPlayerGame.snake.name,
        title: 'Friend Request Accepted',
      },
    );
    this.sendGameNotification(
      acceptingPlayerId,
      'SOCIAL_INFO',
      `You are now friends with ${originalRequesterGame.snake.name}.`,
      {
        friendPlayerName: originalRequesterGame.snake.name,
        title: 'New Friend!',
      },
    );
  }
}
