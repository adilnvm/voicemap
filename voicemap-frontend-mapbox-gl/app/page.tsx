// app/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import axios from "axios";
import Fuse from "fuse.js";
import HoverCard from "@/components/HoverCard";
import RightPanel from "@/components/RightPanel";
import NavBar from "@/components/NavBar"; // optional, comment out if you don't have it
import { getFeatureName } from "@/lib/mapUtils"; // optional helper if you have it

// ensure mapbox v3 compatibility if needed
(mapboxgl as any).config.API_URL = "https://api.mapbox.com";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Small types
type GeoJSONFC = any;
type SearchSuggestion = {
  id: string;
  type: "PC" | "State" | "Pincode" | "Nominatim";
  name: string;
  score?: number;
  feature?: any;
  coord?: [number, number];
  pincode?: string;
  props?: any;
};

export default function Page() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // GeoJSONs
  const [statesGeo, setStatesGeo] = useState<GeoJSONFC | null>(null);
  const [pcGeo, setPcGeo] = useState<GeoJSONFC | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<{ name: string; type?: string; id?: string } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; x: number; y: number } | null>(null);

  // toggles
  const [showStates, setShowStates] = useState(true);
  const [showPCs, setShowPCs] = useState(true);

  // detected property names for PC/state name keys
  const [pcNameProp, setPcNameProp] = useState<string | null>(null);
  const [stateNameProp, setStateNameProp] = useState<string | null>(null);

  // search state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  // fuse indexes
  const fusePC = useRef<Fuse<any> | null>(null);
  const fuseState = useRef<Fuse<any> | null>(null);

  // pincode structures (lazy-loaded)
  const pincodeLoaded = useRef(false);
  const pincodeToPoint = useRef<Record<string, [number, number]>>({});
  const prefixToList = useRef<Record<string, string[]>>({}); // prefix (3-digit) -> list of pincodes (strings)
  const prefixRepresentative = useRef<Record<string, { pincode: string; coord: [number, number] }>>({});

  // map marker for selected pincode
  const pincodeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // ----- Helpers -----
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

  // try to determine a friendly name from feature properties
  function featureLabel(props: any) {
    if (!props) return "";
    return (
      props.pc_name ||
      props.PC_NAME ||
      props.pc ||
      props.name ||
      props.NAME ||
      props.ST_NM ||
      props.ST_NAME ||
      props.DISTRICT ||
      props.NM ||
      ""
    ).toString();
  }

  // ----- Load static geojsons (fast) -----
  async function loadGeojsons() {
    setLoading(true);
    setLoadError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        axios.get("/data/states.geojson").catch((e) => {
          throw new Error("states.geojson load failed: " + (e?.message || e));
        }),
        axios.get("/data/pc.geojson").catch(() => null), // optional
      ]);

      const sGeo = sRes?.data ?? null;
      const pGeo = pRes?.data ?? null;

      setStatesGeo(sGeo);
      setPcGeo(pGeo);

      // detect name props
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

      // build fuse indexes
      buildFuseIndexes(sGeo, pGeo);
    } catch (err: any) {
      console.error("load error", err);
      setLoadError(err.message || "Failed to load GeoJSON files");
    } finally {
      setLoading(false);
    }
  }

  function buildFuseIndexes(sGeo: GeoJSONFC | null, pGeo: GeoJSONFC | null) {
    try {
      if (pGeo?.features?.length) {
        const items = pGeo.features.map((f: any, idx: number) => {
          const name = featureLabel(f.properties) || `PC ${idx}`;
          const state = f.properties?.ST_NM || f.properties?.ST_NAME || f.properties?.state || f.properties?.STATE || null;
          return { id: `pc-${idx}`, idx, name, state, feature: f, props: f.properties };
        });

        fusePC.current = new Fuse(items, {
          keys: [{ name: "name", weight: 1 }, { name: "props.PC_NAME", weight: 0.9 }, { name: "state", weight: 0.6 }],
          includeScore: true,
          threshold: 0.36,
          ignoreLocation: true,
          shouldSort: true,
        });
      }

      if (sGeo?.features?.length) {
        const items = sGeo.features.map((f: any, idx: number) => {
          const name = (f.properties?.ST_NM || f.properties?.ST_NAME || f.properties?.NAME || `State ${idx}`).toString();
          return { id: `s-${idx}`, idx, name, feature: f, props: f.properties };
        });

        fuseState.current = new Fuse(items, {
          keys: [{ name: "name", weight: 1 }, { name: "props.ST_NM", weight: 0.6 }],
          includeScore: true,
          threshold: 0.32,
          ignoreLocation: true,
          shouldSort: true,
        });
      }
    } catch (err) {
      console.warn("buildFuseIndexes error", err);
    }
  }

  // ----- Lazy load pincodes file and build fast maps -----
  async function loadPincodesOnce() {
    if (pincodeLoaded.current) return;
    pincodeLoaded.current = true;
    try {
      // this file lives in frontend public/data/pincode.points.geojson
      const res = await axios.get("/data/pincode.points.geojson", { timeout: 30000 });
      const fc = res.data;
      if (!fc || !fc.features) {
        console.warn("pincode file invalid");
        return;
      }

      // Build pincode -> coord map and prefix -> list
      const p2p: Record<string, [number, number]> = {};
      const prefixMap: Record<string, string[]> = {};

      for (const feat of fc.features) {
        const props = feat.properties || {};
        const pincode = (props.Pincode || props.PINCODE || props.pincode || props.Pincode || props.PIN) + "";
        if (!pincode || pincode.length < 3) continue;
        const geom = feat.geometry;
        if (!geom) continue;
        const coord: [number, number] =
          geom.type === "Point" ? [geom.coordinates[0], geom.coordinates[1]] : (computeBboxFromGeometry(geom) ? [computeBboxFromGeometry(geom)[0][0], computeBboxFromGeometry(geom)[0][1]] : null);

        if (!coord) continue;
        p2p[pincode] = coord;

        const prefix = pincode.slice(0, 3);
        if (!prefixMap[prefix]) prefixMap[prefix] = [];
        prefixMap[prefix].push(pincode);
      }

      // create representative for each prefix (take first pincode's coord)
      const rep: Record<string, { pincode: string; coord: [number, number] }> = {};
      for (const k of Object.keys(prefixMap)) {
        const list = prefixMap[k];
        const first = list[0];
        if (p2p[first]) rep[k] = { pincode: first, coord: p2p[first] };
      }

      pincodeToPoint.current = p2p;
      prefixToList.current = prefixMap;
      prefixRepresentative.current = rep;
      console.info("Pincode index built: pincodes=", Object.keys(p2p).length);
    } catch (err) {
      console.warn("Failed to load pincodes:", err);
      // allow future retries
      pincodeLoaded.current = false;
    }
  }

  // ----- Map init -----
  useEffect(() => {
    loadGeojsons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!statesGeo || !containerRef.current) return;
    if (mapRef.current) return; // already inited

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11?optimize=true",
      center: [80, 22],
      zoom: 4.5,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // STATES source
      if (!map.getSource("states")) {
        map.addSource("states", { type: "geojson", data: statesGeo });
      } else {
        (map.getSource("states") as mapboxgl.GeoJSONSource).setData(statesGeo);
      }

      if (!map.getLayer("states-fill")) {
        map.addLayer({
          id: "states-fill",
          type: "fill",
          source: "states",
          paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.38 },
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

      // PC if present
      if (pcGeo) {
        if (!map.getSource("pc")) {
          map.addSource("pc", { type: "geojson", data: pcGeo });
        } else {
          (map.getSource("pc") as mapboxgl.GeoJSONSource).setData(pcGeo);
        }

        if (!map.getLayer("pc-fill")) {
          map.addLayer({
            id: "pc-fill",
            type: "fill",
            source: "pc",
            paint: { "fill-color": "#047857", "fill-opacity": 0.12 },
          });
        }
        if (!map.getLayer("pc-line")) {
          map.addLayer({
            id: "pc-line",
            type: "line",
            source: "pc",
            paint: { "line-color": "#065f46", "line-width": 0.8 },
          });
        }
        // highlight layer (filter set empty string initially)
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

      // pincode marker placeholder (no source/layer — marker will be created when needed)
    });

    // hover interactions
    map.on("mousemove", "states-fill", (e) => {
      const f = e.features?.[0];
      if (!f) {
        setHoverInfo(null);
        map.getCanvas().style.cursor = "";
        return;
      }
      const title =
        (f.properties?.[stateNameProp as string] || f.properties?.ST_NM || f.properties?.NAME || getFeatureName?.(f.properties) || "").toString();
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
      } catch {}
    });

    map.on("click", "pc-fill", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const pcName = (f.properties?.[pcNameProp as string] || f.properties?.pc_name || f.properties?.PC_NAME || f.properties?.NAME || "").toString();
      setSelected({ name: pcName, type: "pc" });
      setPanelOpen(true);
      // highlight
      try {
        const prop = pcNameProp ?? "pc_name";
        map.setFilter("pc-highlight", ["==", ["get", prop], pcName]);
      } catch {
        try {
          map.setFilter("pc-highlight", ["==", pcNameProp ?? "pc_name", pcName]);
        } catch {}
      }
      // fit
      try {
        const bbox = computeBboxFromGeometry(f.geometry);
        if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
      } catch {}
    });

    // cleanup
    return () => {
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesGeo, pcGeo, pcNameProp, stateNameProp]);

  // toggle layers
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

  // handle global fit event (other UI can dispatch)
  useEffect(() => {
    const onFit = (ev: any) => {
      const d = ev.detail;
      if (!d || !mapRef.current) return;
      const map = mapRef.current;
      try {
        if (d.bbox) map.fitBounds(d.bbox, { padding: 40, duration: 700 });
        else if (d.center) map.flyTo({ center: d.center, zoom: d.zoom ?? 13, duration: 700 });
      } catch {}
      setSelected({ name: d.name ?? d.title ?? "Search result", type: d.type ?? "pc" });
      setPanelOpen(true);
      // highlight pc if admin.pc included
      if (d.admin?.pc && map.getLayer("pc-highlight")) {
        try {
          const prop = pcNameProp ?? "pc_name";
          map.setFilter("pc-highlight", ["==", ["get", prop], d.admin.pc]);
        } catch {}
      }

      // pincode special
      if (d.type === "pincode" && d.center) {
        // create marker + zoom
        try {
          ensurePincodeMarker(d.center, d.name);
          map.flyTo({ center: d.center, zoom: d.zoom ?? 16, duration: 700 });
        } catch {}
      }
    };
    window.addEventListener("voicemap:fit", onFit);
    return () => window.removeEventListener("voicemap:fit", onFit);
  }, [pcNameProp]);

  // ensure pincode marker (create/update)
  function ensurePincodeMarker(center: [number, number], label?: string) {
    const map = mapRef.current;
    if (!map) return;
    if (pincodeMarkerRef.current) {
      pincodeMarkerRef.current.setLngLat(center);
      // update popup text if present
      if (label) {
        const popup = new mapboxgl.Popup({ offset: 12 }).setText(`${label}`);
        pincodeMarkerRef.current.setPopup(popup).togglePopup();
      }
      return;
    }
    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    el.style.background = "#EF4444";
    el.style.boxShadow = "0 0 0 4px rgba(239,68,68,0.12)";
    el.style.border = "2px solid white";

    pincodeMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(center).addTo(map);
    if (label) {
      const popup = new mapboxgl.Popup({ offset: 12 }).setText(`${label}`);
      pincodeMarkerRef.current.setPopup(popup).togglePopup();
    }
  }

  function clearPincodeMarker() {
    if (pincodeMarkerRef.current) {
      try {
        pincodeMarkerRef.current.remove();
      } catch {}
      pincodeMarkerRef.current = null;
    }
  }

  // ----- Search logic (query -> suggestions) -----
  useEffect(() => {
    // debounce
    let t: any;
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    t = setTimeout(async () => {
      setSearching(true);
      const q = query.trim();

      // If query contains any digit -> treat as pincode-first
      const hasDigit = /\d/.test(q);

      // If it's numeric only (maybe with spaces), extract digits
      const onlyDigits = q.replace(/\s+/g, "").match(/^\d+$/) ? q.replace(/\s+/g, "") : null;

      const results: SearchSuggestion[] = [];

      // ---- numeric/pincode handling priority ----
      if (hasDigit) {
        // if exactly 6 digits -> direct
        if (onlyDigits && onlyDigits.length === 6) {
          // lazy load pincode file if not loaded
          await loadPincodesOnce();
          const p = onlyDigits;
          const coord = pincodeToPoint.current[p];
          if (coord) {
            results.push({ id: `pin-${p}`, type: "Pincode", name: p, pincode: p, coord, score: 100 });
            setSuggestions(results);
            setSearching(false);
            // immediately dispatch fit event so map reacts
            window.dispatchEvent(
              new CustomEvent("voicemap:fit", { detail: { type: "pincode", name: p, center: coord, zoom: 16, admin: { pincode: p } } })
            );
            return;
          } else {
            // not found exact, we still try prefix behavior
            await loadPincodesOnce();
          }
        }

        // if 3-5 digits -> prefix suggestions (optional)
        if (onlyDigits && onlyDigits.length >= 3 && onlyDigits.length <= 5) {
          await loadPincodesOnce();
          const prefix = onlyDigits.slice(0, 3);
          const list = prefixToList.current[prefix] || [];
          // return top 8 pincodes as suggestions
          for (let i = 0; i < Math.min(12, list.length); i++) {
            const p = list[i];
            const coord = pincodeToPoint.current[p];
            if (coord) results.push({ id: `pin-${p}`, type: "Pincode", name: p, pincode: p, coord, score: 80 - i });
          }
          if (results.length) {
            setSuggestions(results);
            setSearching(false);
            return;
          }
        }

        // If it's mixed string with digits + letters (e.g., "400 mumbai"), still try local fuzzy PC/district search below
      }

      // ---- local fuzzy search: PCs -> States ----
      // PCs first (if fuse exists)
      if (fusePC.current) {
        try {
          const r = fusePC.current.search(q, { limit: 8 });
          for (const it of r) {
            const item = it.item as any;
            results.push({
              id: `pc-${item.idx}`,
              type: "PC",
              name: item.name,
              score: 100 - (it.score ?? 0) * 100,
              feature: item.feature,
              props: item.props,
            });
          }
        } catch (e) {
          console.warn("fusePC error", e);
        }
      }

      // states next if not many results
      if (results.length < 8 && fuseState.current) {
        try {
          const r = fuseState.current.search(q, { limit: 6 });
          for (const it of r) {
            const item = it.item as any;
            results.push({
              id: `s-${item.idx}`,
              type: "State",
              name: item.name,
              score: 60 - (it.score ?? 0) * 100,
              feature: item.feature,
              props: item.props,
            });
          }
        } catch (e) {
          console.warn("fuseState error", e);
        }
      }

      // dedupe by type+name key
      const seen = new Set<string>();
      const deduped: SearchSuggestion[] = [];
      for (const r of results) {
        const key = `${r.type}::${(r.name || "").toLowerCase()}`;
        if (!seen.has(key)) {
          deduped.push(r);
          seen.add(key);
        }
      }

      // if nothing local and not numeric, fallback to nominatim geocode (optional)
      if (deduped.length === 0 && !hasDigit) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(
            q
          )}&addressdetails=1&limit=8&accept-language=en`;
          const res = await axios.get(url, { headers: { "Accept-Language": "en" } });
          const items = res.data || [];
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            deduped.push({
              id: `nom-${i}`,
              type: "Nominatim",
              name: it.display_name || `${it.lat},${it.lon}`,
              score: 40 - i,
              props: it,
              coord: it.lon && it.lat ? [Number(it.lon), Number(it.lat)] : undefined,
            });
          }
        } catch (err) {
          console.warn("nominatim failed", err);
        }
      }

      setSuggestions(deduped.slice(0, 12));
      setSearching(false);
    }, 120);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // when user picks a suggestion
  async function selectSuggestion(s: SearchSuggestion) {
    if (!s || !mapRef.current) return;
    const map = mapRef.current;

    if (s.type === "Pincode" && s.coord) {
      // show marker and zoom
      ensurePincodeMarker(s.coord, `PIN ${s.pincode}`);
      map.flyTo({ center: s.coord, zoom: 16, duration: 700 });
      setSelected({ name: s.pincode || s.name, type: "pincode" });
      setPanelOpen(true);
      setSuggestions([]);
      setQuery("");
      return;
    }

    if (s.type === "PC" && s.feature) {
      setSelected({ name: s.name, type: "pc" });
      setPanelOpen(true);
      // highlight
      try {
        const prop = pcNameProp ?? "pc_name";
        map.setFilter("pc-highlight", ["==", ["get", prop], s.name]);
      } catch {
        try {
          map.setFilter("pc-highlight", ["==", pcNameProp ?? "pc_name", s.name]);
        } catch {}
      }
      // fit to bbox
      try {
        const bbox = computeBboxFromGeometry(s.feature.geometry);
        if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
      } catch {}
      setSuggestions([]);
      setQuery("");
      return;
    }

    if (s.type === "State" && s.feature) {
      setSelected({ name: s.name, type: "state" });
      setPanelOpen(true);
      try {
        const bbox = computeBboxFromGeometry(s.feature.geometry);
        if (bbox) map.fitBounds(bbox as any, { padding: 40, duration: 700 });
      } catch {}
      setSuggestions([]);
      setQuery("");
      return;
    }

    if (s.type === "Nominatim" && s.coord) {
      setSelected({ name: s.name, type: "place" });
      setPanelOpen(true);
      map.flyTo({ center: s.coord, zoom: 14, duration: 700 });
      setSuggestions([]);
      setQuery("");
      return;
    }
  }

  // clear pc highlight + pincode marker when reset
  function handleReset() {
    setSelected(null);
    setPanelOpen(false);
    setHoverInfo(null);
    clearPincodeMarker();
    try {
      const map = mapRef.current;
      if (!map) return;
      if (map.getLayer("pc-highlight")) map.setFilter("pc-highlight", ["==", ["get", pcNameProp ?? "pc_name"], ""]);
      map.flyTo({ center: [80, 22], zoom: 4.5 });
    } catch {}
  }

  // keyboard handlers for search input
  const [activeIndex, setActiveIndex] = useState(-1);
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[activeIndex] ?? suggestions[0];
      if (s) selectSuggestion(s);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  }

  // click outside suggestions close
  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      const tgt = ev.target as Node;
      // rough heuristic: if clicked outside body of the map & suggestions, clear (we keep it simple)
      if (!(tgt as HTMLElement)?.closest) {
        setSuggestions([]);
        return;
      }
      if (!(tgt as HTMLElement).closest(".voicemap-search-container")) {
        setSuggestions([]);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // ---- Render ----
  return (
    <>
      {/* Optional NavBar - enable if you have one */}
      {/* <NavBar onReset={handleReset} ... /> */}

      <div className="absolute top-4 left-4 z-50 w-[min(520px,92%)]">
        <div className="voicemap-search-container bg-white rounded shadow p-2">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search pincode, constituency, district, state, or place..."
              className="w-full rounded px-3 py-2 border focus:outline-none"
              aria-label="Search"
            />
            <button
              onClick={() => {
                if (query.trim().length) setQuery(query.trim());
              }}
              className="px-3 py-2 rounded bg-emerald-600 text-white"
            >
              Search
            </button>
            <button onClick={handleReset} title="Reset map" className="px-2 py-2 rounded border">
              Reset
            </button>
          </div>

          {searching && <div className="text-xs text-slate-500 mt-1">Searching…</div>}

          {suggestions.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto bg-white border rounded shadow z-60">
              {suggestions.map((s, i) => (
                <div
                  key={s.id + "-" + i}
                  onClick={() => selectSuggestion(s)}
                  className={`px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between ${
                    i === activeIndex ? "bg-slate-100" : ""
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.type}</div>
                  </div>
                  {s.type === "Pincode" && <div className="text-xs text-slate-400">PIN</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative h-[calc(100vh-0px)]">
        <div ref={containerRef} className="w-full h-full" />
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

        {loading && (
          <div className="absolute inset-0 z-60 flex items-center justify-center">
            <div className="bg-white/90 p-4 rounded shadow">Loading map data…</div>
          </div>
        )}

        {loadError && (
          <div className="absolute left-4 top-28 z-60">
            <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded shadow">
              <div className="font-medium">Data error</div>
              <div className="text-xs mt-1">{loadError}</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => { loadGeojsons(); }} className="px-3 py-1 bg-emerald-600 text-white rounded">
                  Retry
                </button>
                <button onClick={() => setLoadError(null)} className="px-3 py-1 rounded border">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 50 }} className="bg-white p-1 rounded shadow text-xs">
          © VoiceMap — demo
        </div>
      </div>

      <RightPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onToggle={() => setPanelOpen((s) => !s)}
        selected={selected}
        onReset={handleReset}
        geojsonError={loadError}
        onRetry={loadGeojsons}
      />
    </>
  );
}