'use client';

import { useState, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

const LIBRARIES: ('places')[] = ['places'];

interface MapLocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  saving?: boolean;
  onConfirm: (lat: number, lng: number) => void;
  onCancel?: () => void;
}

export default function MapLocationPicker({
  initialLat,
  initialLng,
  saving,
  onConfirm,
  onCancel,
}: MapLocationPickerProps) {
  const defaultCenter = { lat: initialLat ?? -34.6037, lng: initialLng ?? -58.3816 };
  const [markerPos, setMarkerPos] = useState(defaultCenter);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });

  const onPlaceChanged = useCallback(() => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setMarkerPos({ lat, lng });
      setMapCenter({ lat, lng });
    }
  }, []);

  const onMarkerDragEnd = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setMarkerPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, []);

  if (!isLoaded) {
    return <div className="h-full w-full bg-gray-100 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <Autocomplete
        onLoad={(ac) => { autocompleteRef.current = ac; }}
        onPlaceChanged={onPlaceChanged}
      >
        <Input placeholder="Buscá la dirección del proyecto..." className="w-full" />
      </Autocomplete>
      <p className="text-xs text-gray-400 -mt-1">
        También podés arrastrar el pin para ajustar la ubicación exacta.
      </p>
      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200" style={{ minHeight: 240 }}>
        <GoogleMap
          mapContainerStyle={{ height: '100%', width: '100%' }}
          center={mapCenter}
          zoom={15}
          options={{ scrollwheel: false }}
        >
          <Marker
            position={markerPos}
            draggable
            onDragEnd={onMarkerDragEnd}
          />
        </GoogleMap>
      </div>
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button onClick={() => onConfirm(markerPos.lat, markerPos.lng)} disabled={saving}>
          <MapPin size={14} className="mr-1.5" />
          {saving ? 'Guardando...' : 'Confirmar ubicación'}
        </Button>
      </div>
    </div>
  );
}
