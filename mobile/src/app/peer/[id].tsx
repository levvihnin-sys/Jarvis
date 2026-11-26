import { useEffect } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { GENDERS, INTERESTS, REPORT_REASONS } from '@ryadom/shared';
import { Avatar, Banner, Body, Button, Card, Chip, Label, Wrap } from '../../components/ui';
import { blockUser, reportUser, requestProfile, sendWave } from '../../state/actions';
import { useApp } from '../../state/store';
import { space, useTheme } from '../../theme';

function confirm(title: string, message: string, ok: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: ok, style: 'destructive', onPress: onOk },
  ]);
}

export default function PeerScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const full = useApp((s) => s.profiles[id]);
  const listed = useApp((s) => s.peers[id]);
  const chat = useApp((s) => s.chats[id]);
  const peer = full ?? listed;

  useEffect(() => {
    requestProfile(id);
  }, [id]);

  if (!peer) {
    return (
      <View style={{ flex: 1, padding: space.l, backgroundColor: t.bg }}>
        <Banner tone="info">Человек вне вашей сети или скрыл профиль.</Banner>
        {chat ? <Button style={{ marginTop: space.l }} title="Открыть переписку" onPress={() => router.replace({ pathname: '/chat/[id]', params: { id } })} /> : null}
      </View>
    );
  }
  const p = peer.profile;
  const gender = GENDERS.find((g) => g.id === p.gender)?.label;

  const report = () => {
    const pick = (reason: (typeof REPORT_REASONS)[number]['id']) => {
      void reportUser(id, p.nickname, reason);
      router.back();
    };
    if (Platform.OS === 'web') {
      confirm('Пожаловаться', 'Жалоба отправится модерации, человек будет заблокирован у вас.', 'Пожаловаться', () => pick('other'));
      return;
    }
    Alert.alert('Пожаловаться', 'Что случилось? Человек также будет заблокирован у вас.', [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => pick(r.id) })),
      { text: 'Отмена', style: 'cancel' as const },
    ]);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: space.l, gap: space.l, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: p.nickname }} />
      <View style={{ alignItems: 'center', gap: space.s }}>
        <Avatar avatar={p.avatar} photo={p.photo} size={140} />
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>
          {p.nickname}
          {p.age ? <Text style={{ color: t.muted, fontWeight: '500' }}>, {p.age}</Text> : null}
        </Text>
        {gender ? <Body muted>{gender}</Body> : null}
        {peer.conf === 'wifi' ? <Text style={{ color: t.success }}>● В той же Wi‑Fi сети</Text> : null}
      </View>

      {p.status ? (
        <Card>
          <Label>Сейчас</Label>
          <Body>📍 {p.status}</Body>
        </Card>
      ) : null}

      <Card>
        <Label>Хочет</Label>
        <Wrap>
          {p.interests.map((i) => {
            const it = INTERESTS.find((x) => x.id === i);
            return <Chip key={i} label={it ? `${it.emoji} ${it.label}` : i} />;
          })}
        </Wrap>
        {p.tags.length ? (
          <>
            <Label>{'\n'}Интересы</Label>
            <Body>{p.tags.join(' · ')}</Body>
          </>
        ) : null}
      </Card>

      {p.bio ? (
        <Card>
          <Label>О себе</Label>
          <Body>{p.bio}</Body>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.m }}>
        <Button
          style={{ flex: 1 }}
          kind="secondary"
          icon="👋"
          title="Помахать"
          onPress={() => {
            sendWave(id);
            router.push({ pathname: '/chat/[id]', params: { id } });
          }}
        />
        <Button style={{ flex: 1 }} icon="💬" title="Написать" onPress={() => router.push({ pathname: '/chat/[id]', params: { id } })} />
      </View>

      <View style={{ flexDirection: 'row', gap: space.m }}>
        <Button
          style={{ flex: 1 }}
          kind="ghost"
          title="Заблокировать"
          onPress={() =>
            confirm('Заблокировать?', `${p.nickname} больше не увидит вас и не сможет написать.`, 'Заблокировать', () => {
              void blockUser(id, p.nickname);
              router.back();
            })
          }
        />
        <Button style={{ flex: 1 }} kind="ghost" title="Пожаловаться" onPress={report} />
      </View>
    </ScrollView>
  );
}
