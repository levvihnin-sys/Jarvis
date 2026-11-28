import { useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { INTERESTS, type InterestId } from '@ryadom/shared';
import { EventCard, PeerCard, ZoneHeader } from '../../components/cards';
import { Banner, Body, Button, Card, Chip, Empty, Field } from '../../components/ui';
import { reconnect, saveSettings } from '../../state/actions';
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
          {conn.status === 'offline' ? <ServerCard /> : null}
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

/** Когда сервер недоступен — даём сразу поправить его адрес (в APK по умолчанию localhost). */
function ServerCard() {
  const current = useApp((s) => s.settings.serverUrl);
  const [value, setValue] = useState(current);
  const valid = /^https?:\/\/[^\s/]+/.test(value.trim());
  return (
    <Card style={{ gap: space.s }}>
      <Body>
        Сервер {current} не отвечает. Укажите адрес компьютера, где запущен сервер «Рядом», — например http://192.168.1.10:8080
        (телефон и компьютер должны быть в одной Wi‑Fi сети).
      </Body>
      <Field label="Адрес сервера" value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Button
        title={value.trim() === current ? 'Переподключиться' : 'Сохранить и подключиться'}
        disabled={!valid}
        onPress={() => (value.trim() === current ? reconnect() : void saveSettings({ serverUrl: value.trim() }))}
      />
    </Card>
  );
}
