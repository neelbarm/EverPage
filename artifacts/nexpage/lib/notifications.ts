import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  streakDays: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const hourLabel = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minuteLabel = minute.toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const timeLabel = `${hourLabel}:${minuteLabel} ${ampm}`;

  await Notifications.scheduleNotificationAsync({
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
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function setupNotificationResponseHandler(): () => void {
  if (Platform.OS === 'web') return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener(() => {
    router.navigate('/(tabs)/log');
  });
  return () => subscription.remove();
}
