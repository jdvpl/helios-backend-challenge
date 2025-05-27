import { Injectable } from '@nestjs/common';
import { PreferencesRepository } from '../domain/preferences.repository';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class PrismaPreferencesRepository extends PreferencesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  async isEnabled(userId: number, type: string): Promise<boolean> {
    const pref = await this.prisma.userPreference.findFirst({
      where: { userId, type },
    });
    return pref?.enabled ?? true;
  }

  async setPreference(
    userId: number,
    type: string,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.userPreference.upsert({
      where: { userId_type: { userId, type } },
      update: { enabled },
      create: { userId, type, enabled },
    });
  }

  async getByUserId(userId: number): Promise<{
    notificationsEnabled: boolean;
    disabledNotificationTypes?: string[];
  } | null> {
    const preferences = await this.prisma.userPreference.findMany({
      where: { userId },
    });

    if (preferences.length === 0) {
      return null;
    }

    const notificationsEnabled = preferences.some(
      (pref) => pref.type === 'notifications' && pref.enabled,
    );

    const disabledNotificationTypes = preferences
      .filter((pref) => !pref.enabled)
      .map((pref) => pref.type);

    return {
      notificationsEnabled,
      disabledNotificationTypes,
    };
  }
}
