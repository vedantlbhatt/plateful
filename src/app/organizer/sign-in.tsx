import { router } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { useState } from 'react';
import { FloatField } from '@/components/kinetik/float-field';
import { Banner, Body, Button, Display, Screen, Stack } from '@/components/ui';
import { auth } from '@/lib/firebase';
import { GT_EMAIL, useSession } from '@/lib/session';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
};

export default function OrganizerSignIn() {
  const { user, ensureOrganizerProfile, resetRole } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const awaitingVerification = Boolean(user && !user.isAnonymous && !user.emailVerified);

  const finish = async () => {
    await ensureOrganizerProfile();
    router.replace('/');
  };

  const submit = async () => {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!GT_EMAIL.test(e)) return setEmailError('Use your @gatech.edu email.');
    setEmailError(undefined);
    setBusy(true);
    try {
      const cred = mode === 'signup' ? await createUserWithEmailAndPassword(auth, e, password) : await signInWithEmailAndPassword(auth, e, password);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        setInfo(`We sent a link to ${e}. Open it, then come back here.`);
      } else {
        await finish();
      }
    } catch (err: any) {
      setError(MESSAGES[err?.code] ?? err?.message ?? 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const checkVerified = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true); // refresh so rules see email_verified
      if (auth.currentUser?.emailVerified) await finish();
      else setError('Not verified yet. Check your inbox and spam for the link.');
    } finally {
      setBusy(false);
    }
  };

  if (awaitingVerification) {
    return (
      <Screen
        footer={
          <>
            <Button title="I've verified my email" onPress={checkVerified} loading={busy} />
            <Button title="Use a different email" variant="plain" size="md" onPress={() => signOut(auth)} />
          </>
        }
      >
        <Stack gap={3}>
          <Display>Check your inbox</Display>
          <Body muted>{info ?? `Open the verification link we sent to ${user?.email}, then come back here.`}</Body>
        </Stack>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Button title="Resend link" variant="secondary" size="md" onPress={() => user && sendEmailVerification(user).then(() => setInfo('Sent again.'))} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button title={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} disabled={!email || password.length < 6} />
          <Button
            title={mode === 'signin' ? 'New organizer? Create an account' : 'Have an account? Sign in'}
            variant="plain"
            size="md"
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          />
        </>
      }
    >
      <Stack gap={3}>
        <Display>{mode === 'signin' ? 'Organizer sign in' : 'Create an organizer account'}</Display>
        <Body muted>Organizer accounts use your Georgia Tech email, so students know a post is real.</Body>
      </Stack>
      <Stack gap={4}>
        <FloatField
          label="GT email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError(undefined);
          }}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <FloatField
          label="Password"
          value={password}
          onChangeText={setPassword}
          hint={mode === 'signup' ? 'At least 6 characters' : undefined}
          secureTextEntry
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          onSubmitEditing={submit}
        />
        {error ? <Banner tone="bad">{error}</Banner> : null}
      </Stack>
      <Stack gap={1}>
        {mode === 'signin' ? (
          <Button
            title="Forgot password"
            variant="plain"
            size="md"
            onPress={() =>
              GT_EMAIL.test(email.trim())
                ? sendPasswordResetEmail(auth, email.trim()).then(() => setError('Reset link sent.'))
                : setEmailError('Enter your GT email first.')
            }
          />
        ) : null}
        <Button title="I'm a student" variant="plain" size="md" onPress={() => resetRole().then(() => router.replace('/role'))} />
      </Stack>
    </Screen>
  );
}
