// app/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import axios from "axios";
import NavBar from "@/components/NavBar";
import RightPanel from "@/components/RightPanel";
import HoverCard from "@/components/HoverCard";
import { getFeatureName } from "@/lib/mapUtils"; // keep this if you have it

// ensure v3 compatibility
(mapboxgl as any).config.API_URL = "https://api.mapbox.com";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type GeoJSONFC = any;

export default function Page() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [statesGeo, setStatesGeo] = useState<GeoJSONFC | null>(null);
  const [pcGeo, setPcGeo] = useState<GeoJSONFC | null>(null);
  const [districtsGeo, setDistrictsGeo] = useState<GeoJSONFC | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<{ name: string; type?: string } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; x: number; y: number } | null>(null);

  // layer toggles
  const [showStates, setShowStates] = useState(true);
  const [showPCs, setShowPCs] = useState(true);

  // property detection keys (best-effort)
  const [pcNameProp, setPcNameProp] = useState<string | null>(null);
  const [stateNameProp, setStateNameProp] = useState<string | null>(null);

  // small helper: compute bbox from geometry (polygons/multipolygons)
  function computeBboxFromGeometry(geometry: any) {
    if (!geometry) return null;
    let coords: number[][] = [];
    if (geometry.type === "Polygon") coords = geometry.coordinates.flat();
    else if (geometry.type === "MultiPolygon") coords = geometry.coordinates.flat(2);
    else if (geometry.type === "Point") coords = [geometry.coordinates];
    else return null;
    const lons = coords.map((c: number[]) => c[0]);
    const lats = coords.map((c: number[]) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    return [
      [minLon, minLat],
      [maxLon, maxLat],
    ];
  }

  // load geojsons (with retry)
  async function loadGeojsons() {
    setLoading(true);
    setLoadError(null);
    try {
      const [sRes, pRes, dRes] = await Promise.all([
        axios.get("/data/states.geojson").catch((e) => { throw new Error("states.geojson load failed"); }),
        axios.get("/data/pc.geojson").catch(() => null), // pc optional
        axios.get("/data/districts.geojson").catch(() => null),
      ]);

      const sGeo = sRes?.data ?? null;
      const pGeo = pRes?.data ?? null;
      const dGeo = dRes?.data ?? null;

      setStatesGeo(sGeo);
      setPcGeo(pGeo);
      setDistrictsGeo(dGeo);

      // detect name props for common keys
      if (sGeo?.features?.[0]?.properties) {
        const props = sGeo.features[0].properties;
        const p = ["ST_NM", "ST_NAME", "NAME", "state", "State", "st_nm"].find((k) => k in props) ?? null;
        setStateNameProp(p);
      }
      if (pGeo?.features?.[0]?.properties) {
        const props = pGeo.features[0].properties;
        const p = ["pc_name", "PC_NAME", "pc", "PC", "NAME"].find((k) => k in props) ?? null;
        setPcNameProp(p);
      }
    } catch (err: any) {
      console.error("load error", err);
      setLoadError(err.message || "Failed to load GeoJSON files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGeojsons();
  }, []);

  // init map once statesGeo is available
  useEffect(() => {
    if (!statesGeo || !containerRef.current) return;
    if (mapRef.current) return; // already init'd

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11?optimize=true",
      center: [80, 22],
      zoom: 4.5,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // add states
      if (!map.getSource("states")) {
        map.addSource("states", { type: "geojson", data: statesGeo });
      }
      if (!map.getLayer("states-fill")) {
        map.addLayer({
          id: "states-fill",
          type: "fill",
          source: "states",
          paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.4 },
        });
      }
      if (!map.getLayer("states-outline")) {
        map.addLayer({
          id: "states-outline",
          type: "line",
          source: "states",
          paint: { "line-color": "#065f46", "line-width": 1.2 },
        });
      }

      // add pc source (if available)
      if (pcGeo && !map.getSource("pc")) {
        map.addSource("pc", { type: "geojson", data: pcGeo });
      }
      if (pcGeo && !map.getLayer("pc-fill")) {
        map.addLayer({
          id: "pc-fill",
          type: "fill",
          source: "pc",
          paint: { "fill-color": "#047857", "fill-opacity": 0.14 },
        });
      }
      if (pcGeo && !map.getLayer("pc-line")) {
        map.addLayer({
          id: "pc-line",
          type: "line",
          source: "pc",
          paint: { "line-color": "#065f46", "line-width": 0.9 },
        });
      }
      if (pcGeo && !map.getLayer("pc-highlight")) {
        map.addLayer({
          id: "pc-highlight",
          type: "fill",
          source: "pc",
          paint: { "fill-color": "#16a34a", "fill-opacity": 0.45 },
          filter: ["==", ["get", pcNameProp ?? "pc_name"], ""],
        });
      }

      // hover interactions
      map.on("mousemove", "states-fill", (e) => {
        const f = e.features?.[0];
        if (!f) {
          setHoverInfo(null);
          map.getCanvas().style.cursor = "";
          return;
        }
        const title = (f.properties?.[stateNameProp as string] || f.properties?.ST_NM || f.properties?.NAME || getFeatureName(f.properties) || "").toString();
        setHoverInfo({ name: title, x: e.point.x, y: e.point.y });
        map.getCanvas().style.cursor = "pointer";
      });

      if (pcGeo) {
        map.on("mousemove", "pc-fill", (e) => {
          const f = e.features?.[0];
          if (!f) {
            setHoverInfo(null);
            map.getCanvas().style.cursor = "";
            return;
          }
          const name = (f.properties?.[pcNameProp as string] || f.properties?.pc_name || f.properties?.PC_NAME || f.properties?.NAME || "").toString();
          setHoverInfo({ name, x: e.point.x, y: e.point.y });
          map.getCanvas().style.cursor = "pointer";
        });
      }

      // click handlers
      map.on("click", "states-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const stateName = (f.properties?.[stateNameProp as string] || f.properties?.ST_NM || f.properties?.NAME || "").toString();
        setSelected({ name: stateName, type: "state" });
        setPanelOpen(true);
        try {
          const bbox = computeBboxFromGeometry(f.geometry);
          if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
        } catch (err) {}
      });

      if (pcGeo) {
        map.on("click", "pc-fill", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const pcName = (f.properties?.[pcNameProp as string] || f.properties?.pc_name || f.properties?.PC_NAME || f.properties?.NAME || "").toString();
          setSelected({ name: pcName, type: "pc" });
          setPanelOpen(true);

          // highlight this pc
          try {
            const prop = pcNameProp ?? "pc_name";
            map.setFilter("pc-highlight", ["==", ["get", prop], pcName]);
          } catch (err) {
            try {
              map.setFilter("pc-highlight", ["==", pcNameProp ?? "pc_name", pcName]);
            } catch {}
          }

          try {
            const bbox = computeBboxFromGeometry(f.geometry);
            if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
          } catch (err) {}
        });
      }

      // zoom behavior: PCs visible when zoom >=5
      map.on("zoom", () => {
        const z = map.getZoom();
        const showPC = z >= 5 && showPCs;
        if (map.getLayer("pc-fill")) map.setLayoutProperty("pc-fill", "visibility", showPC ? "visible" : "none");
        if (map.getLayer("pc-line")) map.setLayoutProperty("pc-line", "visibility", showPC ? "visible" : "none");
        if (map.getLayer("pc-highlight")) map.setLayoutProperty("pc-highlight", "visibility", showPC ? "visible" : "none");
      });
    });

    return () => {
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesGeo, pcGeo, pcNameProp]);

  // watch showStates / showPCs toggles and apply to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer("states-fill")) {
        map.setLayoutProperty("states-fill", "visibility", showStates ? "visible" : "none");
        map.setLayoutProperty("states-outline", "visibility", showStates ? "visible" : "none");
      }
      if (map.getLayer("pc-fill")) {
        map.setLayoutProperty("pc-fill", "visibility", showPCs ? "visible" : "none");
        map.setLayoutProperty("pc-line", "visibility", showPCs ? "visible" : "none");
        map.setLayoutProperty("pc-highlight", "visibility", showPCs ? "visible" : "none");
      }
    } catch (err) {}
  }, [showStates, showPCs]);

  // handle external search events (voicemap:fit)
  useEffect(() => {
    const onFit = (ev: any) => {
      const d = ev.detail;
      if (!d || !mapRef.current) return;
      const map = mapRef.current;
      try {
        if (d.bbox) {
          map.fitBounds(d.bbox, { padding: 40, duration: 700 });
        } else if (d.center) {
          map.flyTo({ center: d.center, zoom: d.zoom ?? 13, duration: 700 });
        }
      } catch (err) {}
      // auto-open panel and set selected label
      setSelected({ name: d.name ?? d.title ?? "Search result", type: d.type ?? "pc" });
      setPanelOpen(true);

      // if event includes admin info with pc name, attempt to highlight
      if (d.admin?.pc && map.getLayer("pc-highlight")) {
        try {
          const prop = pcNameProp ?? "pc_name";
          map.setFilter("pc-highlight", ["==", ["get", prop], d.admin.pc]);
        } catch (err) {}
      }
    };
    window.addEventListener("voicemap:fit", onFit);
    return () => window.removeEventListener("voicemap:fit", onFit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcNameProp]);

  // reset map & UI
  function handleReset() {
    setSelected(null);
    setPanelOpen(false);
    setHoverInfo(null);
    // clear highlight filters
    try {
      const map = mapRef.current;
      if (map) {
        if (map.getLayer("pc-highlight")) map.setFilter("pc-highlight", ["==", ["get", pcNameProp ?? "pc_name"], ""]);
        // reset pc filters on layer
        if (map.getLayer("pc-fill")) map.setFilter("pc-fill", null);
        if (map.getLayer("pc-line")) map.setFilter("pc-line", null);
        map.flyTo({ center: [80, 22], zoom: 4.5 });
      }
    } catch (err) {}
  }

  // retry loader
  function handleRetry() {
    loadGeojsons();
  }

  return (
    <>
      {/* <NavBar
        onReset={handleReset}
        onToggleSidebar={() => setPanelOpen((s) => !s)}
        showStates={showStates}
        showPCs={showPCs}
        setShowStates={setShowStates}
        setShowPCs={setShowPCs}
      /> */}

      <div className="relative h-[calc(100vh-72px)]">
        <div ref={containerRef} className="w-full h-full" />

        {/* hover card */}
        {hoverInfo && (
          <div
            style={{
              position: "absolute",
              pointerEvents: "none",
              left: Math.max(8, hoverInfo.x + 12),
              top: Math.max(88, hoverInfo.y + 12),
              zIndex: 60,
            }}
          >
            <HoverCard title={hoverInfo.name} description="Hover" />
          </div>
        )}

        {/* loading & retry UI */}
        {loading && (
          <div className="absolute inset-0 z-60 flex items-center justify-center">
            <div className="bg-white/90 p-4 rounded shadow">Loading data…</div>
          </div>
        )}

        {loadError && (
          <div className="absolute left-4 top-28 z-60">
            <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded shadow">
              <div className="font-medium">GeoJSON load failed</div>
              <div className="text-xs mt-1">{loadError}</div>
              <div className="mt-2 flex gap-2">
                <button onClick={handleRetry} className="px-3 py-1 bg-emerald-600 text-white rounded">
                  Retry
                </button>
                <button onClick={() => setLoadError(null)} className="px-3 py-1 rounded border">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* bottom-left small footer */}
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 50 }} className="bg-white p-1 rounded shadow text-xs">
          © VoiceMap — demo
        </div>
      </div>

      {/* Right panel */}
      <RightPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onToggle={() => setPanelOpen((s) => !s)}
        selected={selected}
        onReset={handleReset}
        geojsonError={loadError}
        onRetry={handleRetry}
      />
    </>
  );
}