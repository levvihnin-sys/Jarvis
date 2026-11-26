import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Coords {
  lat: number;
  lon: number;
}

const DEFAULT_CENTER: L.LatLngTuple = [55.7558, 37.6173]; // Москва
const round = (x: number) => Math.round(x * 1e6) / 1e6;
const toCoords = (ll: L.LatLng): Coords => ({ lat: round(ll.lat), lon: round(L.Util.wrapNum(ll.lng, [-180, 180], true)) });

const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<span class="map-pin-head"></span>',
  iconSize: [30, 40],
  iconAnchor: [15, 38],
});

const GEO_ERRORS: Record<number, string> = {
  1: 'Браузер не дал доступ к геолокации. Разрешите его в настройках сайта или поставьте метку вручную.',
  2: 'Не удалось определить местоположение. Поставьте метку вручную.',
  3: 'Геолокация не ответила вовремя. Попробуйте ещё раз или поставьте метку вручную.',
};

/** Карта Leaflet: клик или перетаскивание метки задаёт координаты. */
export function MapPicker({ value, onChange }: { value: Coords | null; onChange: (c: Coords) => void }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialRef = useRef(value);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Карта создаётся один раз; начальный центр — сохранённая точка или Москва.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const start = initialRef.current;
    const map = L.map(el, {
      center: start ? [start.lat, start.lon] : DEFAULT_CENTER,
      zoom: start ? 16 : 11,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.on('click', (e: L.LeafletMouseEvent) => onChangeRef.current(toCoords(e.latlng)));
    // колесо мыши зумирует только после клика по карте — чтобы не мешать прокрутке формы
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Метка следует за value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([value.lat, value.lon]);
    } else {
      const marker = L.marker([value.lat, value.lon], { icon: pinIcon, draggable: true, autoPan: true });
      marker.on('dragend', () => onChangeRef.current(toCoords(marker.getLatLng())));
      marker.addTo(map);
      markerRef.current = marker;
    }
  }, [value]);

  function locate() {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Этот браузер не умеет определять местоположение. Поставьте метку вручную.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const c = { lat: round(pos.coords.latitude), lon: round(pos.coords.longitude) };
        onChangeRef.current(c);
        mapRef.current?.setView([c.lat, c.lon], 17);
      },
      (err) => {
        setGeoBusy(false);
        setGeoError(GEO_ERRORS[err.code] ?? GEO_ERRORS[2]!);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="map-picker">
      <div className="map-toolbar">
        <button type="button" className="btn btn-secondary btn-small" onClick={locate} disabled={geoBusy}>
          <span aria-hidden="true">◎</span> {geoBusy ? 'Определяем…' : 'Определить по геолокации браузера'}
        </button>
        <span className="map-coords">
          {value ? (
            <span className="mono">
              {value.lat.toFixed(5)}, {value.lon.toFixed(5)}
            </span>
          ) : (
            'Кликните по карте, чтобы поставить метку'
          )}
        </span>
      </div>
      <div ref={elRef} className="map" role="application" aria-label="Карта: кликните, чтобы указать место заведения" />
      {geoError && <p className="field-error">{geoError}</p>}
    </div>
  );
}
