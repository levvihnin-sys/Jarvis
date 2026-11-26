// Веб-версия карты (Leaflet + OpenStreetMap) — для разработки и демо в браузере.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PeopleMapProps } from './mapTypes';

export function PeopleMap({ center, markers, onRegion, onMarkerPress }: PeopleMapProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onRegion, onMarkerPress });
  handlers.current = { onRegion, onMarkerPress };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([center.lat, center.lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    const emit = () => {
      const b = m.getBounds();
      handlers.current.onRegion([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    m.on('moveend', emit);
    map.current = m;
    setTimeout(() => {
      m.invalidateSize();
      emit();
    }, 50);
    return () => {
      m.remove();
      map.current = null;
    };
    // центр задаётся один раз при создании карты
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const mk of markers) {
      if (mk.kind === 'person' && mk.radius) {
        L.circle([mk.lat, mk.lon], { radius: mk.radius / 2, color: mk.color, weight: 1, fillOpacity: 0.12 }).addTo(g);
      }
      const size = mk.kind === 'venue' ? 40 : 34;
      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        html: `<div style="width:${size}px;height:${size}px;border-radius:${mk.kind === 'venue' ? 10 : size / 2}px;background:${mk.color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:${size / 2}px;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer">${mk.emoji}</div>`,
      });
      L.marker([mk.lat, mk.lon], { icon, title: mk.title })
        .on('click', () => handlers.current.onMarkerPress(mk))
        .addTo(g);
    }
  }, [markers]);

  return <div ref={el} style={{ flex: 1, width: '100%', height: '100%', minHeight: 300 }} />;
}
