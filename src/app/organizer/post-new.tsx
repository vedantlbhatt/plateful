import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { FilterChips } from '@/components/kinetik/filter-chips';
import { RollStepper } from '@/components/kinetik/roll-stepper';
import { StatusButton, type ButtonStatus } from '@/components/kinetik/status-button';
import { TimeField } from '@/components/TimeField';
import { Banner, BuildingSelect, Button, Footnote, Input, Overline, Row, Screen, Stack, useTheme } from '@/components/ui';
import { createPost } from '@/lib/api';
import { TAGS } from '@/lib/buildings';
import { logEvent } from '@/lib/log';

const LAST_PLACE_KEY = 'plateful.lastPlace';
const TAG_OPTIONS = TAGS.map((tag) => ({ value: tag.id, label: tag.label }));

export default function PostLeftovers() {
  const t = useTheme();
  const params = useLocalSearchParams<{ building?: string; room?: string; scheduleId?: string }>();
  // The post timer starts at the first render of this screen.
  const openedAt = useRef(Date.now()).current;

  const [building, setBuilding] = useState<string | null>(params.building || null);
  const [room, setRoom] = useState(params.room ?? '');
  const [food, setFood] = useState('');
  const [plates, setPlates] = useState(10);
  const [servedAt, setServedAt] = useState(new Date(openedAt));
  const [tags, setTags] = useState<string[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [status, setStatus] = useState<ButtonStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logEvent('post_screen_opened', { metadata: { fromReminder: Boolean(params.scheduleId), scheduleId: params.scheduleId || null } });
    // Prefill from the last post when a reminder didn't supply the place.
    if (!params.building) {
      AsyncStorage.getItem(LAST_PLACE_KEY).then((raw) => {
        if (!raw) return;
        const last = JSON.parse(raw) as { building: string; room: string };
        setBuilding((b) => b ?? last.building);
        setRoom((r) => r || last.room);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPhoto = async (source: 'camera' | 'library') => {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(`${source === 'camera' ? 'Camera' : 'Photo'} access is off. You can post without a photo.`);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  };

  const post = async () => {
    if (!building) return setError('Pick a building first.');
    setError(null);
    setStatus('loading');
    try {
      const { postId } = await createPost({ food, building, room, platesStart: plates, servedAt, tags, photoUri, scheduleId: params.scheduleId || null }, openedAt);
      AsyncStorage.setItem(LAST_PLACE_KEY, JSON.stringify({ building, room })).catch(() => {});
      setStatus('success');
      setTimeout(() => router.replace({ pathname: '/organizer/post/[id]', params: { id: postId, justPosted: '1' } }), 600);
    } catch (e: any) {
      setStatus('error');
      setError(e?.message ?? 'Could not post. Check your connection.');
    }
  };

  return (
    <Screen
      footer={
        <StatusButton status={status} onPress={post} disabled={!building} successLabel="Live" errorLabel="Try again">
          {`Post ${plates} ${plates === 1 ? 'plate' : 'plates'}`}
        </StatusButton>
      }
    >
      {params.scheduleId ? <Banner>Filled in from your event. Check the count and post.</Banner> : null}

      <Stack gap={2}>
        <Overline>Photo</Overline>
        {photoUri ? (
          <Pressable onPress={() => setPhotoUri(null)} accessibilityRole="button" accessibilityLabel="Remove photo">
            <Image source={{ uri: photoUri }} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: t.radius.lg, borderCurve: 'continuous' }} />
            <Footnote style={{ marginTop: t.space[2], marginLeft: t.space[1] }}>Tap to remove</Footnote>
          </Pressable>
        ) : (
          <Row gap={2}>
            <Button title="Camera" icon="camera.fill" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => pickPhoto('camera')} />
            <Button title="Library" icon="photo.on.rectangle" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => pickPhoto('library')} />
          </Row>
        )}
      </Stack>

      <Input label="What's the food?" value={food} onChangeText={setFood} placeholder="Chick-fil-A nuggets" returnKeyType="done" />

      <Stack gap={2}>
        <Overline>Where</Overline>
        <BuildingSelect value={building} onChange={setBuilding} />
        <Input value={room} onChangeText={setRoom} placeholder="Room, e.g. 1116" autoCapitalize="characters" returnKeyType="done" />
      </Stack>

      <Row style={{ justifyContent: 'space-between' }}>
        <Stack gap={1}>
          <Overline>Plates</Overline>
          <Footnote style={{ marginLeft: t.space[1] }}>Hold to count faster</Footnote>
        </Stack>
        <RollStepper label="Plates" value={plates} onValueChange={setPlates} min={1} max={300} />
      </Row>

      <Row style={{ justifyContent: 'space-between' }}>
        <Overline>Served at</Overline>
        <TimeField value={servedAt} onChange={setServedAt} />
      </Row>

      <Stack gap={2}>
        <Overline>Dietary</Overline>
        <FilterChips options={TAG_OPTIONS} value={tags} onValueChange={setTags} accessibilityLabel="Dietary tags" />
      </Stack>

      {error ? <Banner tone="bad">{error}</Banner> : null}
      <View />
    </Screen>
  );
}
