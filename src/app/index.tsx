import { Redirect } from 'expo-router';
import { Body, Loading, Screen, Title } from '@/components/ui';
import { firebaseConfigured } from '@/lib/firebase';
import { useSession } from '@/lib/session';

export default function Gate() {
  const { ready, role, user, profile, organizerReady } = useSession();

  if (!firebaseConfigured) {
    return (
      <Screen safeTop>
        <Title>Firebase isn't configured</Title>
        <Body muted>Copy .env.example to .env, fill in your Firebase web app config, then restart with `npx expo start -c`.</Body>
      </Screen>
    );
  }
  if (!ready) return <Loading />;
  if (!role) return <Redirect href="/role" />;
  if (role === 'organizer') return <Redirect href={organizerReady ? '/organizer' : '/organizer/sign-in'} />;

  // Student: the session provider signs in anonymously and creates the profile.
  if (!user || !profile) return <Loading />;
  if ((profile.buildings ?? []).length < 2) return <Redirect href="/student/onboarding" />;
  return <Redirect href="/student" />;
}
