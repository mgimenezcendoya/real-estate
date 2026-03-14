'use client';

import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const LIBRARIES: ('places')[] = ['places'];

interface MapViewProps {
  lat: number;
  lng: number;
  label?: string;
  className?: string;
}

export default function MapView({ lat, lng, className }: MapViewProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });

  if (!isLoaded) {
    return <div className={className} style={{ height: '100%', width: '100%', background: '#f3f4f6' }} />;
  }

  return (
    <GoogleMap
      mapContainerStyle={{ height: '100%', width: '100%' }}
      mapContainerClassName={className}
      center={{ lat, lng }}
      zoom={15}
      options={{ disableDefaultUI: false, scrollwheel: false }}
    >
      <Marker position={{ lat, lng }} />
    </GoogleMap>
  );
}
