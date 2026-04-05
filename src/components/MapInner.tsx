"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPlace = {
  title: string;
  category: string;
  roadAddress: string;
  lat: number;
  lng: number;
  link?: string;
  priceKrw?: number;
  /** 내 위치 기준 직선거리(m) */
  distanceMeters?: number;
};

/** Next.js 번들 환경에서 기본 마커 아이콘 경로가 깨지는 문제 보정 */
const defaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [28, 44],
  iconAnchor: [14, 44],
});

function Recenter({
  lat,
  lng,
  zoom,
}: {
  lat: number;
  lng: number;
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
  return null;
}

type Props = {
  userLat: number;
  userLng: number;
  places: MapPlace[];
};

/**
 * Leaflet 지도: 내 위치 + 장소 마커
 */
export default function MapInner({ userLat, userLng, places }: Props) {
  const center = useMemo(
    () => ({ lat: userLat, lng: userLng }),
    [userLat, userLng],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      className="h-full w-full min-h-[320px] z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={center.lat} lng={center.lng} zoom={15} />
      <Marker position={[userLat, userLng]} icon={userIcon}>
        <Popup>내 위치</Popup>
      </Marker>
      {places.map((p) => (
        <Marker
          key={`${p.title}-${p.lat}-${p.lng}`}
          position={[p.lat, p.lng]}
          icon={defaultIcon}
        >
          <Popup>
            <div className="text-sm max-w-[220px]">
              <p className="font-semibold">{p.title}</p>
              <p className="text-gray-600">{p.category}</p>
              <p>{p.roadAddress}</p>
              {p.distanceMeters != null && (
                <p className="mt-1 text-blue-700 dark:text-blue-300">
                  내 위치에서 약 {p.distanceMeters < 1000 ? `${p.distanceMeters}m` : `${(p.distanceMeters / 1000).toFixed(1)}km`}
                </p>
              )}
              {p.priceKrw != null && (
                <p className="mt-1 text-amber-700">
                  예상(데모) {p.priceKrw.toLocaleString()}원
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
