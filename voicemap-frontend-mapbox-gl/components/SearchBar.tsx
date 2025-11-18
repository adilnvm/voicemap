"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import Fuse from "fuse.js";
import { Search } from "lucide-react";

/**
 * SearchBar.tsx
 *
 * - Builds Fuse indexes for states, districts, and PCs (when available)
 * - Query order & weighting:
 *   1) Exact / fuzzy matches from local GeoJSON (PC / District / State)
 *   2) If nothing good, Nominatim fallback (neighbourhoods/localities)
 *
 * Emits: window.dispatchEvent(new CustomEvent("voicemap:fit", { detail }))
 * detail = { name, type, bbox?, center?, props? }
 */

type Suggestion = {
  id: string;
  type: "State" | "District" | "PC" | "Nominatim";
  name: string;
  score?: number;
  feature?: any;
  props?: any;
};

const MIN_QUERY_LEN = 2;
const LOCAL_LIMIT = 12;
const NOMINATIM_LIMIT = 8;

// small in-memory caching for nominatim queries to avoid repeat calls
const nominatimCache = new Map<string, any[]>();

// rate-limiter for Nominatim: simple last-call timestamp
let lastNominatimAt = 0;
const NOMINATIM_MIN_INTERVAL_MS = 250; // keep > 200ms to be polite

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // geo caches
  const statesRef = useRef<any | null>(null);
  const districtsRef = useRef<any | null>(null);
  const pcRef = useRef<any | null>(null);

  // Fuse instances
  const fuseState = useRef<Fuse<any> | null>(null);
  const fuseDistrict = useRef<Fuse<any> | null>(null);
  const fusePC = useRef<Fuse<any> | null>(null);

  // detect name property helper
  function detectNameProp(props: Record<string, any>, candidates: string[]) {
    if (!props) return null;
    for (const c of candidates) {
      if (Object.prototype.hasOwnProperty.call(props, c)) return c;
      if (Object.prototype.hasOwnProperty.call(props, c.toUpperCase())) return c.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(props, c.toLowerCase())) return c.toLowerCase();
    }
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v && typeof v === "string" && v.length < 80) return k;
    }
    return null;
  }

  // build a friendly label extractor from feature props (tries multiple fallbacks)
  function featureLabel(props: any) {
    if (!props) return "";
    return (
      props.pc_name ||
      props.PC_NAME ||
      props.PC ||
      props.name ||
      props.NAME ||
      props.NM ||
      props.st_name ||
      props.ST_NAME ||
      props.ST_NM ||
      props.DISTRICT ||
      props.DIST_NAME ||
      props.DIST ||
      ""
    ).toString();
  }

  // build index on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [sRes, dRes, pRes] = await Promise.all([
          axios.get("/data/states.geojson").catch(() => null),
          axios.get("/data/districts.geojson").catch(() => null),
          axios.get("/data/pc.geojson").catch(() => null),
        ]);

        if (!mounted) return;

        statesRef.current = sRes?.data ?? null;
        districtsRef.current = dRes?.data ?? null;
        pcRef.current = pRes?.data ?? null;

        // Build fuse indices with tuned options
        // We map each feature to a small item with search keys to keep indexing small & fast.

        // States
        if (statesRef.current?.features?.length) {
          const items = statesRef.current.features.map((f: any, idx: number) => {
            const name = featureLabel(f.properties) || `State ${idx}`;
            return {
              id: `s-${idx}`,
              idx,
              name,
              type: "State",
              feature: f,
              props: f.properties,
            };
          });

          fuseState.current = new Fuse(items, {
            keys: [
              { name: "name", weight: 1 },
              // allow searching on any property too
              { name: "props.ST_NM", weight: 0.6 },
              { name: "props.NAME", weight: 0.6 },
            ],
            includeScore: true,
            threshold: 0.32, // strict-ish for states
            shouldSort: true,
            ignoreLocation: true,
          });
        }

        // Districts
        if (districtsRef.current?.features?.length) {
          const items = districtsRef.current.features.map((f: any, idx: number) => {
            const name = featureLabel(f.properties) || `District ${idx}`;
            const state =
              f.properties?.ST_NM ||
              f.properties?.ST_NAME ||
              f.properties?.STATE ||
              f.properties?.state ||
              null;
            return {
              id: `d-${idx}`,
              idx,
              name,
              state,
              type: "District",
              feature: f,
              props: f.properties,
            };
          });

          fuseDistrict.current = new Fuse(items, {
            keys: [
              { name: "name", weight: 1 },
              { name: "state", weight: 0.6 },
              { name: "props.DISTRICT", weight: 0.8 },
              { name: "props.DIST_NAME", weight: 0.8 },
            ],
            includeScore: true,
            threshold: 0.36,
            ignoreLocation: true,
            shouldSort: true,
          });
        }

        // PCs
        if (pcRef.current?.features?.length) {
          const items = pcRef.current.features.map((f: any, idx: number) => {
            const name = featureLabel(f.properties) || `PC ${idx}`;
            const state = f.properties?.st_name || f.properties?.ST_NAME || f.properties?.st || f.properties?.ST || null;
            return {
              id: `p-${idx}`,
              idx,
              name,
              state,
              type: "PC",
              feature: f,
              props: f.properties,
            };
          });

          fusePC.current = new Fuse(items, {
            keys: [
              { name: "name", weight: 1 },
              { name: "state", weight: 0.6 },
              { name: "props.pc_name", weight: 0.9 },
              { name: "props.PC_NAME", weight: 0.9 },
              { name: "props.NAME", weight: 0.8 },
            ],
            includeScore: true,
            threshold: 0.36,
            ignoreLocation: true,
            shouldSort: true,
          });
        }
      } catch (err) {
        console.warn("Error loading geojson for search:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // main search effect
  useEffect(() => {
    if (!q || q.trim().length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    const query = q.trim();
    const t = setTimeout(async () => {
      // 1) perform local searches via Fuse (PC -> District -> State) and combine
      const results: Suggestion[] = [];

      // PC priority (higher relevance)
      if (fusePC.current) {
        try {
          const r = fusePC.current.search(query, { limit: 8 });
          for (const item of r) {
            const it = item.item as any;
            results.push({
              id: `${it.id}`,
              type: "PC",
              name: it.name,
              score: 100 - (item.score ?? 0) * 100,
              feature: it.feature,
              props: it.props,
            });
          }
        } catch (e) {
          console.warn("fusePC error", e);
        }
      }

      // Districts next
      if (fuseDistrict.current && results.length < LOCAL_LIMIT) {
        try {
          const r = fuseDistrict.current.search(query, { limit: 6 });
          for (const item of r) {
            const it = item.item as any;
            results.push({
              id: `${it.id}`,
              type: "District",
              name: it.name,
              score: 80 - (item.score ?? 0) * 100,
              feature: it.feature,
              props: it.props,
            });
          }
        } catch (e) {
          console.warn("fuseDistrict error", e);
        }
      }

      // States last
      if (fuseState.current && results.length < LOCAL_LIMIT) {
        try {
          const r = fuseState.current.search(query, { limit: 6 });
          for (const item of r) {
            const it = item.item as any;
            results.push({
              id: `${it.id}`,
              type: "State",
              name: it.name,
              score: 60 - (item.score ?? 0) * 100,
              feature: it.feature,
              props: it.props,
            });
          }
        } catch (e) {
          console.warn("fuseState error", e);
        }
      }

      // Deduplicate (type + lowercased name)
      const seen = new Set<string>();
      const deduped: Suggestion[] = [];
      for (const r of results) {
        const key = `${r.type}::${(r.name || "").toLowerCase()}`;
        if (!seen.has(key)) {
          deduped.push(r);
          seen.add(key);
        }
      }

      // If we have local results, present them (cap at LOCAL_LIMIT)
      if (deduped.length > 0) {
        setSuggestions(deduped.slice(0, LOCAL_LIMIT));
        setActiveIndex(-1);
        return;
      }

      // 2) Fallback to Nominatim (neighbourhoods/localities)
      // Rate-limit + cache
      const cached = nominatimCache.get(query);
      if (cached) {
        setSuggestions(
          (cached as any[]).map((it: any, i: number) => ({
            id: `n-${i}`,
            type: "Nominatim",
            name: it.display_name || `${it.lat},${it.lon}`,
            score: 40 - i,
            props: it,
          }))
        );
        setActiveIndex(-1);
        return;
      }

      const now = Date.now();
      const wait = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimAt));
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      lastNominatimAt = Date.now();

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(
          query
        )}&addressdetails=1&limit=${NOMINATIM_LIMIT}&accept-language=en`;
        const res = await axios.get(url, { headers: { "Accept-Language": "en" } });
        const items = res.data || [];
        nominatimCache.set(query, items);
        setSuggestions(
          (items as any[]).map((it, i) => ({
            id: `n-${i}`,
            type: "Nominatim",
            name: it.display_name || `${it.lat},${it.lon}`,
            score: 40 - i,
            props: it,
          }))
        );
        setActiveIndex(-1);
      } catch (err) {
        console.warn("Nominatim search failed", err);
        setSuggestions([]);
      }
    }, 120); // debounce

    return () => clearTimeout(t);
  }, [q]);

  // when user selects item
  async function selectSuggestion(s: Suggestion) {
    if (!s) return;
    // compute bbox or center depending on type
    let bbox: [[number, number], [number, number]] | undefined;
    let center: [number, number] | undefined;

    if (s.feature && s.feature.geometry) {
      const geom = s.feature.geometry;
      if (geom.type === "Point") {
        center = geom.coordinates as [number, number];
      } else if (geom.type === "Polygon") {
        const coords = geom.coordinates.flat();
        const lons = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        bbox = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ];
      } else if (geom.type === "MultiPolygon") {
        const coords = geom.coordinates.flat(2);
        const lons = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        bbox = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ];
      }
    } else if (s.type === "Nominatim" && s.props) {
      const p = s.props;
      if (p.boundingbox && p.boundingbox.length === 4) {
        // Nominatim boundingbox is [south, north, west, east]
        const [south, north, west, east] = p.boundingbox.map(Number);
        bbox = [
          [west, south],
          [east, north],
        ];
      } else if (p.lon && p.lat) {
        center = [Number(p.lon), Number(p.lat)];
      }
    }

    // dispatch fit event
    const detail: any = { name: s.name, type: s.type };
    if (bbox) detail.bbox = bbox;
    if (center) detail.center = center;
    if (s.props) detail.props = s.props;
    if (s.feature) detail.feature = s.feature;
    window.dispatchEvent(new CustomEvent("voicemap:fit", { detail }));

    // clear UI
    setSuggestions([]);
    setQ("");
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  // keyboard handlers
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
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
      setActiveIndex(-1);
    }
  }

  // click outside close
  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) {
        setSuggestions([]);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <Search className="ml-2 text-slate-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search neighborhood, district, state, or constituency..."
          className="w-full rounded-lg border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          aria-label="Search"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 bg-white border mt-2 rounded shadow z-50 overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => (
            <div
              key={s.id + i}
              onClick={() => selectSuggestion(s)}
              className={`px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between ${
                i === activeIndex ? "bg-slate-100" : ""
              }`}
              role="button"
            >
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-slate-500">{s.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="text-xs text-slate-500 mt-1">Loading search indexes…</div>}
    </div>
  );
}