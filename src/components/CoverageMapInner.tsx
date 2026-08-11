import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";

/**
 * Real Leaflet implementation. Never imported at module-eval time on the
 * server — `leaflet` touches `window` as soon as it's required, which
 * crashes SSR. CoverageMap.tsx lazy-loads this file client-only.
 */

// Leaflet's default marker icon references image files by relative path, which
// breaks under Vite's bundling unless we point it at the bundled asset URLs.
const markerIcon = L.icon({
  iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
  iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
  shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const DEFAULT_CENTER: [number, number] = [20, 0]; // world view when no coordinates are set yet

/** Recenters the map whenever lat/lng change from outside the map (e.g. typed into the fields). */
function RecenterOnPropChange({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const lastCentered = useRef<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = `${lat},${lng}`;
    if (key === lastCentered.current) return;
    lastCentered.current = key;
    map.setView([lat, lng], map.getZoom() < 10 ? 13 : map.getZoom());
  }, [lat, lng, map]);

  return null;
}

/** Registers a click handler on the map that reports the clicked coordinates. */
function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

/** Leaflet caches its container size — tell it to recalculate after the wrapper resizes (fullscreen toggle). */
function InvalidateOnResize({ watch }: { watch: unknown }) {
  const map = useMap();

  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [watch, map]);

  return null;
}

export type CoverageMapProps = {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  onChange: (lat: number, lng: number) => void;
};

export default function CoverageMapInner({ lat, lng, radiusKm, onChange }: CoverageMapProps) {
  const [expanded, setExpanded] = useState(false);
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;

  // Lock body scroll and allow Escape to close while the map is fullscreen.
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-1400 bg-black/50" onClick={() => setExpanded(false)} />
      )}
      <div
        className={
          expanded
            ? "fixed inset-6 sm:inset-12 z-1500 rounded-2xl border border-outline-variant overflow-hidden shadow-2xl"
            : "relative h-56 rounded-xl border border-outline-variant overflow-hidden"
        }
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse map" : "Expand map"}
          aria-label={expanded ? "Collapse map" : "Expand map"}
          className="absolute top-2 right-2 z-1000 w-9 h-9 rounded-lg bg-white shadow flex items-center justify-center text-on-surface-variant hover:text-primary"
        >
          <span className="material-symbols-outlined text-[18px]">
            {expanded ? "close_fullscreen" : "open_in_full"}
          </span>
        </button>
        <MapContainer center={center} zoom={lat != null && lng != null ? 13 : 2} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={onChange} />
          <RecenterOnPropChange lat={lat} lng={lng} />
          <InvalidateOnResize watch={expanded} />
          {lat != null && lng != null && (
            <>
              <Marker
                position={[lat, lng]}
                icon={markerIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target as L.Marker;
                    const pos = marker.getLatLng();
                    onChange(pos.lat, pos.lng);
                  },
                }}
              />
              <Circle center={[lat, lng]} radius={radiusKm * 1000} pathOptions={{ color: "#0f6636", fillOpacity: 0.08 }} />
            </>
          )}
        </MapContainer>
      </div>
    </>
  );
}
