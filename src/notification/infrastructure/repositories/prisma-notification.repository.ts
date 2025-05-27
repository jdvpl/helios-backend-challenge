import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { NotificationEntity } from '../../domain/entities/notification.entity';

@Injectable()
export class PrismaNotificationRepository extends NotificationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(notification: NotificationEntity): Promise<NotificationEntity> {
    const saved = await this.prisma.notification.create({
      data: {
        targetId: notification.targetId,
        type: notification.type,
        message: notification.message,
        createdAt: notification.createdAt,
        details: notification.details ?? undefined,
      },
    });

    return new NotificationEntity({
      id: saved.id,
      targetId: saved.targetId,
      type: saved.type,
      message: saved.message,
      createdAt: saved.createdAt,
      details: saved.details ?? undefined,
    });
  }
}
