import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { clockLabel } from '@/lib/time';
import { useTheme } from './ui';

/** Native time (or date+time) picker: compact inline on iOS, system dialog on Android. */
export function TimeField({ value, onChange, withDate = false }: { value: Date; onChange: (d: Date) => void; withDate?: boolean }) {
  const t = useTheme();
  const [androidMode, setAndroidMode] = useState<'date' | 'time' | null>(null);

  if (process.env.EXPO_OS === 'ios') {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <DateTimePicker
          value={value}
          mode={withDate ? 'datetime' : 'time'}
          display="compact"
          onChange={(_e, d) => d && onChange(d)}
          accentColor={t.colors.azure}
          themeVariant={t.scheme}
        />
      </View>
    );
  }

  const onAndroid = (e: DateTimePickerEvent, d?: Date) => {
    const mode = androidMode;
    setAndroidMode(null);
    if (e.type !== 'set' || !d) return;
    onChange(d);
    if (mode === 'date') setAndroidMode('time');
  };

  return (
    <>
      <Pressable
        onPress={() => setAndroidMode(withDate ? 'date' : 'time')}
        style={{
          alignSelf: 'flex-start',
          minHeight: 40,
          paddingHorizontal: t.space[4],
          justifyContent: 'center',
          borderRadius: t.radius.sm,
          backgroundColor: t.colors.surfaceRaised,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: t.colors.border,
        }}
      >
        <Text style={{ fontSize: 17, color: t.colors.text, fontVariant: ['tabular-nums'] }}>
          {withDate ? `${value.toLocaleDateString()} ${clockLabel(value)}` : clockLabel(value)}
        </Text>
      </Pressable>
      {androidMode && <DateTimePicker value={value} mode={androidMode} onChange={onAndroid} />}
    </>
  );
}
