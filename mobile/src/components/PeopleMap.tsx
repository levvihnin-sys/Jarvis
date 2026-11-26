// Нативная карта (react-native-maps: Apple Maps на iOS, Google Maps на Android).
import { useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { bboxFrom, type PeopleMapProps } from './mapTypes';

export function PeopleMap({ center, markers, onRegion, onMarkerPress }: PeopleMapProps) {
  const initial = useRef<Region>({ latitude: center.lat, longitude: center.lon, latitudeDelta: 0.06, longitudeDelta: 0.06 }).current;
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={initial}
      showsPointsOfInterests={false}
      onMapReady={() => onRegion(bboxFrom(initial.latitude, initial.longitude, initial.latitudeDelta, initial.longitudeDelta))}
      onRegionChangeComplete={(r) => onRegion(bboxFrom(r.latitude, r.longitude, r.latitudeDelta, r.longitudeDelta))}
    >
      {markers.map((m) =>
        m.kind === 'person' && m.radius ? (
          <Circle
            key={`c-${m.id}`}
            center={{ latitude: m.lat, longitude: m.lon }}
            radius={m.radius / 2}
            strokeColor={`${m.color}88`}
            fillColor={`${m.color}22`}
          />
        ) : null,
      )}
      {markers.map((m) => (
        <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lon }} onPress={() => onMarkerPress(m)} tracksViewChanges={false}>
          <View
            style={{
              width: m.kind === 'venue' ? 40 : 34,
              height: m.kind === 'venue' ? 40 : 34,
              borderRadius: m.kind === 'venue' ? 10 : 17,
              backgroundColor: m.color,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#fff',
            }}
          >
            <Text style={{ fontSize: m.kind === 'venue' ? 20 : 17 }}>{m.emoji}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}
