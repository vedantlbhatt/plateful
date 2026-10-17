import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastProvider } from '@/components/kinetik/toast-stack';
import { BRAND, useTheme } from '@/components/ui';
import { KinetikProvider } from '@/lib/kinetik/tokens/theme';
import { handleNotificationResponse } from '@/lib/notifications';
import { SessionProvider, useSession } from '@/lib/session';

function NotificationRouter() {
  const { ready } = useSession();
  useEffect(() => {
    if (!ready) return;
    // Cold start: the tap that launched the app. Wait for the index redirect to land first.
    let timer: ReturnType<typeof setTimeout> | undefined;
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) timer = setTimeout(() => handleNotificationResponse(r), 400);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [ready]);
  return null;
}

function AppStack() {
  const t = useTheme();
  const c = t.colors;
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <NotificationRouter />
      <Stack
        screenOptions={{
          headerTintColor: c.text,
          headerTitleStyle: { color: c.text, fontWeight: '600' },
          headerLargeTitleStyle: { color: c.text },
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="role" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="organizer/sign-in" options={{ title: '' }} />
        <Stack.Screen name="organizer/index" options={{ title: 'Plateful', headerLargeTitle: true, headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="organizer/post-new" options={{ title: 'Post leftovers', presentation: 'modal' }} />
        <Stack.Screen name="organizer/event-new" options={{ title: 'Event reminder', presentation: 'modal' }} />
        <Stack.Screen name="organizer/post/[id]" options={{ title: '' }} />
        <Stack.Screen name="organizer/close/[id]" options={{ title: 'Wrap up', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="student/onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="student/index" options={{ title: 'Nearby', headerLargeTitle: true, headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="student/post/[id]" options={{ title: '' }} />
        <Stack.Screen name="student/survey" options={{ title: '', presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="student/settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KinetikProvider scheme={scheme} colors={BRAND[scheme]}>
        <ToastProvider>
          <SessionProvider>
            <AppStack />
          </SessionProvider>
        </ToastProvider>
      </KinetikProvider>
    </GestureHandlerRootView>
  );
}
