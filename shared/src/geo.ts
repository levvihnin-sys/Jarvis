// Огрубление координат. Точные координаты никогда не покидают устройство:
// клиент «привязывает» точку к центру ячейки сетки, сервер повторяет это для гарантии.
// Сетка фиксированная, поэтому многократные запросы не позволяют усреднением
// вычислить точное положение.

export type Precision = 'area' | 'block';

export const PRECISION_METERS: Record<Precision, number> = {
  area: 1000,
  block: 250,
};

export const PRECISION_LABELS: Record<Precision, string> = {
  area: 'Район (~1 км)',
  block: 'Квартал (~250 м)',
};

const METERS_PER_DEGREE_LAT = 111_320;

export interface LatLon {
  lat: number;
  lon: number;
}

export function coarsenLocation(lat: number, lon: number, precision: Precision): LatLon {
  const meters = PRECISION_METERS[precision];
  const latStep = meters / METERS_PER_DEGREE_LAT;
  const cellLat = Math.min(89.9, Math.max(-89.9, (Math.floor(lat / latStep) + 0.5) * latStep));
  const cos = Math.max(0.05, Math.cos((cellLat * Math.PI) / 180));
  const lonStep = meters / (METERS_PER_DEGREE_LAT * cos);
  let cellLon = (Math.floor(lon / lonStep) + 0.5) * lonStep;
  if (cellLon > 180) cellLon -= 360;
  if (cellLon < -180) cellLon += 360;
  return { lat: round6(cellLat), lon: round6(cellLon) };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

export function bboxContains([minLon, minLat, maxLon, maxLat]: BBox, p: LatLon): boolean {
  return p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon;
}

export function isBBoxValid([minLon, minLat, maxLon, maxLat]: BBox, maxSpanDeg = 2): boolean {
  return (
    minLon < maxLon &&
    minLat < maxLat &&
    maxLon - minLon <= maxSpanDeg * 2 &&
    maxLat - minLat <= maxSpanDeg
  );
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
