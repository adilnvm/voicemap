// app/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import axios from "axios";
import NavBar from "@/components/NavBar";
import RightPanel from "@/components/RightPanel";
import HoverCard from "@/components/HoverCard";
import SearchBar from "@/components/SearchBar";
import { getFeatureName } from "@/lib/mapUtils"; // keep if you use it

// ensure v3 compatibility
(mapboxgl as any).config.API_URL = "https://api.mapbox.com";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type GeoJSONFC = any;

export default function Page() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [statesGeo, setStatesGeo] = useState<GeoJSONFC | null>(null);
  const [pcGeo, setPcGeo] = useState<GeoJSONFC | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<{ name: string; type?: string; id?: string } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; x: number; y: number } | null>(null);

  const [showStates, setShowStates] = useState(true);
  const [showPCs, setShowPCs] = useState(true);

  const [pcNameProp, setPcNameProp] = useState<string | null>(null);
  const [stateNameProp, setStateNameProp] = useState<string | null>(null);

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

  // load static files from public/data
  async function loadGeojsons() {
    setLoading(true);
    setLoadError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        axios.get("/data/states.geojson").catch((e) => {
          throw new Error("states.geojson load failed: " + (e?.message || e));
        }),
        axios.get("/data/pc.geojson").catch(() => null),
      ]);

      const sGeo = sRes?.data ?? null;
      const pGeo = pRes?.data ?? null;

      setStatesGeo(sGeo);
      setPcGeo(pGeo);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!statesGeo || !containerRef.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11?optimize=true",
      center: [80, 22],
      zoom: 4.5,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // states
      if (!map.getSource("states")) {
        map.addSource("states", { type: "geojson", data: statesGeo });
      } else {
        (map.getSource("states") as mapboxgl.GeoJSONSource).setData(statesGeo);
      }
      if (!map.getLayer("states-fill")) {
        map.addLayer({ id: "states-fill", type: "fill", source: "states", paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.4 } });
      }
      if (!map.getLayer("states-outline")) {
        map.addLayer({ id: "states-outline", type: "line", source: "states", paint: { "line-color": "#065f46", "line-width": 1.2 } });
      }

      // pcs
      if (pcGeo) {
        if (!map.getSource("pc")) {
          map.addSource("pc", { type: "geojson", data: pcGeo });
        } else {
          (map.getSource("pc") as mapboxgl.GeoJSONSource).setData(pcGeo);
        }

        if (!map.getLayer("pc-fill")) {
          map.addLayer({ id: "pc-fill", type: "fill", source: "pc", paint: { "fill-color": "#047857", "fill-opacity": 0.12 } });
        }
        if (!map.getLayer("pc-line")) {
          map.addLayer({ id: "pc-line", type: "line", source: "pc", paint: { "line-color": "#065f46", "line-width": 0.8 } });
        }
        if (!map.getLayer("pc-highlight")) {
          map.addLayer({
            id: "pc-highlight",
            type: "fill",
            source: "pc",
            paint: { "fill-color": "#16a34a", "fill-opacity": 0.45 },
            filter: ["==", ["get", pcNameProp ?? "pc_name"], ""],
          });
        }
      }

      // district-selected source & layers
      if (!map.getSource("district-selected")) {
        map.addSource("district-selected", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer("district-fill")) {
        map.addLayer({ id: "district-fill", type: "fill", source: "district-selected", paint: { "fill-color": "#f97316", "fill-opacity": 0.35 } });
      }
      if (!map.getLayer("district-line")) {
        map.addLayer({ id: "district-line", type: "line", source: "district-selected", paint: { "line-color": "#b45309", "line-width": 1.4 } });
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
          const name = (f.properties?.[pcNameProp as string] || f.properties?.pc_name || f.properties?.NAME || "").toString();
          setHoverInfo({ name, x: e.point.x, y: e.point.y });
          map.getCanvas().style.cursor = "pointer";
        });
      }

      // clicks
      map.on("click", "states-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const stateName = (f.properties?.[stateNameProp as string] || f.properties?.ST_NM || f.properties?.NAME || "").toString();
        setSelected({ name: stateName, type: "state" });
        setPanelOpen(true);
        try {
          const bbox = computeBboxFromGeometry(f.geometry);
          if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
        } catch {}
      });

      map.on("click", "pc-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const pcName = (f.properties?.[pcNameProp as string] || f.properties?.pc_name || f.properties?.PC_NAME || f.properties?.NAME || "").toString();
        setSelected({ name: pcName, type: "pc" });
        setPanelOpen(true);
        try {
          const prop = pcNameProp ?? "pc_name";
          map.setFilter("pc-highlight", ["==", ["get", prop], pcName]);
        } catch {}
        try {
          const bbox = computeBboxFromGeometry(f.geometry);
          if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
        } catch {}
      });

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
  }, [statesGeo, pcGeo, pcNameProp, stateNameProp]);

  // toggles visibility
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

  // handle voicemap:fit events from SearchBar
  useEffect(() => {
    const onFit = (ev: any) => {
      const d = ev.detail;
      if (!d || !mapRef.current) return;
      const map = mapRef.current;

      try {
        if (d.bbox) {
          map.fitBounds(d.bbox, { padding: 40, duration: 700 });
        } else if (d.center) {
          // for pincodes we want max zoom (14-16)
          const zoom = d.zoom ?? (d.type === "pincode" ? 15 : 13);
          map.flyTo({ center: d.center, zoom, duration: 700 });
        }
      } catch (err) {}

      setSelected({ name: d.name ?? d.title ?? "Search result", type: d.type ?? "pc" });
      setPanelOpen(true);

      // pincode special-case: if admin.pc present, highlight
      if (d.type === "pincode") {
        if (d.admin?.pc && map.getLayer("pc-highlight")) {
          try {
            const prop = pcNameProp ?? "pc_name";
            map.setFilter("pc-highlight", ["==", ["get", prop], d.admin.pc]);
          } catch {}
        }
        return;
      }

      // other: admin.pc highlight
      if (d.admin?.pc && map.getLayer("pc-highlight")) {
        try {
          const prop = pcNameProp ?? "pc_name";
          map.setFilter("pc-highlight", ["==", ["get", prop], d.admin.pc]);
        } catch {}
      }
    };

    window.addEventListener("voicemap:fit", onFit);
    return () => window.removeEventListener("voicemap:fit", onFit);
  }, [pcNameProp]);

  function handleReset() {
    setSelected(null);
    setPanelOpen(false);
    setHoverInfo(null);
    try {
      const map = mapRef.current;
      if (map) {
        if (map.getLayer("pc-highlight")) map.setFilter("pc-highlight", ["==", ["get", pcNameProp ?? "pc_name"], ""]);
        if (map.getLayer("pc-fill")) map.setFilter("pc-fill", null);
        if (map.getLayer("district-fill")) {
          (map.getSource("district-selected") as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
        }
        map.flyTo({ center: [80, 22], zoom: 4.5 });
      }
    } catch {}
  }

  // dynamic district fetcher (unchanged)
  async function fetchAndShowDistrictByName(name: string) {
    if (!name || !mapRef.current) return;
    const map = mapRef.current;
    setLoadError(null);

    try {
      const backendResp = await axios.get(`/api/regions/geojson`, { params: { type: "district", name }, timeout: 5000 });
      if (backendResp?.data) {
        const fc = backendResp.data;
        (map.getSource("district-selected") as mapboxgl.GeoJSONSource).setData(fc);
        const f = fc.features?.[0];
        if (f) {
          const bbox = computeBboxFromGeometry(f.geometry);
          if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
        }
        return;
      }
    } catch (err) {
      console.debug("backend district fetch failed, falling back to local districts.geojson", err);
    }

    try {
      const resp = await axios.get("/data/districts.geojson", { timeout: 20000 });
      const fc = resp.data;
      if (!fc || !fc.features) throw new Error("local districts file invalid");
      const nameCandidate = name.toLowerCase();
      const match = fc.features.find((feat: any) => {
        const p = feat.properties || {};
        const possible = [p.name, p.NAME, p.DISTRICT, p.district, p.DISTRICT_NA, p.Dist, p.dist_name].filter(Boolean);
        for (const val of possible) {
          if (typeof val === "string" && val.toLowerCase() === nameCandidate) return true;
          if (typeof val === "string" && val.toLowerCase().includes(nameCandidate)) return true;
        }
        return false;
      });

      if (match) {
        (map.getSource("district-selected") as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features: [match] });
        const bbox = computeBboxFromGeometry(match.geometry);
        if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
      } else {
        setLoadError("District geometry not found in local file");
      }
    } catch (err: any) {
      console.error("district fetch/fallback failed:", err);
      setLoadError("Failed to fetch district geometry: " + (err?.message || err));
    }
  }

  useEffect(() => {
    if (!selected) return;
    if (selected.type === "district") {
      fetchAndShowDistrictByName(selected.name);
    } else {
      try {
        const map = mapRef.current;
        if (map && map.getSource("district-selected")) {
          (map.getSource("district-selected") as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function handleRetry() {
    loadGeojsons();
  }

  return (
    <>
      <div className="p-3 z-40 absolute left-4 top-4 w-[min(900px,calc(100%-120px))]">
        {/* integrate SearchBar here */}
        <SearchBar />
      </div>

      <div className="relative h-[calc(100vh-72px)]">
        <div ref={containerRef} className="w-full h-full" />

        {hoverInfo && (
          <div style={{ position: "absolute", pointerEvents: "none", left: Math.max(8, hoverInfo.x + 12), top: Math.max(88, hoverInfo.y + 12), zIndex: 60 }}>
            <HoverCard title={hoverInfo.name} description="Hover" />
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 z-60 flex items-center justify-center">
            <div className="bg-white/90 p-4 rounded shadow">Loading data…</div>
          </div>
        )}

        {loadError && (
          <div className="absolute left-4 top-28 z-60">
            <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded shadow">
              <div className="font-medium">Data error</div>
              <div className="text-xs mt-1">{loadError}</div>
              <div className="mt-2 flex gap-2">
                <button onClick={handleRetry} className="px-3 py-1 bg-emerald-600 text-white rounded">Retry</button>
                <button onClick={() => setLoadError(null)} className="px-3 py-1 rounded border">Dismiss</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 50 }} className="bg-white p-1 rounded shadow text-xs">
          © VoiceMap — demo
        </div>
      </div>

      <RightPanel open={panelOpen} onClose={() => setPanelOpen(false)} onToggle={() => setPanelOpen((s) => !s)} selected={selected} onReset={handleReset} geojsonError={loadError} onRetry={handleRetry} />
    </>
  );
}
