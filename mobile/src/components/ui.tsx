// Базовые UI-элементы.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { Avatar as AvatarT } from '@ryadom/shared';
import { radius, space, useTheme } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.card, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.l, padding: space.l }, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: 22, fontWeight: '700' }}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme();
  return <Text style={[{ color: muted ? t.muted : t.text, fontSize: 15, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : kind === 'danger' ? t.danger : kind === 'secondary' ? t.cardAlt : 'transparent';
  const fg = kind === 'primary' ? t.primaryText : kind === 'danger' ? '#fff' : kind === 'secondary' ? t.text : t.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          paddingVertical: 13,
          paddingHorizontal: space.l,
          borderRadius: radius.m,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Text style={{ fontSize: 16 }}>{icon}</Text> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  small,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
}) {
  const t = useTheme();
  const content = (
    <Text style={{ color: selected ? t.primaryText : t.chipText, fontSize: small ? 12 : 14, fontWeight: '600' }}>{label}</Text>
  );
  const style = {
    backgroundColor: selected ? t.primary : t.chip,
    paddingVertical: small ? 3 : 7,
    paddingHorizontal: small ? 8 : 12,
    borderRadius: radius.pill,
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: space.l }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[
          {
            color: t.text,
            backgroundColor: t.card,
            borderColor: error ? t.danger : t.border,
            borderWidth: 1,
            borderRadius: radius.m,
            paddingHorizontal: space.m,
            paddingVertical: 11,
            fontSize: 16,
          },
          props.multiline ? { minHeight: 80, textAlignVertical: 'top' } : null,
        ]}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 13, marginTop: 4 }}>{error}</Text> : hint ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

export function Avatar({ avatar, photo, size = 48 }: { avatar: AvatarT; photo?: string; size?: number }) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatar.color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.5 }}>{avatar.emoji}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.s }, style]}>{children}</View>;
}

export function Wrap({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, style]}>{children}</View>;
}

export function Empty({ emoji, title, text, children }: { emoji: string; title: string; text?: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.s }}>
      <Text style={{ fontSize: 44 }}>{emoji}</Text>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: t.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>{text}</Text> : null}
      {children}
    </View>
  );
}

export function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  const t = useTheme();
  const color = tone === 'danger' ? t.danger : tone === 'warning' ? t.warning : t.primary;
  return (
    <View style={{ borderLeftWidth: 4, borderLeftColor: color, backgroundColor: t.cardAlt, padding: space.m, borderRadius: radius.s }}>
      {typeof children === 'string' ? <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }}>{children}</Text> : children}
    </View>
  );
}

export function Radio({ selected, title, hint, onPress }: { selected: boolean; title: string; hint?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        gap: space.m,
        padding: space.m,
        borderRadius: radius.m,
        borderWidth: 1.5,
        borderColor: selected ? t.primary : t.border,
        backgroundColor: selected ? t.chip : t.card,
        marginBottom: space.s,
      }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? t.primary : t.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {hint ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
