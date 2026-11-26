import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { venueCategoryLabel, type PublicVenue } from '@ryadom/shared';
import { EventCard } from '../../components/cards';
import { Banner, Body, Card, Label } from '../../components/ui';
import { apiUrl } from '../../lib/config';
import { useApp } from '../../state/store';
import { space, useTheme } from '../../theme';

export default function VenueScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const zoneVenue = useApp((s) => (s.zone?.venue?.id === id ? s.zone.venue : null));
  const mapVenue = useApp((s) => s.map.venues.find((v) => v.id === id) ?? null);
  const serverUrl = useApp((s) => s.settings.serverUrl);
  const [fetched, setFetched] = useState<PublicVenue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const venue = zoneVenue ?? fetched ?? mapVenue;

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(serverUrl, `/api/venues/${encodeURIComponent(id)}`))
      .then(async (r) => (r.ok ? ((await r.json()) as PublicVenue) : Promise.reject(new Error(String(r.status)))))
      .then((v) => alive && setFetched(v))
      .catch(() => alive && setError('Не удалось загрузить заведение'));
    return () => {
      alive = false;
    };
  }, [id, serverUrl]);

  if (!venue) return <View style={{ padding: space.l }}>{error ? <Banner tone="warning">{error}</Banner> : null}</View>;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: space.l, gap: space.l, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: venue.name }} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: t.muted, fontSize: 15 }}>{venueCategoryLabel(venue.category)}</Text>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{venue.name}</Text>
        {venue.address ? <Body muted>{venue.address}</Body> : null}
      </View>
      {zoneVenue ? <Banner tone="info">Вы подключены к Wi‑Fi этого места.</Banner> : null}
      {venue.description ? (
        <Card>
          <Body>{venue.description}</Body>
        </Card>
      ) : null}
      <View style={{ gap: space.s }}>
        <Label>События</Label>
        {venue.events.length ? venue.events.map((ev) => <EventCard key={ev.id} ev={ev} />) : <Body muted>Ближайших событий нет.</Body>}
      </View>
    </ScrollView>
  );
}
