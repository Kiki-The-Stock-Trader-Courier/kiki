"use client";

import dynamic from "next/dynamic";
import type { MapPlace } from "@/components/MapInner";

const MapInner = dynamic(() => import("@/components/MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-zinc-100 text-zinc-500">
      지도 불러오는 중…
    </div>
  ),
});

type Props = {
  userLat: number;
  userLng: number;
  places: MapPlace[];
};

/** SSR 비활성화된 Leaflet 지도 래퍼 */
export default function MapView(props: Props) {
  return <MapInner {...props} />;
}
