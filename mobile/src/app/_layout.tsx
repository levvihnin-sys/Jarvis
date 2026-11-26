import '../lib/random';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { bootstrap } from '../state/actions';
import { useTheme } from '../theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
  useEffect(() => {
    void bootstrap();
  }, []);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: t.primary, background: t.bg, card: t.card, text: t.text, border: t.border } }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTintColor: t.primary, headerTitleStyle: { color: t.text }, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="peer/[id]" options={{ title: 'Профиль' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Чат' }} />
        <Stack.Screen name="venue/[id]" options={{ title: 'Заведение' }} />
      </Stack>
    </ThemeProvider>
  );
}
