import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { INTERESTS, PRECISION_METERS, VENUE_CATEGORIES, type BBox } from '@ryadom/shared';
import { PeopleMap } from '../../components/PeopleMap';
import type { MapMarker } from '../../components/mapTypes';
import { Banner, Body, Button, Card } from '../../components/ui';
import { refreshMap, setVisibility, shareLocation } from '../../state/actions';
import { useApp } from '../../state/store';
import { radius, space, useTheme } from '../../theme';

const DEFAULT_CENTER = { lat: 55.7558, lon: 37.6173 };
const REFRESH_MS = 15_000;
// в вебе слева сверху кнопки масштаба Leaflet
const OVERLAY_LEFT = Platform.OS === 'web' ? 56 : space.m;

export default function MapScreen() {
  const t = useTheme();
  const vis = useApp((s) => s.settings.visibility);
  const map = useApp((s) => s.map);
  const zoneVenue = useApp((s) => s.zone?.venue ?? null);
  const online = useApp((s) => s.conn.status === 'online');
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const bbox = useRef<BBox | null>(null);
  const sharing = vis.mode === 'map';

  const center = useMemo(
    () =>
      map.myLocation ??
      (zoneVenue?.lat != null && zoneVenue.lon != null ? { lat: zoneVenue.lat, lon: zoneVenue.lon } : DEFAULT_CENTER),
    // центр нужен только для первого показа карты
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Boolean(map.myLocation)],
  );

  const onRegion = useCallback((b: BBox) => {
    bbox.current = b;
    void refreshMap(b);
  }, []);

  useEffect(() => {
    if (sharing && online) void shareLocation().then(() => bbox.current && refreshMap(bbox.current));
  }, [sharing, online]);

  useEffect(() => {
    const id = setInterval(() => bbox.current && void refreshMap(bbox.current), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const v of map.venues) {
      if (v.lat == null || v.lon == null) continue;
      const cat = VENUE_CATEGORIES.find((c) => c.id === v.category);
      out.push({
        id: `v:${v.id}`,
        kind: 'venue',
        lat: v.lat,
        lon: v.lon,
        emoji: cat?.emoji ?? '📍',
        color: v.events.length ? t.accent : t.primary,
        title: v.name,
        subtitle: v.events.length ? `Событий: ${v.events.length} · ${v.events[0]!.title}` : v.address,
      });
    }
    if (sharing) {
      for (const p of map.people) {
        out.push({
          id: `p:${p.id}`,
          kind: 'person',
          lat: p.lat,
          lon: p.lon,
          emoji: p.avatar.emoji,
          color: p.avatar.color,
          title: p.nickname,
          subtitle: [p.venueName ? `в «${p.venueName}»` : null, p.interests.map((i) => INTERESTS.find((x) => x.id === i)?.emoji ?? '').join(' ')]
            .filter(Boolean)
            .join(' · '),
          radius: PRECISION_METERS[p.precision],
        });
      }
    }
    return out;
  }, [map.venues, map.people, sharing, t]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PeopleMap center={center} markers={markers} onRegion={onRegion} onMarkerPress={setSelected} />

      <View style={{ position: 'absolute', top: space.m, left: OVERLAY_LEFT, right: space.m, gap: space.s }} pointerEvents="box-none">
        {!sharing ? (
          <Card style={{ gap: space.s }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Вы не на карте</Text>
            <Body muted>
              Заведения и события видны всем. Людей на карте видят только те, кто сам на ней показывается — с точностью до района.
            </Body>
            <Button title="Показаться на карте (≈1 км)" onPress={() => void setVisibility({ mode: 'map', precision: 'area' })} />
          </Card>
        ) : (
          <View style={{ alignSelf: 'flex-start', backgroundColor: t.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: t.text, fontSize: 13 }}>
              🗺️ Вы на карте · {vis.precision === 'area' ? '≈1 км' : '≈250 м'} · рядом: {map.people.length}
            </Text>
          </View>
        )}
        {map.error ? <Banner tone="warning">{map.error}</Banner> : null}
      </View>

      {selected ? (
        <Card style={{ position: 'absolute', left: space.m, right: space.m, bottom: space.m, gap: space.s }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <Text style={{ fontSize: 30 }}>{selected.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{selected.title}</Text>
              {selected.subtitle ? <Body muted>{selected.subtitle}</Body> : null}
            </View>
            <Pressable accessibilityLabel="Закрыть" onPress={() => setSelected(null)} style={{ padding: 6 }}>
              <Text style={{ color: t.muted, fontSize: 20 }}>✕</Text>
            </Pressable>
          </View>
          <Button
            title={selected.kind === 'venue' ? 'Заведение и события' : 'Открыть профиль'}
            onPress={() => {
              const [kind, id] = [selected.kind, selected.id.slice(2)];
              setSelected(null);
              router.push(kind === 'venue' ? { pathname: '/venue/[id]', params: { id } } : { pathname: '/peer/[id]', params: { id } });
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}
