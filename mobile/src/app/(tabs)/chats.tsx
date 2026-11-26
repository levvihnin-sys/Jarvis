import { useMemo } from 'react';
import { Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fmtTime } from '../../components/cards';
import { Avatar, Empty } from '../../components/ui';
import { deleteChat } from '../../state/actions';
import { useApp } from '../../state/store';
import { radius, space, useTheme } from '../../theme';

export default function ChatsScreen() {
  const t = useTheme();
  const chats = useApp((s) => s.chats);
  const peers = useApp((s) => s.peers);
  const list = useMemo(() => Object.values(chats).sort((a, b) => b.lastAt - a.lastAt), [chats]);

  const askDelete = (id: string, name: string) => {
    const run = () => void deleteChat(id);
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Удалить переписку с ${name}?`)) run();
      return;
    }
    Alert.alert('Удалить переписку?', `История с ${name} удалится с этого телефона.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.l, gap: space.s, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      data={list}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={<Empty emoji="💬" title="Пока нет переписок" text="Откройте профиль человека рядом и напишите ему или помашите." />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
          onLongPress={() => askDelete(item.id, item.nickname)}
          style={({ pressed }) => ({ flexDirection: 'row', gap: space.m, padding: space.m, backgroundColor: t.card, borderRadius: radius.l, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}
        >
          <View>
            <Avatar avatar={item.avatar} size={50} />
            {peers[item.id] ? (
              <View style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: t.success, borderWidth: 2, borderColor: t.card }} />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                {item.nickname}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{fmtTime(item.lastAt)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s, marginTop: 2 }}>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }} numberOfLines={1}>
                {item.lastText || ' '}
              </Text>
              {item.unread > 0 ? (
                <View style={{ backgroundColor: t.accent, borderRadius: radius.pill, minWidth: 22, paddingHorizontal: 6, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 20 }}>{item.unread}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}
