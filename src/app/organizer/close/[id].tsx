import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';
import { RollStepper } from '@/components/kinetik/roll-stepper';
import { SegmentBar } from '@/components/kinetik/segment-bar';
import { Banner, Body, Button, Card, Display, Headline, Row, Screen, Stack, useTheme } from '@/components/ui';
import { saveSurvey, setThrownOut } from '@/lib/api';

type Speed = 'faster' | 'same' | 'slower';
type Reminder = 'yes' | 'no' | 'no_reminder';
type Attention = 'almost_none' | 'some' | 'a_lot';

export default function OrganizerWrapUp() {
  const t = useTheme();
  const { id, reason } = useLocalSearchParams<{ id: string; reason: string }>();
  const leftInRoom = reason === 'left_in_room';
  const [thrown, setThrown] = useState(0);
  const [unsure, setUnsure] = useState(false);
  const [speed, setSpeed] = useState<Speed | ''>('');
  const [reminder, setReminder] = useState<Reminder | ''>('');
  const [attention, setAttention] = useState<Attention | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      if (!leftInRoom) await setThrownOut(id, unsure ? null : thrown);
      await saveSurvey({
        role: 'organizer',
        postId: id,
        outcome: reason ?? 'closed',
        answers: {
          plates_thrown_out: leftInRoom || unsure ? null : thrown,
          posting_vs_groupme: speed || null,
          reminder_helped: reminder || null,
          cleanup_attention: attention || null,
        },
      });
      router.dismissTo('/organizer');
    } catch (e: any) {
      setError(e?.message ?? 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Done" onPress={submit} loading={busy} disabled={!speed || !reminder || !attention} />
          <Button title="Skip" variant="plain" size="md" onPress={() => router.dismissTo('/organizer')} />
        </>
      }
    >
      <Stack gap={2}>
        <Display>{leftInRoom ? 'It stays up' : 'Post closed'}</Display>
        <Body muted>A few taps tell us whether Plateful is worth keeping.</Body>
      </Stack>

      {!leftInRoom ? (
        <Card>
          <Stack gap={4}>
            <Headline>How many plates were thrown out?</Headline>
            <Row style={{ justifyContent: 'space-between' }}>
              <RollStepper label="Plates thrown out" value={thrown} onValueChange={setThrown} min={0} max={300} disabled={unsure} />
              <Row gap={2}>
                <Body muted>Not sure</Body>
                <Switch value={unsure} onValueChange={setUnsure} trackColor={{ true: t.colors.azure }} />
              </Row>
            </Row>
          </Stack>
        </Card>
      ) : null}

      <Question label="Posting here vs. texting the GroupMe">
        <SegmentBar<Speed | ''>
          label="Posting speed compared to GroupMe"
          value={speed}
          onChange={setSpeed}
          options={[
            { value: 'faster', label: 'Faster' },
            { value: 'same', label: 'Same' },
            { value: 'slower', label: 'Slower' },
          ]}
        />
      </Question>
      <Question label="Did the reminder help you remember to post?">
        <SegmentBar<Reminder | ''>
          label="Reminder helped"
          value={reminder}
          onChange={setReminder}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'no_reminder', label: 'No reminder' },
          ]}
        />
      </Question>
      <Question label="How much attention did the app take during cleanup?">
        <SegmentBar<Attention | ''>
          label="Attention during cleanup"
          value={attention}
          onChange={setAttention}
          options={[
            { value: 'almost_none', label: 'Almost none' },
            { value: 'some', label: 'Some' },
            { value: 'a_lot', label: 'A lot' },
          ]}
        />
      </Question>

      {error ? <Banner tone="bad">{error}</Banner> : null}
    </Screen>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={3}>
      <Headline>{label}</Headline>
      {children}
    </Stack>
  );
}
