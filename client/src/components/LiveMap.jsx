// OpenStreetMap + Leaflet map: route line, stops, live bus marker and trail.
import { useEffect, useRef } from 'react';
import L from 'leaflet';

const busIcon = L.divIcon({ className: 'bus-marker', html: '<div>🚌</div>', iconSize: [40, 40], iconAnchor: [20, 20] });

export default function LiveMap({ stops, location, trail = [], follow = true, highlightStopId }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});

  // Create map + static route layers once per route.
  useEffect(() => {
    if (!el.current || !stops?.length) return undefined;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    const pts = stops.map((s) => [s.lat, s.lng]);
    L.polyline(pts, { color: '#0b5cad', weight: 5, opacity: 0.55, dashArray: '8 8' }).addTo(m);
    stops.forEach((s, i) => {
      const end = i === 0 || i === stops.length - 1;
      L.circleMarker([s.lat, s.lng], {
        radius: end ? 9 : 7,
        color: '#fff',
        weight: 2,
        fillColor: s.id === highlightStopId ? '#d9480f' : end ? '#0b5cad' : '#4c6ef5',
        fillOpacity: 1,
      })
        .bindTooltip(s.name, { permanent: end, direction: 'top', offset: [0, -8] })
        .addTo(m);
    });
    layers.current.trail = L.polyline([], { color: '#2b8a3e', weight: 5 }).addTo(m);
    m.fitBounds(L.latLngBounds(pts).pad(0.1));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layers.current = {};
    };
  }, [stops, highlightStopId]);

  // Update the moving parts.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.trail?.setLatLngs(trail.map((p) => [p.lat, p.lng]));
    if (!location) return;
    const ll = [location.lat, location.lng];
    if (!layers.current.bus) layers.current.bus = L.marker(ll, { icon: busIcon, zIndexOffset: 1000 }).addTo(m);
    else layers.current.bus.setLatLng(ll);
    if (follow && !m.getBounds().pad(-0.15).contains(ll)) m.panTo(ll);
  }, [location, trail, follow]);

  return <div ref={el} className="map" role="application" aria-label="Map showing the bus route and live bus position" />;
}
