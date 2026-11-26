import { useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { INTERESTS, type InterestId } from '@ryadom/shared';
import { EventCard, PeerCard, ZoneHeader } from '../../components/cards';
import { Banner, Body, Button, Chip, Empty } from '../../components/ui';
import { reconnect } from '../../state/actions';
import { useApp } from '../../state/store';
import { space, useTheme } from '../../theme';

export default function HereScreen() {
  const t = useTheme();
  const zone = useApp((s) => s.zone);
  const conn = useApp((s) => s.conn);
  const net = useApp((s) => s.net);
  const peersMap = useApp((s) => s.peers);
  const profiles = useApp((s) => s.profiles);
  const mode = useApp((s) => s.settings.visibility.mode);
  const lastError = useApp((s) => s.lastError);
  const [filter, setFilter] = useState<InterestId[]>([]);

  const peers = useMemo(() => {
    const all = Object.values(peersMap).sort((a, b) => b.since - a.since);
    if (!filter.length) return all;
    return all.filter((p) => p.profile.interests.some((i) => filter.includes(i)));
  }, [peersMap, filter]);

  const toggle = (id: InterestId) => setFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const events = zone?.venue?.events ?? [];
  const showSsidHint = Platform.OS !== 'web' && net.type === 'wifi' && !net.ssid;

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.l, gap: space.m, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      data={mode === 'hidden' ? [] : peers}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={conn.status === 'connecting'} onRefresh={reconnect} />}
      ListHeaderComponent={
        <View style={{ gap: space.m }}>
          <ZoneHeader
            zone={zone}
            status={conn.status}
            statusMessage={conn.message}
            ssid={net.ssid}
            hidden={mode === 'hidden'}
            count={Object.keys(peersMap).length}
            onVenuePress={zone?.venue ? () => router.push({ pathname: '/venue/[id]', params: { id: zone.venue!.id } }) : undefined}
          />
          {conn.status === 'offline' ? <Button kind="secondary" title="Переподключиться" onPress={reconnect} /> : null}
          {showSsidHint ? (
            <Banner tone="info">
              <Body>Название сети недоступно — люди определяются только по адресу сети. Разрешите геолокацию, чтобы точнее отличать сети.</Body>
              <Button kind="ghost" title="Разрешить" onPress={async () => { await Location.requestForegroundPermissionsAsync(); reconnect(); }} />
            </Banner>
          ) : null}
          {lastError ? <Banner tone="warning">{lastError}</Banner> : null}
          {events.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
              {events.map((ev) => (
                <EventCard key={ev.id} ev={ev} compact />
              ))}
            </ScrollView>
          ) : null}
          {mode !== 'hidden' && Object.keys(peersMap).length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {INTERESTS.map((i) => (
                <Chip key={i.id} label={`${i.emoji} ${i.label}`} selected={filter.includes(i.id)} onPress={() => toggle(i.id)} />
              ))}
            </ScrollView>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        conn.status !== 'online' || zone?.netType === 'cellular' ? undefined : mode === 'hidden' ? (
          <Empty emoji="👻" title="Режим невидимки" text="Вас никто не видит, и вы не видите людей. Включить видимость можно на вкладке «Я»." />
        ) : filter.length ? (
          <Empty emoji="🔍" title="Никого с такими целями" text="Попробуйте убрать часть фильтров." />
        ) : (
          <Empty
            emoji="🌱"
            title="Пока никого"
            text="Как только кто-то в этой сети откроет «Рядом», он появится здесь. Расскажите о приложении соседу по столику 😉"
          />
        )
      }
      renderItem={({ item }) => (
        <PeerCard
          peer={item}
          photo={profiles[item.id]?.profile.photo}
          highlight={filter}
          onPress={() => router.push({ pathname: '/peer/[id]', params: { id: item.id } })}
        />
      )}
    />
  );
}
