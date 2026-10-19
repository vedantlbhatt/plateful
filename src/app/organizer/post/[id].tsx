import { router, useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
import { Odometer } from '@/components/kinetik/odometer';
import { useToast } from '@/components/kinetik/toast-stack';
import { TwoStepButton } from '@/components/kinetik/two-step-button';
import { Banner, Button, Card, Display, Footnote, LiveDot, Loading, Row, RoundButton, Screen, Stack, useTheme } from '@/components/ui';
import { closeFoodGone, editPlates, leaveInRoom } from '@/lib/api';
import { placeLabel, tagLabel } from '@/lib/buildings';
import { db } from '@/lib/firebase';
import { closeLabel } from '@/lib/labels';
import { listenError } from '@/lib/log';
import { clockLabel, sinceLabel } from '@/lib/time';
import type { Post } from '@/lib/types';
import { useNow } from '@/lib/useNow';

export default function OrganizerPost() {
  const t = useTheme();
  const toast = useToast();
  const { id, justPosted } = useLocalSearchParams<{ id: string; justPosted?: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [pending, setPending] = useState(0); // optimistic +/- taps not yet confirmed
  const [busy, setBusy] = useState(false);
  const now = useNow(15000);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'posts', id),
        (snap) => {
          if (snap.exists()) setPost({ id: snap.id, ...snap.data() } as Post);
        },
        listenError('organizer post'),
      ),
    [id],
  );

  if (!post) return <Loading />;
  const live = post.status === 'active';
  const shown = Math.max(0, post.platesLeft + pending);
  const alertsSent = (post as Post & { alertsSent?: number }).alertsSent;

  const bump = (delta: number) => {
    setPending((p) => p + delta);
    editPlates(post.id, delta)
      .catch((e) => toast.show({ title: 'Could not update the count', description: e?.message, tone: 'danger' }))
      .finally(() => setPending((p) => p - delta));
  };

  const foodGone = async () => {
    setBusy(true);
    try {
      await closeFoodGone(post.id);
      router.replace({ pathname: '/organizer/close/[id]', params: { id: post.id, reason: 'food_gone' } });
    } catch (e: any) {
      setBusy(false);
      toast.show({ title: 'Could not close the post', description: e?.message, tone: 'danger' });
    }
  };

  const leaving = () =>
    Alert.alert('Leave it in the room?', 'The post stays up so students can still grab plates. It closes on its own when plates run out, or 4 hours after serving.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave it up',
        onPress: async () => {
          setBusy(true);
          await leaveInRoom(post.id).catch(() => {});
          router.replace({ pathname: '/organizer/close/[id]', params: { id: post.id, reason: 'left_in_room' } });
        },
      },
    ]);

  const status = !live
    ? `Closed · ${closeLabel(post.closeReason)}`
    : justPosted && post.postTimeMs
      ? `Live in ${(post.postTimeMs / 1000).toFixed(1)}s${typeof alertsSent === 'number' ? ` · ${alertsSent} ${alertsSent === 1 ? 'student' : 'students'} alerted` : ''}`
      : `Live${typeof alertsSent === 'number' ? ` · ${alertsSent} ${alertsSent === 1 ? 'student' : 'students'} alerted` : ''}`;

  return (
    <Screen
      footer={
        live ? (
          <>
            <TwoStepButton onConfirm={foodGone} confirmLabel="Close post" cancelLabel="Keep it" disabled={busy}>
              Food is gone
            </TwoStepButton>
            {!post.organizerLeft ? <Button title="Leaving it in the room" variant="plain" size="md" onPress={leaving} disabled={busy} /> : null}
          </>
        ) : (
          <Button title="Wrap up" onPress={() => router.replace({ pathname: '/organizer/close/[id]', params: { id: post.id, reason: post.closeReason ?? 'closed' } })} />
        )
      }
    >
      <Stack gap={2}>
        <Row gap={2}>
          {live ? <LiveDot /> : null}
          <Footnote style={{ fontWeight: '600' }}>{status}</Footnote>
        </Row>
        <Display>{post.food || 'Free food'}</Display>
        <Footnote>
          {placeLabel(post.building, post.room)} · served {clockLabel(post.servedAt.toDate())}, {sinceLabel(post.servedAt.toMillis(), now)}
          {post.tags.length ? ` · ${post.tags.map(tagLabel).join(', ')}` : ''}
        </Footnote>
        {post.organizerLeft && live ? <Banner>You left this in the room. It is still live.</Banner> : null}
      </Stack>

      {post.photoUrl ? <Image source={{ uri: post.photoUrl }} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: t.radius.lg, borderCurve: 'continuous' }} /> : null}

      <Card style={{ paddingVertical: t.space[6] }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <RoundButton icon="minus" label="One fewer plate" onPress={() => bump(-1)} disabled={!live || shown <= 0} />
          <View style={{ alignItems: 'center' }}>
            <Odometer value={shown} style={{ fontSize: 64, lineHeight: 72, fontWeight: '700', letterSpacing: -2, color: t.colors.text }} />
            <Footnote>plates left</Footnote>
          </View>
          <RoundButton icon="plus" label="One more plate" onPress={() => bump(1)} disabled={!live} />
        </Row>
        <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: t.space[5] }} />
        <Row style={{ justifyContent: 'space-around' }}>
          <Stat n={post.activeClaims} label="on hold" />
          <Stat n={post.pickups} label="picked up" />
          <Stat n={post.platesStart} label="posted" />
        </Row>
      </Card>
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.colors.text, fontVariant: ['tabular-nums'] }}>{n}</Text>
      <Footnote>{label}</Footnote>
    </View>
  );
}
