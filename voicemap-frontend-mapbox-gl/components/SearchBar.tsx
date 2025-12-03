"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import Fuse from "fuse.js";
import { Search } from "lucide-react";

/**
 * SearchBar
 *
 * Numeric behavior:
 *  - If input is 6 digits -> exact pincode lookup (/api/pincode/{code}), fly to centroid immediately.
 *  - If 3-5 digits -> prefix suggestions from /api/pincode/search?q={prefix}
 *  - If text -> local GeoJSON Fuse indexes: pc -> district -> state; fallback Nominatim
 *
 * Emits: window.dispatchEvent(new CustomEvent("voicemap:fit", { detail }))
 * detail: { name, type: 'pincode'|'pc'|'district'|'state'|'nominatim', center?, bbox?, admin?, props?, feature? , zoom? }
 */

type Suggestion = {
  id: string;
  type: "Pincode" | "PC" | "District" | "State" | "Nominatim";
  name: string;
  score?: number;
  props?: any;
  feature?: any;
  center?: [number, number];
};

const MIN_QUERY_LEN = 1;
const LOCAL_LIMIT = 12;
const NOMINATIM_LIMIT = 8;

const nominatimCache = new Map<string, any[]>();
const pincodePrefixCache = new Map<string, any[]>();
const pincodeExactCache = new Map<string, any>();

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // local geo caches
  const statesRef = useRef<any | null>(null);
  const districtsRef = useRef<any | null>(null);
  const pcRef = useRef<any | null>(null);

  // Fuse indexes
  const fuseState = useRef<Fuse<any> | null>(null);
  const fuseDistrict = useRef<Fuse<any> | null>(null);
  const fusePC = useRef<Fuse<any> | null>(null);

  // helper to pick a label from props
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
      ""
    ).toString();
  }

  // on mount: load local GeoJSON files (fast) and build Fuse indices
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

        if (statesRef.current?.features?.length) {
          const items = statesRef.current.features.map((f: any, idx: number) => {
            const name = featureLabel(f.properties) || `State ${idx}`;
            return { id: `s-${idx}`, idx, name, type: "State", feature: f, props: f.properties };
          });
          fuseState.current = new Fuse(items, {
            keys: [{ name: "name", weight: 1 }],
            includeScore: true,
            threshold: 0.32,
            shouldSort: true,
            ignoreLocation: true,
          });
        }

        if (districtsRef.current?.features?.length) {
          const items = districtsRef.current.features.map((f: any, idx: number) => {
            const name = featureLabel(f.properties) || `District ${idx}`;
            const state =
              f.properties?.ST_NM ||
              f.properties?.ST_NAME ||
              f.properties?.STATE ||
              f.properties?.state ||
              null;
            return { id: `d-${idx}`, idx, name, state, type: "District", feature: f, props: f.properties };
          });
          fuseDistrict.current = new Fuse(items, {
            keys: [
              { name: "name", weight: 1 },
              { name: "state", weight: 0.6 },
              { name: "props.DISTRICT", weight: 0.8 },
            ],
            includeScore: true,
            threshold: 0.36,
            ignoreLocation: true,
            shouldSort: true,
          });
        }

        if (pcRef.current?.features?.length) {
          const items = pcRef.current.features.map((f: any, idx: number) => {
            const name = featureLabel(f.properties) || `PC ${idx}`;
            const state = f.properties?.st_name || f.properties?.ST_NAME || f.properties?.st || f.properties?.ST || null;
            return { id: `p-${idx}`, idx, name, state, type: "PC", feature: f, props: f.properties };
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

  // helper: debounce-like action for queries
  useEffect(() => {
    if (!q || q.trim().length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    const query = q.trim();
    const t = setTimeout(() => runSearch(query), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function runSearch(query: string) {
    // numeric-only?
    const digits = /^\d+$/.test(query);

    // If entire query is digits:
    if (digits) {
      // 6-digit exact pin -> immediate exact lookup
      if (query.length === 6) {
        try {
          // cached?
          if (pincodeExactCache.has(query)) {
            const p = pincodeExactCache.get(query);
            if (p) selectPincodeSuggestion(p);
            return;
          }
          const res = await axios.get(`/api/pincode/${encodeURIComponent(query)}`);
          if (res.data) {
            pincodeExactCache.set(query, res.data);
            selectPincodeSuggestion(res.data);
            return;
          }
        } catch (err) {
          // not found -> fallback to prefix suggestions
        }
      }

      // 3-5 digits (or non-found 6-digit) -> prefix suggestions
      if (query.length >= 3) {
        try {
          if (pincodePrefixCache.has(query)) {
            const items = pincodePrefixCache.get(query) || [];
            setSuggestions(items.map((it: any, i: number) => mapPincodeToSuggestion(it, i)));
            return;
          }
          const res = await axios.get(`/api/pincode/search`, { params: { q: query, limit: 10 } });
          const items = res.data || [];
          pincodePrefixCache.set(query, items);
          setSuggestions(items.map((it: any, i: number) => mapPincodeToSuggestion(it, i)));
          return;
        } catch (err) {
          console.warn("prefix pincode search failed", err);
        }
      }

      // if less than 3 digits -> try to show relevant districts/states by numeric prefix (optional)
      if (query.length < 3) {
        // We'll fall through to local textual search below (district/state via fuse)
      }
    }

    // Not purely numeric or fallback path -> do local fuzzy search: PC -> District -> State
    const results: Suggestion[] = [];

    try {
      if (fusePC.current) {
        const r = fusePC.current.search(query, { limit: 6 });
        for (const item of r) {
          const it = item.item as any;
          results.push({ id: it.id, type: "PC", name: it.name, score: 100 - (item.score ?? 0) * 100, feature: it.feature, props: it.props });
        }
      }
    } catch (e) {
      console.warn("fusePC error", e);
    }

    try {
      if (fuseDistrict.current && results.length < LOCAL_LIMIT) {
        const r = fuseDistrict.current.search(query, { limit: 6 });
        for (const item of r) {
          const it = item.item as any;
          results.push({ id: it.id, type: "District", name: it.name, score: 80 - (item.score ?? 0) * 100, feature: it.feature, props: it.props });
        }
      }
    } catch (e) {
      console.warn("fuseDistrict error", e);
    }

    try {
      if (fuseState.current && results.length < LOCAL_LIMIT) {
        const r = fuseState.current.search(query, { limit: 6 });
        for (const item of r) {
          const it = item.item as any;
          results.push({ id: it.id, type: "State", name: it.name, score: 60 - (item.score ?? 0) * 100, feature: it.feature, props: it.props });
        }
      }
    } catch (e) {
      console.warn("fuseState error", e);
    }

    // dedupe and present if we have results
    if (results.length > 0) {
      const seen = new Set<string>();
      const deduped: Suggestion[] = [];
      for (const r of results) {
        const key = `${r.type}::${(r.name || "").toLowerCase()}`;
        if (!seen.has(key)) {
          deduped.push(r);
          seen.add(key);
        }
      }
      setSuggestions(deduped.slice(0, LOCAL_LIMIT));
      setActiveIndex(-1);
      return;
    }

    // fallback to Nominatim
    try {
      const cached = nominatimCache.get(query);
      if (cached) {
        setSuggestions((cached as any[]).map((it: any, i: number) => ({
          id: `n-${i}`,
          type: "Nominatim",
          name: it.display_name || `${it.lat},${it.lon}`,
          props: it,
        })));
        return;
      }
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&addressdetails=1&limit=${NOMINATIM_LIMIT}&accept-language=en`;
      const res = await axios.get(url, { headers: { "Accept-Language": "en" } });
      const items = res.data || [];
      nominatimCache.set(query, items);
      setSuggestions(items.map((it: any, i: number) => ({ id: `n-${i}`, type: "Nominatim", name: it.display_name || `${it.lat},${it.lon}`, props: it })));
    } catch (err) {
      console.warn("Nominatim search failed", err);
      setSuggestions([]);
    }
  }

  function mapPincodeToSuggestion(item: any, idx: number): Suggestion {
    const center = item?.location?.coordinates ? [item.location.coordinates[0], item.location.coordinates[1]] : undefined;
    const name = `${item.pincode} — ${item.officeName ?? item.office_name ?? ""}`.trim();
    return {
      id: `pin-${item.pincode}-${idx}`,
      type: "Pincode",
      name,
      props: item,
      center,
    };
  }

  async function selectPincodeSuggestion(p: any) {
    // p is backend pincode object
    if (!p) return;
    const center = p.location?.coordinates ? [p.location.coordinates[0], p.location.coordinates[1]] : undefined;
    const detail: any = { name: `${p.pincode} ${p.officeName ?? ""}`.trim(), type: "pincode" };
    if (center) detail.center = center;
    // if backend returned admin mapping (district/state/pc) include it so page.tsx can highlight
    if (p.admin) detail.admin = p.admin;
    // keep the raw object
    detail.props = p;
    window.dispatchEvent(new CustomEvent("voicemap:fit", { detail }));
    // UI cleanup
    setSuggestions([]);
    setQ("");
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  async function selectSuggestion(s: Suggestion) {
    if (!s) return;
    if (s.type === "Pincode") {
      // If suggestion contains full pin object (some prefix API returns), use exact fetch to get admin & full props
      try {
        const pin = s.props?.pincode ?? (s.props && s.props.pincode) ?? (s.name?.slice?.(0, 6) ?? null);
        if (pin) {
          // try cached exact
          if (pincodeExactCache.has(pin)) {
            selectPincodeSuggestion(pincodeExactCache.get(pin));
            return;
          }
          const res = await axios.get(`/api/pincode/${encodeURIComponent(pin)}`);
          pincodeExactCache.set(pin, res.data);
          selectPincodeSuggestion(res.data);
          return;
        }
      } catch (err) {
        console.warn("exact pin fetch failed - falling back to center", err);
      }
    }

    // for PC/District/State/Nominatim: compute bbox/center and dispatch
    let bbox: [[number, number], [number, number]] | undefined;
    let center: [number, number] | undefined;

    if (s.feature && s.feature.geometry) {
      const geom = s.feature.geometry;
      if (geom.type === "Point") center = geom.coordinates as [number, number];
      else if (geom.type === "Polygon") {
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
        const [south, north, west, east] = p.boundingbox.map(Number);
        bbox = [
          [west, south],
          [east, north],
        ];
      } else if (p.lon && p.lat) {
        center = [Number(p.lon), Number(p.lat)];
      }
    } else if (s.center) {
      center = s.center;
    }

    const detail: any = { name: s.name, type: s.type.toLowerCase() };
    if (bbox) detail.bbox = bbox;
    if (center) detail.center = center;
    if (s.props) detail.props = s.props;
    if (s.feature) detail.feature = s.feature;

    window.dispatchEvent(new CustomEvent("voicemap:fit", { detail }));
    setSuggestions([]);
    setQ("");
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  // keyboard handling
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

  // clicking outside hides suggestions
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
          placeholder="Search pincode, constituency, district, state, or place (e.g. 110001)..."
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
              className={`px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between ${i === activeIndex ? "bg-slate-100" : ""}`}
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
