import type { ThemeId } from '@risk-game/shared/types/themes';
import type { Pool } from 'pg';
export interface UserPreferences {
    userId: string;
    theme: ThemeId;
    soundEnabled: boolean;
    musicEnabled: boolean;
    notificationEnabled: boolean;
    dmNotificationsBrowser?: boolean;
    dmNotificationsEmail?: boolean;
    autoReady: boolean;
    showTimer: boolean;
    showArmyNumbers: boolean;
    animationSpeed: 'slow' | 'normal' | 'fast';
    language: string;
}
export declare class UserPreferencesService {
    private pool;
    constructor(pool: Pool);
    getPreferences(userId: string): Promise<UserPreferences | null>;
    updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences | null>;
    updateTheme(userId: string, theme: string): Promise<ThemeId | null>;
    private createDefaultPreferences;
}
//# sourceMappingURL=UserPreferencesService.d.ts.map