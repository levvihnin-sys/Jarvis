import { useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { PRECISION_LABELS, VISIBILITY_MODES, type Precision } from '@ryadom/shared';
import { ProfileForm } from '../../components/ProfileForm';
import { Avatar, Banner, Body, Button, Card, Chip, Field, Label, Radio, Row, Wrap } from '../../components/ui';
import { resetIdentity, saveProfile, saveSettings, setVisibility, unblockUser, wipeEverything } from '../../state/actions';
import { useApp } from '../../state/store';
import { space, useTheme } from '../../theme';

function confirmDanger(title: string, message: string, ok: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: ok, style: 'destructive', onPress: run },
  ]);
}

export default function ProfileScreen() {
  const t = useTheme();
  const profile = useApp((s) => s.profile);
  const settings = useApp((s) => s.settings);
  const blocked = useApp((s) => s.blocked);
  const identity = useApp((s) => s.identity);
  const conn = useApp((s) => s.conn);
  const [editing, setEditing] = useState(false);
  const [server, setServer] = useState(settings.serverUrl);
  const vis = settings.visibility;

  if (!profile) return null;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: space.l, gap: space.l, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      {editing ? (
        <Card>
          <ProfileForm
            initial={profile}
            submitTitle="Сохранить"
            onSubmit={async (p) => {
              await saveProfile(p);
              setEditing(false);
            }}
          />
          <Button kind="ghost" title="Отмена" onPress={() => setEditing(false)} />
        </Card>
      ) : (
        <Card style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
          <Avatar avatar={profile.avatar} photo={profile.photo} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{profile.nickname}</Text>
            {profile.status ? <Body muted>📍 {profile.status}</Body> : null}
          </View>
          <Button kind="secondary" title="Изменить" onPress={() => setEditing(true)} />
        </Card>
      )}

      <View>
        <Label>Кто меня видит</Label>
        {VISIBILITY_MODES.map((m) => (
          <Radio key={m.id} selected={vis.mode === m.id} title={m.label} hint={m.hint} onPress={() => void setVisibility({ ...vis, mode: m.id })} />
        ))}
        {vis.mode === 'map' ? (
          <View style={{ gap: space.s, marginTop: space.s }}>
            <Label>Точность на карте</Label>
            <Wrap>
              {(Object.keys(PRECISION_LABELS) as Precision[]).map((p) => (
                <Chip key={p} label={PRECISION_LABELS[p]} selected={vis.precision === p} onPress={() => void setVisibility({ ...vis, precision: p })} />
              ))}
            </Wrap>
            <Body muted>Координаты огрубляются на телефоне до центра квадрата сетки — точное место не уходит никуда.</Body>
          </View>
        ) : null}
      </View>

      <View>
        <Label>Заблокированные</Label>
        {Object.keys(blocked).length === 0 ? (
          <Body muted>Никого.</Body>
        ) : (
          Object.entries(blocked).map(([id, b]) => (
            <Row key={id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Body>{b.nickname}</Body>
              <Button kind="ghost" title="Разблокировать" onPress={() => void unblockUser(id)} />
            </Row>
          ))
        )}
      </View>

      <View>
        <Label>Где хранятся данные</Label>
        <Banner tone="info">
          Профиль, переписка, список блокировок — только на этом телефоне. Сервер держит ваш профиль в памяти, пока приложение открыто,
          и пересылает зашифрованные сообщения, не сохраняя их.
        </Banner>
      </View>

      <View>
        <Label>Сервер</Label>
        <Field
          label="Адрес"
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={`Статус: ${conn.status === 'online' ? 'подключено' : conn.status === 'connecting' ? 'подключение…' : conn.message ?? 'нет связи'}`}
        />
        <Button kind="secondary" title="Сохранить адрес" disabled={server === settings.serverUrl || !/^https?:\/\//.test(server)} onPress={() => void saveSettings({ serverUrl: server.trim() })} />
      </View>

      <View style={{ gap: space.s }}>
        <Label>Безопасность</Label>
        {identity ? <Body muted>Ваш ключ: {identity.id.slice(0, 12)}…</Body> : null}
        <Button
          kind="secondary"
          title="Сменить ключи (новая личность)"
          onPress={() =>
            confirmDanger('Сменить ключи?', 'Для сервера и собеседников вы станете новым человеком. Переписка на этом телефоне удалится.', 'Сменить', () => void resetIdentity())
          }
        />
        <Button
          kind="danger"
          title="Удалить все мои данные"
          onPress={() => confirmDanger('Удалить всё?', 'Профиль, переписка и ключи будут стёрты с этого телефона без возможности восстановления.', 'Удалить', () => void wipeEverything())}
        />
      </View>
    </ScrollView>
  );
}
