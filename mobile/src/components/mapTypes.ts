import type { BBox, LatLon } from '@ryadom/shared';

export interface MapMarker {
  id: string;
  kind: 'venue' | 'person';
  lat: number;
  lon: number;
  emoji: string;
  color: string;
  title: string;
  subtitle?: string;
  /** радиус неопределённости, м (для людей) */
  radius?: number;
}

export interface PeopleMapProps {
  center: LatLon;
  markers: MapMarker[];
  onRegion(bbox: BBox): void;
  onMarkerPress(m: MapMarker): void;
}

export function bboxFrom(lat: number, lon: number, dLat: number, dLon: number): BBox {
  const halfLat = Math.min(dLat / 2, 1);
  const halfLon = Math.min(dLon / 2, 2);
  return [
    Math.max(-180, lon - halfLon),
    Math.max(-90, lat - halfLat),
    Math.min(180, lon + halfLon),
    Math.min(90, lat + halfLat),
  ];
}
