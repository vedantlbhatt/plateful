import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SegmentBar } from '@/components/kinetik/segment-bar';
import { Banner, Body, Button, Display, Headline, Screen, Stack } from '@/components/ui';
import { saveSurvey } from '@/lib/api';
import { markSurveyed } from '@/lib/surveyed';

type YN = 'yes' | 'no' | '';
const YES_NO = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
];

export default function StudentSurvey() {
  const { claimId, postId, outcome } = useLocalSearchParams<{ claimId: string; postId: string; outcome: string }>();
  const pickedUp = outcome === 'picked_up';
  const [there, setThere] = useState<YN>('');
  const [worth, setWorth] = useState<YN>('');
  const [keep, setKeep] = useState<YN>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = async (skip = false) => {
    setBusy(true);
    try {
      if (!skip) {
        await saveSurvey({
          role: 'student',
          postId,
          claimId,
          outcome,
          answers: {
            food_was_there: pickedUp ? there || null : null,
            worth_the_walk: pickedUp ? worth || null : null,
            keep_alerts_on: keep || null,
          },
        });
      }
      await markSurveyed(claimId);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save.');
      setBusy(false);
    }
  };

  const complete = pickedUp ? Boolean(there && worth && keep) : Boolean(keep);
  const title = pickedUp ? 'Enjoy your plate' : outcome === 'released' ? 'Plate released' : 'Your hold ran out';

  return (
    <Screen
      footer={
        <>
          <Button title="Done" onPress={() => done()} disabled={!complete} loading={busy} />
          <Button title="Skip" variant="plain" size="md" onPress={() => done(true)} />
        </>
      }
    >
      <Stack gap={2}>
        <Display>{title}</Display>
        <Body muted>{pickedUp ? 'Three taps and you are done.' : 'One tap and you are done.'}</Body>
      </Stack>
      {pickedUp ? (
        <>
          <Q label="Was the food there when you arrived?">
            <SegmentBar<YN> label="Food was there" value={there} onChange={setThere} options={YES_NO} />
          </Q>
          <Q label="Was it worth the walk?">
            <SegmentBar<YN> label="Worth the walk" value={worth} onChange={setWorth} options={YES_NO} />
          </Q>
        </>
      ) : null}
      <Q label="Would you keep alerts on?">
        <SegmentBar<YN> label="Keep alerts on" value={keep} onChange={setKeep} options={YES_NO} />
      </Q>
      {error ? <Banner tone="bad">{error}</Banner> : null}
    </Screen>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={3}>
      <Headline>{label}</Headline>
      {children}
    </Stack>
  );
}
