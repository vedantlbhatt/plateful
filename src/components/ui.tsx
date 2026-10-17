/**
 * Plateful's design layer, built on the Kinetik tokens so app chrome and
 * Kinetik components share one palette, one spacing scale and one radius scale.
 *
 * Rules (do not break them screen by screen):
 * - Colour: monochrome ink + ONE accent, GT Tech Gold (Kinetik `azure`).
 *   Ink (`ember`) is for actions; gold is for food state: plate counts, the
 *   live dot, selections. Gold is never body text on a light ground.
 * - Shape: actions are pills, cards and grouped lists are `lg` (20),
 *   inputs are `md` (14). Every rounded rect uses continuous corners.
 * - Icons: SF Symbols on iOS, Material Symbols on Android. No emoji.
 * - Type: one display size per screen (`Display`), then Title / Headline /
 *   Body / Footnote. Counts use tabular numerals.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BUILDINGS, buildingName } from '@/lib/buildings';
import { useKinetikTheme } from '@/lib/kinetik/tokens/theme';
import type { Palette } from '@/lib/kinetik/tokens/tokens';

export const useTheme = useKinetikTheme;
export type { SFSymbol };

/** GT Tech Gold as the single accent, tuned per scheme for contrast. */
export const BRAND: Record<'light' | 'dark', Partial<Palette>> = {
  light: { azure: '#A4925A', azureSoft: 'rgba(164, 146, 90, 0.14)', onAzure: '#0A0A0A', sky: '#C9B67A' },
  dark: { azure: '#C2B278', azureSoft: 'rgba(194, 178, 120, 0.16)', onAzure: '#0A0A0A', sky: '#D9CC97' },
};

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  footer,
  safeTop = false,
}: {
  children: ReactNode;
  /** Pinned below the scroll view, clear of the home indicator. */
  footer?: ReactNode;
  /** For screens without a navigation header. */
  safeTop?: boolean;
}) {
  const t = useTheme();
  const scroll = (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.space[5], paddingBottom: t.space[10], gap: t.space[6] }}
      contentInsetAdjustmentBehavior={safeTop ? 'never' : 'automatic'}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  );
  // iOS large titles only collapse when the ScrollView is the screen's first child.
  if (!footer && !safeTop) return scroll;
  return (
    <SafeAreaView edges={safeTop ? ['top', 'bottom'] : ['bottom']} style={{ flex: 1, backgroundColor: t.colors.background }}>
      {scroll}
      {footer ? (
        <View style={{ paddingHorizontal: t.space[5], paddingTop: t.space[3], paddingBottom: t.space[2], gap: t.space[2] }}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 8;

export function Stack({ children, gap = 3, style }: { children: ReactNode; gap?: Gap; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ gap: t.space[gap] }, style]}>{children}</View>;
}

export function Row({ children, gap = 2, style }: { children: ReactNode; gap?: Gap; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: t.space[gap] }, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; numberOfLines?: number; selectable?: boolean };

function makeText(base: (t: ReturnType<typeof useTheme>) => TextStyle) {
  return function ThemedText({ children, style, muted, numberOfLines, selectable }: TextProps) {
    const t = useTheme();
    return (
      <Text numberOfLines={numberOfLines} selectable={selectable} style={[base(t), muted && { color: t.colors.textMuted }, style]}>
        {children}
      </Text>
    );
  };
}

export const Display = makeText((t) => ({ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8, color: t.colors.text }));
export const Title = makeText((t) => ({ fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, color: t.colors.text }));
export const Headline = makeText((t) => ({ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.colors.text }));
export const Body = makeText((t) => ({ fontSize: 16, lineHeight: 22, color: t.colors.text }));
export const Footnote = makeText((t) => ({ fontSize: 13, lineHeight: 18, color: t.colors.textMuted }));
/** Section label above a group. */
export const Overline = makeText((t) => ({ fontSize: 13, lineHeight: 18, fontWeight: '600', color: t.colors.textMuted, marginLeft: t.space[1] }));

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** SF Symbol name to Material Symbol name, for the icons this app uses. */
const ANDROID: Record<string, string> = {
  'fork.knife': 'restaurant',
  megaphone: 'campaign',
  'graduationcap.fill': 'school',
  'bell.badge.fill': 'notifications_active',
  'building.2': 'apartment',
  clock: 'schedule',
  'camera.fill': 'photo_camera',
  'photo.on.rectangle': 'photo_library',
  checkmark: 'check',
  'chevron.right': 'chevron_right',
  'chevron.up.chevron.down': 'unfold_more',
  plus: 'add',
  minus: 'remove',
  'calendar.badge.clock': 'event',
  gearshape: 'settings',
  xmark: 'close',
  tray: 'inbox',
};

export function Icon({ name, size = 20, color, weight = 'medium' }: { name: SFSymbol; size?: number; color?: string; weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  const t = useTheme();
  return (
    <SymbolView
      name={{ ios: name, android: (ANDROID[name] ?? 'circle') as never }}
      size={size}
      weight={weight}
      tintColor={color ?? t.colors.text}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
    />
  );
}

/** Gold dot that marks something as live. */
export function LiveDot({ size = 8 }: { size?: number }) {
  const t = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.colors.azure }} />;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'plain' | 'danger';
  icon?: SFSymbol;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/** Pill button. Press feedback lands on press-in: scale 0.97 over 120 ms. */
export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, size = 'lg', style, accessibilityHint }: ButtonProps) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const off = disabled || loading;
  const c = t.colors;
  const bg = variant === 'primary' ? c.ember : variant === 'secondary' ? c.surface : 'transparent';
  const fg = variant === 'primary' ? c.onEmber : variant === 'danger' ? c.danger : c.text;

  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: off, busy: loading }}
        disabled={off}
        onPress={onPress}
        onPressIn={() => scale.set(withTiming(0.97, { duration: 120, easing: EASE }))}
        onPressOut={() => scale.set(withTiming(1, { duration: 160, easing: EASE }))}
        style={{
          minHeight: size === 'lg' ? 54 : 44,
          paddingHorizontal: t.space[5],
          borderRadius: t.radius.pill,
          borderCurve: 'continuous',
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
          opacity: off && !loading ? 0.35 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={17} color={fg} weight="semibold" /> : null}
            <Text style={{ color: fg, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 }}>{title}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Round icon button, used for the live plate count. */
export function RoundButton({ icon, label, onPress, disabled, size = 56 }: { icon: SFSymbol; label: string; onPress: () => void; disabled?: boolean; size?: number }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? t.colors.surfaceSunken : t.colors.surfaceRaised,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: t.colors.border,
        opacity: disabled ? 0.3 : 1,
      })}
    >
      <Icon name={icon} size={Math.round(size * 0.36)} weight="semibold" />
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <Stack gap={2}>
      {label ? <Overline>{label}</Overline> : null}
      <TextInput
        placeholderTextColor={t.colors.textSubtle}
        style={[
          {
            minHeight: 50,
            paddingHorizontal: t.space[4],
            borderRadius: t.radius.md,
            borderCurve: 'continuous',
            backgroundColor: t.colors.surface,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: t.colors.border,
            fontSize: 17,
            color: t.colors.text,
          },
          style,
        ]}
        {...rest}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.lg,
          borderCurve: 'continuous',
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: t.colors.border,
          padding: padded ? t.space[4] : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Inset grouped list. Children are ListRows. */
