import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { ProfileForm } from '../components/ProfileForm';
import { Banner, Body, Button, Card, Title } from '../components/ui';
import { saveProfile, saveSettings } from '../state/actions';
import { getState, useApp } from '../state/store';
import { space, useTheme } from '../theme';

type Step = 'welcome' | 'wifi' | 'profile';

const POINTS = [
  ['📶', 'Только одна Wi‑Fi сеть', 'Вы видите людей, подключённых к той же сети: в кафе, вагоне поезда, спортзале. Ушли из сети — пропали из списка.'],
  ['🔒', 'Данные — на телефоне', 'Профиль и переписка хранятся на устройстве. Сообщения шифруются сквозным шифрованием, сервер их не читает и не хранит.'],
  ['🗺️', 'Карта — по желанию', 'Показываться на карте можно только если вы сами включите это, и только с точностью до района или квартала.'],
] as const;

export default function Onboarding() {
  const t = useTheme();
  const [step, setStep] = useState<Step>('welcome');
  const adult = useApp((s) => s.settings.adultConfirmed);
  const [asking, setAsking] = useState(false);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: space.l, paddingTop: 64, gap: space.l, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      {step === 'welcome' ? (
        <>
          <Text style={{ fontSize: 48 }}>👋</Text>
          <Title>Рядом</Title>
          <Body muted>Знакомства и общение с людьми, которые прямо сейчас в том же месте, что и вы.</Body>
          {POINTS.map(([emoji, title, text]) => (
            <Card key={title} style={{ flexDirection: 'row', gap: space.m }}>
              <Text style={{ fontSize: 28 }}>{emoji}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
                <Body muted>{text}</Body>
              </View>
            </Card>
          ))}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: adult }}
            onPress={() => void saveSettings({ adultConfirmed: !adult })}
            style={{ flexDirection: 'row', gap: space.m, alignItems: 'center', paddingVertical: space.s }}
          >
            <View style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: t.primary, backgroundColor: adult ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {adult ? <Text style={{ color: t.primaryText, fontWeight: '800' }}>✓</Text> : null}
            </View>
            <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>Мне исполнилось 18 лет, я буду общаться уважительно</Text>
          </Pressable>
          <Button title="Продолжить" disabled={!adult} onPress={() => setStep(Platform.OS === 'web' ? 'profile' : 'wifi')} />
        </>
      ) : null}

      {step === 'wifi' ? (
        <>
          <Text style={{ fontSize: 48 }}>📶</Text>
          <Title>Как мы узнаём, что вы рядом</Title>
          <Body>
            Телефоны в одной Wi‑Fi сети выходят в интернет через один роутер. Сервер сравнивает адрес сети и хэш её названия —
            так он понимает, кто в том же месте. Ни GPS, ни название сети на сервер не отправляются.
          </Body>
          <Banner tone="info">
            iOS и Android показывают приложению название Wi‑Fi только при доступе к геолокации. Мы используем его лишь для этого,
            координаты никуда не уходят, пока вы сами не включите карту.
          </Banner>
          <Button
            title="Разрешить определять сеть"
            loading={asking}
            onPress={async () => {
              setAsking(true);
              try {
                await Location.requestForegroundPermissionsAsync();
              } finally {
                setAsking(false);
                setStep('profile');
              }
            }}
          />
          <Button kind="ghost" title="Не сейчас — только по адресу сети" onPress={() => setStep('profile')} />
        </>
      ) : null}

      {step === 'profile' ? (
        <>
          <Title>Ваш профиль</Title>
          <Body muted>Его увидят люди в той же сети. Изменить можно в любой момент.</Body>
          <ProfileForm
            initial={getState().profile}
            submitTitle="Готово — посмотреть, кто рядом"
            onSubmit={async (p) => {
              await saveProfile(p);
              router.replace('/');
            }}
          />
        </>
      ) : null}
    </ScrollView>
  );
}
