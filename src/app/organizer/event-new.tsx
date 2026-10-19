import { router } from 'expo-router';
import { addDoc, collection, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { TimeField } from '@/components/TimeField';
import { Banner, Body, BuildingSelect, Button, Input, Overline, Row, Screen, Stack } from '@/components/ui';
import { db } from '@/lib/firebase';
import { logEvent } from '@/lib/log';
import { scheduleLocal } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { REMINDER_LEAD_MS } from '@/lib/types';

const REMINDER_BODY = 'Event ending soon. Any leftovers? Post in 30 sec.';

export default function NewEvent() {
  const { user, profile } = useSession();
  const [name, setName] = useState('');
  const [building, setBuilding] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!user || !building) return;
    if (endsAt.getTime() <= Date.now()) return setError('End time is in the past.');
    setBusy(true);
    try {
      const remindAt = new Date(endsAt.getTime() - REMINDER_LEAD_MS);
      // Without a push token (Expo Go on Android, simulator) the reminder is a local notification.
      const local = !profile?.pushToken;
      const ref = await addDoc(collection(db, 'eventSchedules'), {
        organizerId: user.uid,
        name: name.trim(),
        building,
        room: room.trim(),
        endsAt: Timestamp.fromDate(endsAt),
        remindAt: Timestamp.fromDate(remindAt),
        status: local ? 'local' : 'pending',
        createdAt: serverTimestamp(),
      });
      if (local) {
        const at = remindAt.getTime() > Date.now() + 5000 ? remindAt : new Date(Date.now() + 5000);
        const id = await scheduleLocal(at, 'Event ending soon', REMINDER_BODY, {
          type: 'reminder',
          scheduleId: ref.id,
          building,
          room: room.trim(),
          channel: 'local',
        });
        await updateDoc(ref, { localNotificationId: id });
      }
      logEvent('event_scheduled', { metadata: { scheduleId: ref.id, building, endsAt: endsAt.getTime(), channel: local ? 'local' : 'push' } });
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Save reminder" onPress={save} loading={busy} disabled={!building} />}>
      <Body muted>We'll ping you 10 minutes before it ends. Tapping the ping opens Post leftovers with the place filled in.</Body>
      <Input label="Event name (optional)" value={name} onChangeText={setName} placeholder="Hackathon kickoff" />
      <Stack gap={2}>
        <Overline>Where</Overline>
        <BuildingSelect value={building} onChange={setBuilding} />
        <Input value={room} onChangeText={setRoom} placeholder="Room, e.g. 1116" autoCapitalize="characters" />
      </Stack>
      <Row style={{ justifyContent: 'space-between' }}>
        <Overline>Ends at</Overline>
        <TimeField value={endsAt} onChange={setEndsAt} withDate />
      </Row>
      {error ? <Banner tone="bad">{error}</Banner> : null}
    </Screen>
  );
}
