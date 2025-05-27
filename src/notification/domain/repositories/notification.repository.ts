import { NotificationEntity } from '../entities/notification.entity';
export abstract class NotificationRepository {
  abstract save(notification: NotificationEntity): Promise<NotificationEntity>;
}
