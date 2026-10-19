import { router, Stack as RouterStack } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { EmptyState } from '@/components/kinetik/empty-state';
import { Skeleton, SkeletonGroup } from '@/components/kinetik/skeleton-sweep';
import { Card, Footnote, Headline, Icon, LiveDot, Row, Stack, useTheme } from '@/components/ui';
import { alertText, buildingName, inRangeBuildings, placeLabel, tagLabel } from '@/lib/buildings';
import { db } from '@/lib/firebase';
import { listenError, logEvent } from '@/lib/log';
import { notifyLocally } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { sinceLabel } from '@/lib/time';
import type { Post } from '@/lib/types';
import { useNow } from '@/lib/useNow';

export default function StudentFeed() {
  const t = useTheme();
  const { profile } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(30000);
  const range = useMemo(() => inRangeBuildings(profile?.buildings ?? []), [profile?.buildings]);

  // Refs so the snapshot listener sees current values without resubscribing.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const localAlertsRef = useRef(false);
  localAlertsRef.current = Boolean(profile && !profile.pushToken && profile.alertsEnabled !== false);

  useEffect(() => {
    let first = true;
    return onSnapshot(
      query(collection(db, 'posts'), where('status', '==', 'active')),
      (snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post));
        setLoaded(true);
        // No push token (Expo Go on Android, simulator): alert on-device while the app is running.
        if (!first && localAlertsRef.current) {
          snap.docChanges().forEach((ch) => {
            const p = { id: ch.doc.id, ...ch.doc.data() } as Post;
            if (ch.type !== 'added' || !rangeRef.current.has(p.building)) return;
            const body = alertText(p);
            notifyLocally('Free food nearby', body, { type: 'post_alert', postId: p.id, channel: 'local' });
            logEvent('alert_sent', { postId: p.id, metadata: { kind: 'new_post', channel: 'local', body } });
          });
        }
        first = false;
      },
      listenError('feed'),
    );
  }, []);

  const visible = posts
    .filter((p) => range.has(p.building) && p.expiresAt.toMillis() > now)
    .sort((a, b) => (b.createdAt?.toMillis() ?? now) - (a.createdAt?.toMillis() ?? now));

  return (
    <>
      <RouterStack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/student/settings')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings">
              <Icon name="gearshape" size={20} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={{ padding: t.space[5], paddingTop: t.space[2], paddingBottom: t.space[10], gap: t.space[3], flexGrow: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        data={loaded ? visible : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <Footnote style={{ marginBottom: t.space[2], marginLeft: t.space[1] }}>
            {(profile?.buildings ?? []).map(buildingName).join(', ')} and next door
          </Footnote>
        }
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              style={{ marginTop: t.space[10] }}
              icon={<Icon name="fork.knife" size={22} color={t.colors.textMuted} />}
              title="No food right now"
              description={profile?.pushToken ? "We'll ping you when something goes up nearby." : 'Keep Plateful open to get alerts on this phone, or set up push in Settings.'}
            />
          ) : (
            <FeedSkeleton />
          )
        }
        renderItem={({ item }) => <PostCard post={item} now={now} />}
      />
    </>
  );
}

function PostCard({ post: p, now }: { post: Post; now: number }) {
  const t = useTheme();
  const gone = p.platesLeft <= 0;
  return (
    <Pressable onPress={() => router.push({ pathname: '/student/post/[id]', params: { id: p.id } })} accessibilityRole="button" accessibilityLabel={alertText(p)}>
      {({ pressed }) => (
        <Card padded={false} style={{ opacity: pressed ? 0.85 : 1 }}>
          {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={{ width: '100%', aspectRatio: 2 }} /> : null}
          <Row gap={4} style={{ padding: t.space[4], alignItems: 'flex-start' }}>
            <Stack gap={1} style={{ flex: 1 }}>
              <Row gap={2}>
                {gone ? null : <LiveDot size={6} />}
                <Footnote>served {sinceLabel(p.servedAt.toMillis(), now)}</Footnote>
              </Row>
              <Headline numberOfLines={2}>{p.food || 'Free food'}</Headline>
              <Footnote>{placeLabel(p.building, p.room)}</Footnote>
              {p.tags.length ? <Footnote style={{ color: t.colors.textSubtle }}>{p.tags.map(tagLabel).join(' · ')}</Footnote> : null}
            </Stack>
            <View style={{ alignItems: 'flex-end', minWidth: 56 }}>
              <Text style={{ fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -1, color: gone ? t.colors.textSubtle : t.colors.text, fontVariant: ['tabular-nums'] }}>
                {p.platesLeft}
              </Text>
              <Footnote>{gone ? 'all held' : p.platesLeft === 1 ? 'plate' : 'plates'}</Footnote>
            </View>
          </Row>
        </Card>
      )}
    </Pressable>
  );
}

function FeedSkeleton() {
  const t = useTheme();
  return (
    <SkeletonGroup>
      <Stack gap={3}>
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Row gap={4} style={{ alignItems: 'flex-start' }}>
              <Stack gap={2} style={{ flex: 1 }}>
                <Skeleton width={90} height={12} />
                <Skeleton width="80%" height={18} />
                <Skeleton width="50%" height={12} />
              </Stack>
              <Skeleton width={40} height={32} radius={t.radius.xs} />
            </Row>
          </Card>
        ))}
      </Stack>
    </SkeletonGroup>
  );
}
