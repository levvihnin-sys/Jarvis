import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { DM_TEXT_MAX, safetyCode } from '@ryadom/shared';
import { fmtTime } from '../../components/cards';
import { Avatar, Banner } from '../../components/ui';
import { openChat, requestProfile, sendText, sendWave } from '../../state/actions';
import { useApp, type ChatMessage } from '../../state/store';
import { radius, space, useTheme } from '../../theme';

const STATUS_LABEL: Record<NonNullable<ChatMessage['status']>, string> = {
  sending: '…',
  delivered: '✓',
  offline: 'не в сети — не доставлено',
  forbidden: 'вне общей сети — не доставлено',
};

export default function ChatScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useApp((s) => s.identity?.id);
  const chat = useApp((s) => s.chats[id]);
  const peer = useApp((s) => s.profiles[id] ?? s.peers[id]);
  const messages = useApp((s) => s.messages[id]);
  const [text, setText] = useState('');
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    openChat(id);
    if (!peer) requestProfile(id);
    return () => openChat(null);
  }, [id, peer]);

  const data = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const nickname = peer?.profile.nickname ?? chat?.nickname ?? 'Собеседник';
  const avatar = peer?.profile.avatar ?? chat?.avatar ?? { emoji: '💬', color: '#8E8E99' };
  const canSend = Boolean(peer || chat);

  const submit = useCallback(() => {
    const v = text.trim();
    if (!v) return;
    if (sendText(id, v.slice(0, DM_TEXT_MAX))) setText('');
  }, [id, text]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.push({ pathname: '/peer/[id]', params: { id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar avatar={avatar} photo={peer?.profile.photo} size={30} />
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{nickname}</Text>
            </Pressable>
          ),
        }}
      />
      <Pressable onPress={() => setShowCode((v) => !v)} style={{ paddingHorizontal: space.l, paddingVertical: space.s, backgroundColor: t.cardAlt }}>
        <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>
          {showCode && me ? `Код безопасности: ${safetyCode(me, id)} — сверьте при встрече` : '🔒 Сообщения зашифрованы и хранятся только на ваших телефонах'}
        </Text>
      </Pressable>
      {!peer && chat && !chat.contact ? (
        <View style={{ padding: space.m }}>
          <Banner tone="info">Собеседник сейчас не в вашей сети. Когда вы оба ответите друг другу, переписка продолжится из любого места.</Banner>
        </View>
      ) : null}
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => m.mid}
        contentContainerStyle={{ padding: space.l, gap: space.s }}
        ListEmptyComponent={
          <Text style={{ color: t.muted, textAlign: 'center', transform: [{ scaleY: -1 }] }}>
            Начните с приветствия — или просто помашите 👋
          </Text>
        }
        renderItem={({ item }) => (
          <View style={{ alignSelf: item.mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <View
              style={{
                backgroundColor: item.mine ? t.bubbleMine : t.bubbleTheirs,
                borderRadius: radius.l,
                borderBottomRightRadius: item.mine ? 4 : radius.l,
                borderBottomLeftRadius: item.mine ? radius.l : 4,
                paddingHorizontal: space.m,
                paddingVertical: 9,
                borderWidth: item.mine ? 0 : 1,
                borderColor: t.border,
              }}
            >
              <Text style={{ color: item.mine ? t.bubbleMineText : t.text, fontSize: item.kind === 'wave' ? 30 : 16, lineHeight: item.kind === 'wave' ? 36 : 22 }}>
                {item.kind === 'wave' ? '👋' : item.text}
              </Text>
            </View>
            <Text style={{ color: item.status === 'offline' || item.status === 'forbidden' ? t.danger : t.muted, fontSize: 11, marginTop: 2, alignSelf: item.mine ? 'flex-end' : 'flex-start' }}>
              {fmtTime(item.at)}
              {item.mine && item.status ? ` · ${STATUS_LABEL[item.status]}` : ''}
            </Text>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s, padding: space.m, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.card }}>
        <Pressable accessibilityLabel="Помахать" onPress={() => sendWave(id)} disabled={!canSend} style={{ padding: 8 }}>
          <Text style={{ fontSize: 24 }}>👋</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={t.muted}
          multiline
          maxLength={DM_TEXT_MAX}
          onSubmitEditing={submit}
          style={{ flex: 1, color: t.text, backgroundColor: t.bg, borderRadius: radius.l, paddingHorizontal: space.m, paddingVertical: 10, fontSize: 16, maxHeight: 120 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить"
          onPress={submit}
          disabled={!canSend || !text.trim()}
          style={{ backgroundColor: t.primary, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, opacity: !canSend || !text.trim() ? 0.4 : 1 }}
        >
          <Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 16 }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
