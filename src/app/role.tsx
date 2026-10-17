import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Display, Footnote, Group, Icon, ListRow, Row, Screen, Stack, useTheme } from '@/components/ui';
import { useSession } from '@/lib/session';
import type { Role } from '@/lib/types';

export default function RolePicker() {
  const t = useTheme();
  const { chooseRole } = useSession();
  const pick = async (role: Role) => {
    await chooseRole(role);
    router.replace('/');
  };

  return (
    <Screen safeTop>
      <View style={{ height: t.space[10] }} />
      <Row gap={2}>
        <View style={{ width: 28, height: 28, borderRadius: 8, borderCurve: 'continuous', backgroundColor: t.colors.azure, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="fork.knife" size={15} color={t.colors.onAzure} weight="semibold" />
        </View>
        <Body style={{ fontWeight: '700', letterSpacing: -0.3 }}>Plateful</Body>
      </Row>
      <Stack gap={3}>
        <Display>Leftover catering, claimed before it's thrown out.</Display>
        <Body muted>Organizers post what's left. Students nearby get a ping and grab a plate.</Body>
      </Stack>
      <View style={{ height: t.space[4] }} />
      <Group label="I'm here to">
        <ListRow icon="megaphone" title="Post leftovers" subtitle="For event organizers. Needs a @gatech.edu email." onPress={() => pick('organizer')} />
        <ListRow icon="fork.knife" title="Find free food" subtitle="For students. No account, no sign-up." onPress={() => pick('student')} />
      </Group>
      <Footnote style={{ textAlign: 'center' }}>Plateful never asks for your location.</Footnote>
    </Screen>
  );
}
