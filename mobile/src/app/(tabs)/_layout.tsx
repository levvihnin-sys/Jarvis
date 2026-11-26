import { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useApp } from '../../state/store';
import { useTheme } from '../../theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const t = useTheme();
  const ready = useApp((s) => s.ready);
  const profile = useApp((s) => s.profile);
  const chats = useApp((s) => s.chats);
  const unread = useMemo(() => Object.values(chats).reduce((n, c) => n + c.unread, 0), [chats]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }
  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.card },
        headerTitleStyle: { color: t.text, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Здесь', tabBarIcon: icon('📶') }} />
      <Tabs.Screen name="map" options={{ title: 'Карта', tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="chats" options={{ title: 'Чаты', tabBarIcon: icon('💬'), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Я', tabBarIcon: icon('🙂') }} />
    </Tabs>
  );
}
