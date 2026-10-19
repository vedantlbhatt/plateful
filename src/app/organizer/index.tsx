import * as Notifications from 'expo-notifications';
import { router, Stack as RouterStack } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { EmptyState } from '@/components/kinetik/empty-state';
import { Banner, Button, Card, Footnote, Group, Headline, Icon, ListRow, LiveDot, Row, Screen, Stack, useTheme } from '@/components/ui';
import { placeLabel } from '@/lib/buildings';
import { db } from '@/lib/firebase';
import { closeLabel } from '@/lib/labels';
import { listenError } from '@/lib/log';
import { registerForPush } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { clockLabel, sinceLabel } from '@/lib/time';
import type { Post } from '@/lib/types';
import { useNow } from '@/lib/useNow';

type Schedule = { id: string; name: string; building: string; room: string; endsAt: { toDate(): Date }; status: string; localNotificationId?: string };

export default function OrganizerHome() {
  const t = useTheme();
  const { user, profile, updateProfile, resetRole } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const now = useNow(30000);

  useEffect(() => {
    if (!user) return;
    const unsubPosts = onSnapshot(
      query(collection(db, 'posts'), where('organizerId', '==', user.uid)),
      (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post)),
      listenError('organizer posts'),
    );
    const unsubSched = onSnapshot(
      query(collection(db, 'eventSchedules'), where('organizerId', '==', user.uid)),
      (snap) => setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Schedule)),
      listenError('schedules'),
    );
    return () => {
      unsubPosts();
      unsubSched();
    };
  }, [user]);

  // Organizers need push for the end-of-event reminder.
  useEffect(() => {
    if (!profile) return;
    registerForPush().then((r) => {
      if (r.status === 'granted' && r.token !== profile.pushToken) updateProfile({ pushToken: r.token });
      if (r.status === 'denied') setPushNote('Notifications are off, so end-of-event reminders cannot reach you.');
      if (r.status === 'local_only') setPushNote('Reminders will be on-device notifications on this phone.');
    });
  }, [profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = posts.filter((p) => p.status === 'active').sort((a, b) => (b.createdAt?.toMillis() ?? now) - (a.createdAt?.toMillis() ?? now));
  const recent = posts
    .filter((p) => p.status === 'closed' && (p.closedAt?.toMillis() ?? 0) > now - 24 * 3600e3)
    .sort((a, b) => (b.closedAt?.toMillis() ?? 0) - (a.closedAt?.toMillis() ?? 0));
  const upcoming = schedules
    .filter((s) => s.endsAt.toDate().getTime() > now - 2 * 3600e3)
    .sort((a, b) => a.endsAt.toDate().getTime() - b.endsAt.toDate().getTime());
  const empty = active.length === 0 && upcoming.length === 0 && recent.length === 0;

  const signOutPrompt = () =>
    Alert.alert('Sign out?', user?.email ?? '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => resetRole().then(() => router.replace('/role')) },
    ]);

  return (
    <Screen>
      <RouterStack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={signOutPrompt} hitSlop={12} accessibilityRole="button" accessibilityLabel="Account">
              <Icon name="gearshape" size={20} />
            </Pressable>
          ),
        }}
      />

      <Stack gap={2}>
        <Button title="Post leftovers" icon="plus" onPress={() => router.push('/organizer/post-new')} />
        <Button title="Set an end-of-event reminder" icon="calendar.badge.clock" variant="secondary" size="md" onPress={() => router.push('/organizer/event-new')} />
        {pushNote ? <Banner>{pushNote}</Banner> : null}
      </Stack>

      {active.length > 0 ? (
        <Stack gap={2}>
          <Row gap={2} style={{ marginLeft: t.space[1] }}>
            <LiveDot />
            <Footnote style={{ fontWeight: '600' }}>Live now</Footnote>
          </Row>
          {active.map((p) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/organizer/post/[id]', params: { id: p.id } })} accessibilityRole="button">
              {({ pressed }) => (
                <Card style={{ opacity: pressed ? 0.85 : 1 }}>
                  <Row style={{ alignItems: 'flex-start' }} gap={4}>
                    <Stack gap={1} style={{ flex: 1 }}>
                      <Headline numberOfLines={1}>{p.food || 'Free food'}</Headline>
                      <Footnote>
                        {placeLabel(p.building, p.room)} · {p.createdAt ? sinceLabel(p.createdAt.toMillis(), now) : 'just now'}
                        {p.organizerLeft ? ' · left in room' : ''}
                      </Footnote>
                    </Stack>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', color: t.colors.text, fontVariant: ['tabular-nums'] }}>{p.platesLeft}</Text>
                      <Footnote>left</Footnote>
                    </View>
                  </Row>
                  <Row gap={4} style={{ marginTop: t.space[3] }}>
                    <Footnote>
                      <Text style={{ color: t.colors.text, fontWeight: '600' }}>{p.activeClaims}</Text> on hold
                    </Footnote>
                    <Footnote>
                      <Text style={{ color: t.colors.text, fontWeight: '600' }}>{p.pickups}</Text> picked up
                    </Footnote>
                  </Row>
                </Card>
              )}
            </Pressable>
          ))}
        </Stack>
      ) : null}

      {upcoming.length > 0 ? (
        <Group label="Reminders">
          {upcoming.map((s) => (
            <ListRow
              key={s.id}
              icon="clock"
              title={s.name || placeLabel(s.building, s.room)}
              subtitle={`Ends ${clockLabel(s.endsAt.toDate())} · ${reminderLabel(s.status)}`}
              onPress={() =>
                Alert.alert(s.name || 'Event', placeLabel(s.building, s.room), [
                  { text: 'Post leftovers now', onPress: () => router.push({ pathname: '/organizer/post-new', params: { building: s.building, room: s.room, scheduleId: s.id } }) },
                  {
                    text: 'Delete reminder',
                    style: 'destructive',
                    onPress: () => {
                      if (s.localNotificationId) Notifications.cancelScheduledNotificationAsync(s.localNotificationId).catch(() => {});
                      deleteDoc(doc(db, 'eventSchedules', s.id));
                    },
                  },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            />
          ))}
        </Group>
      ) : null}

      {recent.length > 0 ? (
        <Group label="Closed today">
          {recent.map((p) => (
            <ListRow
              key={p.id}
              title={p.food || 'Free food'}
              subtitle={`${p.pickups} of ${p.platesStart} picked up · ${closeLabel(p.closeReason)}`}
              onPress={() => router.push({ pathname: '/organizer/post/[id]', params: { id: p.id } })}
            />
          ))}
        </Group>
      ) : null}

      {empty ? (
        <EmptyState
          icon={<Icon name="tray" size={22} color={t.colors.textMuted} />}
          title="Nothing posted yet"
          description="When your event wraps up, post what's left. It takes about 30 seconds."
        />
      ) : null}
    </Screen>
  );
}

function reminderLabel(status: string) {
  if (status === 'sent') return 'reminder sent';
  if (status === 'failed') return 'reminder could not be sent';
  return 'reminder 10 min before';
}
