'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

import dynamic from 'next/dynamic';

// react-leaflet
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fit map bounds on click
function FitBoundsToGeoJSON({ feature }: { feature: any | null }) {
  const map = useMap();
  useEffect(() => {
    if (!feature) return;
    try {
      const layer = L.geoJSON(feature);
      map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    } catch {}
  }, [feature, map]);
  return null;
}

export default function Page() {
  // 🔥 Fetch from backend instead of GitHub
  const GEOJSON_URL = 'http://localhost:8080/api/regions';

  const [geojson, setGeojson] = useState<any | null>(null);
  const [hoverProps, setHoverProps] = useState<any | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const geoJsonRef = useRef<any>(null);

  // -----------------------------
  // Fetch regions from backend
  // -----------------------------
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        setLoading(true);

        const res = await axios.get(GEOJSON_URL);
        const regions = res.data; // array returned from backend

        // Convert backend regions → FeatureCollection
        const featureCollection = {
          type: "FeatureCollection",
          features: regions.map((r: any) => ({
            type: "Feature",
            properties: {
              name: r.name,
              state: r.state,
              district: r.district,
              source: r.source,
              type: r.type,
              id: r.id
            },
            geometry: r.geometry
          }))
        };

        setGeojson(featureCollection);

      } catch (err) {
        console.error("Failed loading regions from backend", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRegions();
  }, []);

  // -----------------------------
  // Default center
  // -----------------------------
  const center = [22.0, 80.0] as [number, number];

  const style = (feature: any) => ({
    weight: 0.6,
    color: '#0f172a',
    fillColor: '#0ea5a4',
    fillOpacity: 0.45,
  });

  const highlightStyle = {
    weight: 1.4,
    color: '#063241',
    fillOpacity: 0.6,
  };

  // Extract labels
  const labelFromProps = (props: any) => {
    if (!props) return {};
    return {
      name: props.name || '',
      state: props.state || '',
      district: props.district || ''
    };
  };

  // Leaflet events
  const onEachFeature = (feature: any, layer: any) => {
    layer.on({
      mouseover: (e: any) => {
        e.target.setStyle(highlightStyle);
        const p = labelFromProps(feature.properties);
        setHoverProps({ ...p, latlng: e.latlng });
      },
      mouseout: (e: any) => {
        if (geoJsonRef.current) {
          try {
            geoJsonRef.current.resetStyle(e.target);
          } catch {}
        }
        setHoverProps(null);
      },
      click: (e: any) => {
        setSelectedFeature(feature);
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* HEADER */}
      <header className="p-4 bg-white shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-emerald-500 flex items-center justify-center text-white font-bold">VM</div>
          <div>
            <h1 className="text-lg font-semibold">VoiceMap — Regions Map</h1>
            <p className="text-sm text-slate-500">Loaded from your Spring Boot backend</p>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* MAP */}
        <section className="lg:col-span-3 bg-white rounded shadow p-2">
          <div className="w-full h-[78vh] rounded overflow-hidden border">

            <MapContainer center={center} zoom={5} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {geojson && (
                <GeoJSON
                  data={geojson}
                  style={style}
                  onEachFeature={onEachFeature}
                  ref={geoJsonRef}
                />
              )}

              {selectedFeature && <FitBoundsToGeoJSON feature={selectedFeature} />}
            </MapContainer>

            {/* Hover Tooltip */}
            {hoverProps && (
              <div
                className="absolute bg-white border rounded p-2 shadow max-w-xs pointer-events-none"
                style={{ left: 20, bottom: 20 }}
              >
                <div className="text-xs text-slate-400">Hover</div>
                <div className="font-semibold">{hoverProps.name || '—'}</div>
                <div className="text-sm text-slate-600">{hoverProps.state}</div>
                {hoverProps.district && (
                  <div className="text-sm text-slate-500">{hoverProps.district}</div>
                )}
              </div>
            )}

          </div>
        </section>

        {/* SIDE PANEL */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded shadow p-4 sticky top-4">

            <h2 className="font-semibold mb-2">Selected</h2>

            {selectedFeature ? (
              <div>
                <div className="text-sm text-slate-500">Name</div>
                <div className="font-medium text-lg">
                  {labelFromProps(selectedFeature.properties).name}
                </div>

                <div className="text-sm text-slate-500">State</div>
                <div className="mb-3">
                  {labelFromProps(selectedFeature.properties).state}
                </div>

                <button
                  onClick={() => setSelectedFeature(null)}
                  className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
                >
                  Clear Selection
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Click a region to zoom and view details.</div>
            )}

            <hr className="my-4" />

            <div className="text-xs text-slate-500">Dataset source</div>
            <div className="text-sm">From your Spring Boot backend (regions collection)</div>

          </div>
        </aside>
      </main>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70">
          <div className="p-4 bg-white rounded shadow">Loading regions…</div>
        </div>
      )}

      <footer className="p-4 text-center text-xs text-slate-500">
        © VoiceMap — demo
      </footer>

    </div>
  );
}