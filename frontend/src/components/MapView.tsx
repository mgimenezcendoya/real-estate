'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  lat: number;
  lng: number;
  label?: string;
  className?: string;
}

export default function MapView({ lat, lng, label, className }: MapViewProps) {
  useEffect(() => {
    // Fix Leaflet default marker icons broken by webpack/Next.js
    // Must run client-side only since Leaflet accesses the DOM at import time
    import('leaflet').then((L) => {
      const icon = L.default.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      L.default.Marker.prototype.options.icon = icon;
    });
  }, []);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      className={className}
      style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]}>
        {label && <Popup>{label}</Popup>}
      </Marker>
    </MapContainer>
  );
}
