import { Injectable, Logger } from '@nestjs/common';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { PreferencesRepository } from '../../../preferences/domain/preferences.repository';
import { NotificationEntity } from '../../domain/entities/notification.entity';

@Injectable()
export class SendNotificationUseCase {
  private readonly logger = new Logger(SendNotificationUseCase.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly preferencesRepository: PreferencesRepository,
  ) {}

  async execute(
    notificationData: Omit<NotificationEntity, 'createdAt' | 'id'>,
  ): Promise<NotificationEntity | null> {
    const notification = new NotificationEntity({
      targetId: notificationData.targetId,
      type: notificationData.type,
      message: notificationData.message,
      createdAt: new Date(),
      details: notificationData.details,
    });

    const numericTargetId = parseInt(notification.targetId, 10);
    let userPreferencesEnabled = true;

    if (!isNaN(numericTargetId)) {
      try {
        const preferences =
          await this.preferencesRepository.getByUserId(numericTargetId);
        userPreferencesEnabled = preferences?.notificationsEnabled ?? true;

        if (
          preferences?.disabledNotificationTypes?.includes(notification.type)
        ) {
          userPreferencesEnabled = false;
        }
      } catch (error: any) {
        this.logger.warn(
          `Preference check failed for targetId ${numericTargetId}: ${error.message}`,
        );
        userPreferencesEnabled = true;
      }
    }

    if (!userPreferencesEnabled) {
      this.logger.log(
        `Notification blocked by user preferences for targetId ${notification.targetId}.`,
      );
      return null;
    }

    try {
      const savedNotification =
        await this.notificationRepository.save(notification);
      return savedNotification;
    } catch (error: any) {
      this.logger.error(
        `Failed to save notification for ${notification.targetId}: ${error.message}`,
      );
      return null;
    }
  }
}
