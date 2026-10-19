import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch } from 'react-native';
import { Banner, BuildingChecklist, Button, Group, ListRow, Screen, Stack, useTheme } from '@/components/ui';
import { logEvent } from '@/lib/log';
import { registerForPush } from '@/lib/notifications';
import { useSession } from '@/lib/session';

export default function StudentSettings() {
  const t = useTheme();
  const { profile, updateProfile, resetRole } = useSession();
  const [picked, setPicked] = useState<string[]>(profile?.buildings ?? []);
  const [note, setNote] = useState<string | null>(null);
  const changed = JSON.stringify([...picked].sort()) !== JSON.stringify([...(profile?.buildings ?? [])].sort());
  const ok = picked.length >= 2 && picked.length <= 3;

  const save = async () => {
    await updateProfile({ buildings: picked });
    logEvent('buildings_set', { metadata: { buildings: picked, source: 'settings' } });
    setNote('Buildings saved.');
  };

  const toggleAlerts = async (on: boolean) => {
    await updateProfile({ alertsEnabled: on });
    logEvent('alerts_toggled', { metadata: { on } });
  };

  const retryPush = async () => {
    const r = await registerForPush();
    if (r.status === 'granted') {
      await updateProfile({ pushToken: r.token });
      setNote('Push alerts are set up.');
    } else if (r.status === 'denied') {
      setNote('Notifications are blocked. Turn them on for Plateful (or Expo Go) in system Settings.');
    } else {
      setNote(`No push on this phone (${r.reason}). Alerts still show while Plateful is open.`);
    }
  };

  return (
    <Screen>
      {note ? <Banner>{note}</Banner> : null}
      <Group
        label="Alerts"
        footer={profile?.pushToken ? 'Push is set up on this phone.' : 'No push on this phone yet. Alerts show only while Plateful is open.'}
      >
        <ListRow
          icon="bell.badge.fill"
          title="Food alerts"
          accessory={<Switch value={profile?.alertsEnabled !== false} onValueChange={toggleAlerts} trackColor={{ true: t.colors.azure }} />}
        />
        {!profile?.pushToken ? <ListRow title="Set up push alerts" onPress={retryPush} /> : null}
      </Group>

      <Stack gap={3}>
        <BuildingChecklist selected={picked} onChange={setPicked} />
        {changed ? <Button title={ok ? 'Save buildings' : 'Pick 2 or 3'} onPress={save} disabled={!ok} /> : null}
      </Stack>

      <Group>
        <ListRow
          title="Switch to organizer"
          destructive
          onPress={() =>
            Alert.alert('Switch role?', 'You will lose this anonymous student profile.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Switch', style: 'destructive', onPress: () => resetRole().then(() => router.replace('/role')) },
            ])
          }
        />
      </Group>
    </Screen>
  );
}
