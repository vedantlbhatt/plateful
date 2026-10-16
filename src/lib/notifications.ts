import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { logEvent } from './log';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushRegistration =
  | { status: 'granted'; token: string }
  | { status: 'denied' }
  /** Permission granted but no remote token: Expo Go on Android (SDK 53+), simulator, or no EAS project id. */
  | { status: 'local_only'; reason: string };

export async function registerForPush(): Promise<PushRegistration> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Food alerts',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { status: 'denied' };

  if (!Device.isDevice) return { status: 'local_only', reason: 'simulator' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { status: 'local_only', reason: 'missing EAS_PROJECT_ID' };
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return { status: 'granted', token };
  } catch (e: any) {
    return { status: 'local_only', reason: e?.message ?? 'token error' };
  }
}

/** Fire a notification on this device right now (fallback when there is no push token). */
export async function notifyLocally(title: string, body: string, data: Record<string, unknown>) {
  await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
}

export async function scheduleLocal(at: Date, title: string, body: string, data: Record<string, unknown>) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

const handled = new Set<string>();

/** Routes a tapped notification and logs the open. Safe to call twice for the same response. */
export function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data = (response.notification.request.content.data ?? {}) as Record<string, any>;

  if (data.type === 'post_alert' && data.postId) {
    logEvent('alert_opened', { postId: data.postId, metadata: { alertId: data.alertId ?? null, channel: data.channel ?? 'push' } });
    router.push({ pathname: '/student/post/[id]', params: { id: data.postId } });
  } else if (data.type === 'reminder') {
    logEvent('reminder_opened', { metadata: { scheduleId: data.scheduleId ?? null, channel: data.channel ?? 'push' } });
    router.push({
      pathname: '/organizer/post-new',
      params: { building: data.building ?? '', room: data.room ?? '', scheduleId: data.scheduleId ?? '' },
    });
  }
}
