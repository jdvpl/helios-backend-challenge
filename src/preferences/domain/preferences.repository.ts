export abstract class PreferencesRepository {
  abstract isEnabled(userId: number, type: string): Promise<boolean>;
  abstract setPreference(
    userId: number,
    type: string,
    enabled: boolean,
  ): Promise<void>;
  abstract getByUserId(userId: number): Promise<{
    notificationsEnabled: boolean;
    disabledNotificationTypes?: string[];
  } | null>;
}
