import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAILY_REMINDER_ID_KEY = 'notif_daily_reminder_id';
const STREAK_RESCUE_ID_KEY = 'notif_streak_rescue_id';
const STREAK_RESCUE_DATE_KEY = 'notif_streak_rescue_date';

export const STREAK_RESCUE_HOUR = 23;
export const STREAK_RESCUE_MINUTE = 0;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function configureAndroidNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Android requires a channel before it will present high-priority remote
  // notifications reliably. Creating it is safe to repeat on every launch.
  await Notifications.setNotificationChannelAsync('default', {
    name: 'EverPage nudges',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await configureAndroidNotifications();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (!Device.isDevice) return null;
    await configureAndroidNotifications();
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const projectId: string | undefined =
      (Constants.easConfig as any)?.projectId ??
      (Constants.expoConfig?.extra as any)?.eas?.projectId;
    // A release build must be attached to an EAS project. Without this ID Expo
    // cannot create a routable Expo push token, so fail closed instead of
    // pretending the nudge setting is active.
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}

export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  streakDays: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyReminder();

  const hourLabel = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minuteLabel = minute.toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const timeLabel = `${hourLabel}:${minuteLabel} ${ampm}`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to read 📖',
      body:
        streakDays > 0
          ? `${timeLabel} — time to read. Your ${streakDays}-day streak is waiting.`
          : `${timeLabel} — time to read. Start your streak today!`,
      data: { navigateTo: 'log' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  });
  await AsyncStorage.setItem(DAILY_REMINDER_ID_KEY, id);
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = await AsyncStorage.getItem(DAILY_REMINDER_ID_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(DAILY_REMINDER_ID_KEY);
  }
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getStreakRescueScheduledDate(): Promise<string | null> {
  return AsyncStorage.getItem(STREAK_RESCUE_DATE_KEY);
}

export async function scheduleStreakRescueNotification(
  hour: number = STREAK_RESCUE_HOUR,
  minute: number = STREAK_RESCUE_MINUTE,
  forDate?: Date
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelStreakRescueNotification();

  const base = forDate ?? new Date();
  const target = new Date(base);
  target.setHours(hour, minute, 0, 0);

  if (target <= new Date()) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Don't break your streak! 🔥",
      body: "Your streak ends at midnight — log even 5 minutes to keep it alive.",
      data: { navigateTo: 'log' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target,
    },
  });
  await AsyncStorage.setItem(STREAK_RESCUE_ID_KEY, id);
  await AsyncStorage.setItem(STREAK_RESCUE_DATE_KEY, dateToStr(target));
}

export async function cancelStreakRescueNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = await AsyncStorage.getItem(STREAK_RESCUE_ID_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(STREAK_RESCUE_ID_KEY);
  }
  await AsyncStorage.removeItem(STREAK_RESCUE_DATE_KEY);
}

export async function rescheduleStreakRescueForTomorrow(
  hour: number = STREAK_RESCUE_HOUR,
  minute: number = STREAK_RESCUE_MINUTE
): Promise<void> {
  if (Platform.OS === 'web') return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await scheduleStreakRescueNotification(hour, minute, tomorrow);
}

export function setupNotificationResponseHandler(): () => void {
  if (Platform.OS === 'web') return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener(() => {
    router.navigate('/(tabs)/log');
  });
  return () => subscription.remove();
}
