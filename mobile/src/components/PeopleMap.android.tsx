// Карта для Android: Leaflet + OpenStreetMap внутри WebView.
// Google Maps (react-native-maps) на Android требует API-ключ и без него падает,
// а OSM работает без ключей. На iOS используется нативная Apple Maps (PeopleMap.tsx).
import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import type { PeopleMapProps } from './mapTypes';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

// Типы react-native-webview под React 19 сводятся к never (пересечение пропсов трёх платформ),
// поэтому описываем только то, что используем.
interface WebViewHandle {
  injectJavaScript(js: string): void;
}
const WebView = RNWebView as unknown as ComponentType<{
  ref?: Ref<WebViewHandle>;
  source: { html: string; baseUrl?: string };
  originWhitelist?: string[];
  onMessage?: (e: WebViewMessageEvent) => void;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

function html(lat: number, lon: number): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#ddd}
.mk{display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}</style>
</head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
(function(){
  var post=function(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));};
  if(!window.L){post({type:'error',message:'Не удалось загрузить карту (нет интернета?)'});return;}
  var map=L.map('map',{zoomControl:false}).setView([${lat},${lon}],13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  var layer=L.layerGroup().addTo(map);
  function emit(){var b=map.getBounds();post({type:'region',bbox:[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]});}
  map.on('moveend',emit);
  window.setMarkers=function(list){
    layer.clearLayers();
    list.forEach(function(m){
      if(m.kind==='person'&&m.radius){L.circle([m.lat,m.lon],{radius:m.radius/2,color:m.color,weight:1,fillOpacity:.12}).addTo(layer);}
      var s=m.kind==='venue'?40:34;
      var el=document.createElement('div');
      el.className='mk';
      el.style.cssText='width:'+s+'px;height:'+s+'px;border-radius:'+(m.kind==='venue'?10:s/2)+'px;background:'+m.color+';font-size:'+(s/2)+'px';
      el.textContent=m.emoji;
      var icon=L.divIcon({className:'',iconSize:[s,s],html:el.outerHTML});
      L.marker([m.lat,m.lon],{icon:icon}).on('click',function(){post({type:'marker',id:m.id});}).addTo(layer);
    });
  };
  post({type:'ready'});
  setTimeout(emit,50);
})();
</script></body></html>`;
}

export function PeopleMap({ center, markers, onRegion, onMarkerPress }: PeopleMapProps) {
  const web = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // HTML (и центр) задаётся один раз — дальше карта живёт своей жизнью
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: html(center.lat, center.lon), baseUrl: 'https://localhost/' }), []);
  const byId = useRef(new Map<string, (typeof markers)[number]>());
  byId.current = new Map(markers.map((m) => [m.id, m]));

  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(markers)});true;`);
  }, [markers, ready]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type: string; bbox?: [number, number, number, number]; id?: string; message?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'region' && msg.bbox) onRegion(msg.bbox);
    else if (msg.type === 'marker' && msg.id) {
      const m = byId.current.get(msg.id);
      if (m) onMarkerPress(m);
    } else if (msg.type === 'error') setError(msg.message ?? 'Ошибка карты');
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={web}
        source={source}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        style={{ flex: 1 }}
      />
      {error ? (
        <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#000a', padding: 12, borderRadius: 10 }}>
          <Text style={{ color: '#fff' }}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
