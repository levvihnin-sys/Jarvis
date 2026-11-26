import { Pressable, Text, View } from 'react-native';
import {
  INTERESTS,
  venueCategoryLabel,
  type InterestId,
  type Peer,
  type VenueEvent,
  type ZoneInfo,
} from '@ryadom/shared';
import type { ConnStatus } from '../lib/presence';
import { radius, space, useTheme } from '../theme';
import { Avatar, Chip, Wrap } from './ui';

const interestShort = (id: InterestId) => {
  const i = INTERESTS.find((x) => x.id === id);
  return i ? `${i.emoji} ${i.label}` : id;
};

export function PeerCard({ peer, photo, highlight, onPress }: { peer: Peer; photo?: string; highlight?: InterestId[]; onPress: () => void }) {
  const t = useTheme();
  const p = peer.profile;
  const meta = [p.age ? `${p.age}` : null, p.tags.length ? p.tags.join(' · ') : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Профиль ${p.nickname}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: space.m,
        padding: space.m,
        backgroundColor: t.card,
        borderRadius: radius.l,
        borderWidth: 1,
        borderColor: t.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Avatar avatar={p.avatar} photo={photo} size={56} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
            {p.nickname}
          </Text>
          {peer.conf === 'wifi' ? <Text style={{ color: t.success, fontSize: 12 }}>● та же Wi‑Fi</Text> : null}
        </View>
        {meta ? <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{meta}</Text> : null}
        {p.status ? (
          <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={2}>
            📍 {p.status}
          </Text>
        ) : null}
        <Wrap style={{ marginTop: 2 }}>
          {p.interests.map((i) => (
            <Chip key={i} small label={interestShort(i)} selected={highlight?.includes(i)} />
          ))}
        </Wrap>
      </View>
    </Pressable>
  );
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `сегодня ${time}` : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${time}`;
}

export function EventCard({ ev, compact }: { ev: VenueEvent; compact?: boolean }) {
  const t = useTheme();
  const now = Date.now();
  const live = ev.startsAt <= now && ev.endsAt > now;
  return (
    <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.m, padding: space.m, width: compact ? 240 : undefined, gap: 4 }}>
      <Text style={{ color: live ? t.accent : t.muted, fontSize: 12, fontWeight: '700' }}>
        {live ? '● СЕЙЧАС' : fmtTime(ev.startsAt).toUpperCase()}
      </Text>
      <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }} numberOfLines={2}>
        {ev.title}
      </Text>
      {ev.description && !compact ? <Text style={{ color: t.muted, fontSize: 14 }}>{ev.description}</Text> : null}
      {ev.interests.length ? (
        <Wrap style={{ marginTop: 4 }}>
          {ev.interests.map((i) => (
            <Chip key={i} small label={interestShort(i)} />
          ))}
        </Wrap>
      ) : null}
    </View>
  );
}

export function ZoneHeader({
  zone,
  status,
  statusMessage,
  ssid,
  hidden,
  count,
  onVenuePress,
}: {
  zone: ZoneInfo | null;
  status: ConnStatus;
  statusMessage?: string;
  ssid: string | null;
  hidden: boolean;
  count: number;
  onVenuePress?: () => void;
}) {
  const t = useTheme();
  let emoji = '📶';
  let title = 'Wi‑Fi сеть';
  let subtitle = '';
  if (status === 'connecting' || status === 'idle') {
    emoji = '⏳';
    title = 'Подключаемся…';
  } else if (status === 'offline' || status === 'banned') {
    emoji = status === 'banned' ? '⛔' : '⚠️';
    title = status === 'banned' ? 'Доступ ограничен' : 'Нет связи';
    subtitle = statusMessage ?? '';
  } else if (zone?.netType === 'cellular') {
    emoji = '📱';
    title = 'Вы в мобильной сети';
    subtitle = 'Подключитесь к Wi‑Fi заведения, поезда или зала — и увидите людей рядом.';
  } else if (zone?.venue) {
    emoji = venueCategoryLabel(zone.venue.category).split(' ')[0] ?? '📍';
    title = zone.venue.name;
    subtitle = zone.venue.address || venueCategoryLabel(zone.venue.category);
  } else {
    title = ssid ? `Сеть «${ssid}»` : 'Ваша Wi‑Fi сеть';
    subtitle = zone?.conf === 'network' ? 'Определено по адресу сети' : 'Определено по названию и адресу сети';
  }
  const online = status === 'online' && zone?.netType !== 'cellular';
  return (
    <Pressable
      disabled={!zone?.venue || !onVenuePress}
      onPress={onVenuePress}
      style={{ backgroundColor: t.primary, borderRadius: radius.l, padding: space.l, gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.primaryText, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: t.primaryText, opacity: 0.85, fontSize: 14 }} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {zone?.venue && onVenuePress ? <Text style={{ color: t.primaryText, fontSize: 22 }}>›</Text> : null}
      </View>
      {online ? (
        <Text style={{ color: t.primaryText, fontSize: 14, fontWeight: '600' }}>
          {hidden ? '👻 Вы невидимы — людей не видно' : count === 0 ? 'Пока никого рядом' : `Рядом: ${count} ${plural(count, 'человек', 'человека', 'человек')}`}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export { fmtTime };