export function Group({ children, label, footer }: { children: ReactNode; label?: string; footer?: string }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <Stack gap={2}>
      {label ? <Overline>{label}</Overline> : null}
      <Card padded={false}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginLeft: t.space[4] }} /> : null}
            {child}
          </View>
        ))}
      </Card>
      {footer ? <Footnote style={{ marginHorizontal: t.space[1] }}>{footer}</Footnote> : null}
    </Stack>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  value,
  onPress,
  accessory,
  selected,
  disabled,
  destructive,
}: {
  title: string;
  subtitle?: string;
  icon?: SFSymbol;
  value?: string;
  onPress?: () => void;
  accessory?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={selected !== undefined ? 'checkbox' : onPress ? 'button' : undefined}
      accessibilityState={selected !== undefined ? { checked: selected, disabled } : { disabled }}
      style={({ pressed }) => ({
        minHeight: subtitle ? 64 : 50,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[3],
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        backgroundColor: pressed ? t.colors.surfaceSunken : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {icon ? (
        <View style={{ width: 32, height: 32, borderRadius: t.radius.sm, borderCurve: 'continuous', backgroundColor: t.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={17} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, color: destructive ? t.colors.danger : t.colors.text, fontWeight: selected ? '600' : '400' }}>{title}</Text>
        {subtitle ? <Footnote>{subtitle}</Footnote> : null}
      </View>
      {value ? <Body muted>{value}</Body> : null}
      {accessory}
      {selected !== undefined ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? t.colors.azure : 'transparent',
            borderWidth: selected ? 0 : 1.5,
            borderColor: t.colors.borderStrong,
          }}
        >
          {selected ? <Icon name="checkmark" size={12} color={t.colors.onAzure} weight="bold" /> : null}
        </View>
      ) : onPress && !accessory ? (
        <Icon name="chevron.right" size={13} color={t.colors.textSubtle} weight="semibold" />
      ) : null}
    </Pressable>
  );
}

/** One-line status note: a coloured dot and text, no box. */
export function Banner({ tone = 'info', children }: { tone?: 'info' | 'good' | 'bad'; children: ReactNode }) {
  const t = useTheme();
  const dot = tone === 'good' ? t.colors.success : tone === 'bad' ? t.colors.danger : t.colors.textSubtle;
  return (
    <Row gap={2} style={{ paddingHorizontal: t.space[1], alignItems: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot, marginTop: 7 }} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: tone === 'bad' ? t.colors.danger : t.colors.textMuted }}>{children}</Text>
    </Row>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
      <ActivityIndicator color={t.colors.textMuted} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** Building field that opens a sheet with the full list. */
export function BuildingSelect({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `Building, ${buildingName(value)}` : 'Choose a building'}
        style={({ pressed }) => ({
          minHeight: 50,
          paddingHorizontal: t.space[4],
          borderRadius: t.radius.md,
          borderCurve: 'continuous',
          backgroundColor: pressed ? t.colors.surfaceSunken : t.colors.surface,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: t.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        })}
      >
        <Text style={{ fontSize: 17, color: value ? t.colors.text : t.colors.textSubtle }}>{value ? buildingName(value) : 'Choose a building'}</Text>
        <Icon name="chevron.up.chevron.down" size={14} color={t.colors.textSubtle} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.colors.background }}>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: t.space[5], paddingTop: t.space[5], paddingBottom: t.space[3] }}>
            <Title>Building</Title>
            <Button title="Cancel" variant="plain" size="md" onPress={() => setOpen(false)} />
          </Row>
          <FlatList
            data={BUILDINGS}
            keyExtractor={(b) => b.id}
            contentContainerStyle={{ paddingBottom: t.space[10] }}
            ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginLeft: t.space[5] }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  paddingHorizontal: t.space[5],
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: pressed ? t.colors.surfaceSunken : 'transparent',
                })}
              >
                <Body style={{ fontWeight: item.id === value ? '600' : '400' }}>{item.name}</Body>
                {item.id === value ? <Icon name="checkmark" size={16} color={t.colors.azure} weight="semibold" /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

/** Multi-select building list (students pick 2 to 3). */
export function BuildingChecklist({ selected, onChange, max = 3 }: { selected: string[]; onChange: (ids: string[]) => void; max?: number }) {
  return (
    <Group>
      {BUILDINGS.map((b) => {
        const on = selected.includes(b.id);
        return (
          <ListRow
            key={b.id}
            title={b.name}
            selected={on}
            disabled={!on && selected.length >= max}
            onPress={() => onChange(on ? selected.filter((x) => x !== b.id) : [...selected, b.id])}
          />
        );
      })}
    </Group>
  );
}
