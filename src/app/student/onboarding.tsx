import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BuildingChecklist, Button, Display, Body, Footnote, Icon, Screen, Stack, useTheme } from '@/components/ui';
import { logEvent } from '@/lib/log';
import { registerForPush } from '@/lib/notifications';
import { useSession } from '@/lib/session';

export default function StudentOnboarding() {
  const t = useTheme();
  const { profile, updateProfile } = useSession();
  const [step, setStep] = useState<'buildings' | 'alerts'>('buildings');
  const [picked, setPicked] = useState<string[]>(profile?.buildings ?? []);
  const [busy, setBusy] = useState(false);

  const saveBuildings = async () => {
    setBusy(true);
    await updateProfile({ buildings: picked });
    logEvent('buildings_set', { metadata: { buildings: picked, source: 'onboarding' } });
    setBusy(false);
    setStep('alerts');
  };

  const enableAlerts = async () => {
    setBusy(true);
    const r = await registerForPush();
    logEvent('push_permission', { metadata: { status: r.status, reason: r.status === 'local_only' ? r.reason : null } });
    if (r.status === 'granted') await updateProfile({ pushToken: r.token });
    router.replace('/student');
  };

  if (step === 'alerts') {
    return (
      <Screen
        safeTop
        footer={
          <>
            <Button title="Turn on alerts" onPress={enableAlerts} loading={busy} />
            <Button title="Not now" variant="plain" size="md" onPress={() => router.replace('/student')} />
          </>
        }
      >
        <View style={{ height: t.space[16] }} />
        <View style={{ width: 64, height: 64, borderRadius: t.radius.lg, borderCurve: 'continuous', backgroundColor: t.colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bell.badge.fill" size={30} color={t.colors.azure} />
        </View>
        <Stack gap={3}>
          <Display>Know the moment food goes up</Display>
          <Body muted>You'll only hear about your buildings and the ones next door. Plateful never asks for your location.</Body>
        </Stack>
      </Screen>
    );
  }

  const ok = picked.length >= 2 && picked.length <= 3;
  return (
    <Screen
      safeTop
      footer={
        <>
          <Button title={ok ? 'Continue' : `Pick ${2 - picked.length} more`} onPress={saveBuildings} disabled={!ok} loading={busy} />
          <Footnote style={{ textAlign: 'center' }}>{picked.length} of 3 picked · change anytime in Settings</Footnote>
        </>
      }
    >
      <Stack gap={3} style={{ marginTop: t.space[6] }}>
        <Display>Where do you spend your day?</Display>
        <Body muted>Pick 2 or 3 buildings. You'll hear about food there and next door.</Body>
      </Stack>
      <BuildingChecklist selected={picked} onChange={setPicked} max={3} />
    </Screen>
  );
}
