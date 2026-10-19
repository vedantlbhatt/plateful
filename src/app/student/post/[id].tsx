import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
import { Odometer } from '@/components/kinetik/odometer';
import { ProgressBar } from '@/components/kinetik/progress-bar';
import { StatusButton, type ButtonStatus } from '@/components/kinetik/status-button';
import { useToast } from '@/components/kinetik/toast-stack';
import { Body, Button, Card, Display, Footnote, Headline, LiveDot, Loading, Row, Screen, Stack, useTheme } from '@/components/ui';
import { claimPlate, resolveClaim } from '@/lib/api';
import { placeLabel, tagLabel } from '@/lib/buildings';
import { db } from '@/lib/firebase';
import { listenError } from '@/lib/log';
import { useSession } from '@/lib/session';
import { wasSurveyed } from '@/lib/surveyed';
import { clockLabel, countdownLabel, sinceLabel } from '@/lib/time';
import { CLAIM_HOLD_MS, type Claim, type Post } from '@/lib/types';
import { useNow } from '@/lib/useNow';

const ERRORS: Record<string, string> = {
  'functions/resource-exhausted': 'Someone just took the last plate.',
  'functions/already-exists': 'You already have a plate held here.',
  'functions/failed-precondition': 'This post just closed.',
};

export default function StudentPost() {
  const t = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimStatus, setClaimStatus] = useState<ButtonStatus>('idle');
  const [busy, setBusy] = useState<null | 'pickup' | 'release'>(null);
  const [needsSurvey, setNeedsSurvey] = useState<Claim | null>(null);
  const now = useNow(1000);
  const expiring = useRef<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'posts', id),
        (snap) => {
          if (!snap.exists()) return setMissing(true);
          setPost({ id: snap.id, ...snap.data() } as Post);
        },
        listenError('post'),
      ),
    [id],
  );

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, 'claims'), where('studentId', '==', user.uid), where('postId', '==', id)),
      (snap) => setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Claim).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())),
      listenError('claims'),
    );
  }, [id, user]);

  const active = claims.find((c) => c.status === 'active') ?? null;
  const latest = claims[0] ?? null;
  const msLeft = active ? active.expiresAt.toMillis() - now : 0;

  // Hold ran out on screen: expire it now instead of waiting for the minute sweep.
  useEffect(() => {
    if (active && msLeft <= 0 && expiring.current !== active.id) {
      expiring.current = active.id;
      resolveClaim(active.id, 'expire').catch(() => {});
    }
  }, [active, msLeft]);

  // A resolved claim we haven't asked about yet gets a survey prompt. Re-checked on focus.
  const latestId = latest?.id;
  const latestStatus = latest?.status;
  useFocusEffect(
    useCallback(() => {
      if (!latestId || latestStatus === 'active') return setNeedsSurvey(null);
      wasSurveyed(latestId).then((done) => setNeedsSurvey(done ? null : latest));
    }, [latestId, latestStatus]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (missing) {
    return (
      <Screen>
        <Body muted>This post is gone.</Body>
      </Screen>
    );
  }
  if (!post) return <Loading />;

  const live = post.status === 'active' && post.expiresAt.toMillis() > now;
  const openSurvey = (claimId: string, outcome: string) => router.push({ pathname: '/student/survey', params: { claimId, postId: post.id, outcome } });

  const claim = async () => {
    setClaimStatus('loading');
    try {
      await claimPlate(post.id);
      setClaimStatus('success');
    } catch (e: any) {
      setClaimStatus('error');
      toast.show({ title: ERRORS[e?.code] ?? 'Could not claim a plate', description: ERRORS[e?.code] ? undefined : e?.message, tone: 'danger' });
    } finally {
      setTimeout(() => setClaimStatus('idle'), 1200);
    }
  };

  const resolve = async (action: 'pickup' | 'release') => {
    if (!active) return;
    setBusy(action);
    try {
      const { status } = await resolveClaim(active.id, action);
      openSurvey(active.id, status);
    } catch (e: any) {
      toast.show({ title: 'Something went wrong', description: e?.message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const confirmRelease = () =>
    Alert.alert('Release your plate?', 'It goes back to the count and the next student nearby gets a ping.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Release', style: 'destructive', onPress: () => resolve('release') },
    ]);

  const footer = active ? (
    <>
      <Button title="I picked it up" onPress={() => resolve('pickup')} loading={busy === 'pickup'} disabled={busy !== null} />
      <Button title="Release my plate" variant="plain" size="md" onPress={confirmRelease} disabled={busy !== null} />
    </>
  ) : live && post.platesLeft > 0 ? (
    <>
      <StatusButton status={claimStatus} onPress={claim} successLabel="Held for you" errorLabel="Try again">
        Claim a plate
      </StatusButton>
      <Footnote style={{ textAlign: 'center' }}>We hold it for 8 minutes while you walk over.</Footnote>
    </>
  ) : (
    <Button title={live ? 'No plates left right now' : 'This post is closed'} onPress={() => {}} disabled />
  );

  return (
    <Screen footer={footer}>
      {post.photoUrl ? <Image source={{ uri: post.photoUrl }} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: t.radius.lg, borderCurve: 'continuous' }} /> : null}

      <Stack gap={2}>
        <Row gap={2}>
          {live ? <LiveDot /> : null}
          <Footnote style={{ fontWeight: '600' }}>{live ? `Served ${sinceLabel(post.servedAt.toMillis(), now)}` : 'Closed'}</Footnote>
        </Row>
        <Display>{post.food || 'Free food'}</Display>
        <Headline style={{ fontWeight: '500' }}>{placeLabel(post.building, post.room)}</Headline>
        <Footnote>
          Served at {clockLabel(post.servedAt.toDate())}
          {post.tags.length ? ` · ${post.tags.map(tagLabel).join(', ')}` : ''}
        </Footnote>
      </Stack>

      {needsSurvey && !active ? (
        <Card>
          <Stack gap={3}>
            <Headline>
              {needsSurvey.status === 'expired' ? 'Your hold ran out.' : needsSurvey.status === 'released' ? 'You released your plate.' : 'Hope it was good.'}
            </Headline>
            <Button title="Answer 3 quick questions" variant="secondary" size="md" onPress={() => openSurvey(needsSurvey.id, needsSurvey.status)} />
          </Stack>
        </Card>
      ) : null}

      <Card style={{ alignItems: 'center', paddingVertical: t.space[6] }}>
        <Odometer value={post.platesLeft} style={{ fontSize: 72, lineHeight: 80, fontWeight: '700', letterSpacing: -2, color: post.platesLeft > 0 ? t.colors.text : t.colors.textSubtle }} />
        <Footnote>{post.platesLeft === 1 ? 'plate left' : 'plates left'}</Footnote>
      </Card>

      {active ? (
        <Card>
          <Stack gap={3}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Headline>Held for you</Headline>
              <Text style={{ fontSize: 22, fontWeight: '700', color: t.colors.text, fontVariant: ['tabular-nums'] }}>{countdownLabel(msLeft)}</Text>
            </Row>
            <ProgressBar value={Math.max(0, msLeft / CLAIM_HOLD_MS)} showValue={false} size="sm" />
            <Footnote>Head to {placeLabel(post.building, post.room)}, then tap "I picked it up".</Footnote>
          </Stack>
        </Card>
      ) : null}
      <View />
    </Screen>
  );
}
