"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import Fuse from "fuse.js";
import { Search } from "lucide-react";

/**
 * Enhanced SearchBar with:
 * - Numeric-first pincode logic
 * - 6-digit exact lookup -> /api/pincode/{code}
 * - 4-5 digit prefix -> /api/pincode/search?q=prefix
 * - 3-digit prefix -> local prefix->district mapping (small)
 * - Fallback: existing local Fuse indexes (PC/District/State)
 */

type Suggestion = {
  id: string;
  type: "State" | "District" | "PC" | "Nominatim" | "Pincode" | "PrefixDistrict";
  name: string;
  score?: number;
  feature?: any;
  props?: any;
  pincode?: string;
  location?: [number, number];
};

const MIN_QUERY_LEN = 1;
const LOCAL_LIMIT = 12;
const PINCODE_SUGGEST_LIMIT = 8;

// small prefix->district map for 3-digit prefixes (example; expand)
const PIN_PREFIX_MAP: Record<string, string[]> = {
  // --- Metros ---
  "110": ["New Delhi", "Delhi"],
  "400": ["Mumbai", "Mumbai Suburban", "Thane", "Navi Mumbai"],
  "560": ["Bengaluru"],
  "500": ["Hyderabad", "Secunderabad"],
  "700": ["Kolkata"],
  "600": ["Chennai"],

  // --- User Specials (Home & Proximity) ---
  "208": ["Kanpur", "Kanpur Nagar"],
  "211": ["Prayagraj", "Allahabad"],
  "212": ["Fatehpur"], // Home <3 (Between Kanpur and Prayagraj)

  // --- North India ---
  "201": ["Noida", "Ghaziabad", "Greater Noida"],
  "122": ["Gurugram (Gurgaon)"],
  "226": ["Lucknow"],
  "221": ["Varanasi"],
  "282": ["Agra"],
  "250": ["Meerut"],
  "243": ["Bareilly"],
  "160": ["Chandigarh"],
  "141": ["Ludhiana"],
  "143": ["Amritsar"],
  "121": ["Faridabad"],
  "190": ["Srinagar"],
  "302": ["Jaipur"],
  "342": ["Jodhpur"],
  "324": ["Kota"],

  // --- West India ---
  "380": ["Ahmedabad"],
  "395": ["Surat"],
  "390": ["Vadodara"],
  "360": ["Rajkot"],
  "411": ["Pune"],
  "412": ["Pune District", "Pimpri-Chinchwad"],
  "440": ["Nagpur"],
  "422": ["Nashik"],
  "431": ["Chhatrapati Sambhajinagar (Aurangabad)"],
  "401": ["Vasai-Virar", "Palghar"],

  // --- Central India ---
  "452": ["Indore"],
  "462": ["Bhopal"],
  "474": ["Gwalior"],
  "482": ["Jabalpur"],
  "492": ["Raipur"],

  // --- East India ---
  "800": ["Patna"],
  "831": ["Jamshedpur"],
  "826": ["Dhanbad"],
  "751": ["Bhubaneswar"],
  "781": ["Guwahati"],

  // --- South India ---
  "530": ["Visakhapatnam"],
  "520": ["Vijayawada"],
  "641": ["Coimbatore"],
  "625": ["Madurai"],
  "620": ["Tiruchirappalli"],
  "695": ["Thiruvananthapuram"],
  "682": ["Kochi", "Ernakulam"],
  "570": ["Mysuru"],
};

const nominatimCache = new Map<string, any[]>();

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // original local fuse indexes (states/pc/district) - optional reuse
  const fuseState = useRef<Fuse<any> | null>(null);
  const fuseDistrict = useRef<Fuse<any> | null>(null);
  const fusePC = useRef<Fuse<any> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // build local indexes as before (optional)
        const [sRes, dRes, pRes] = await Promise.all([
          axios.get("/data/states.geojson").catch(() => null),
          axios.get("/data/districts.geojson").catch(() => null),
          axios.get("/data/pc.geojson").catch(() => null),
        ]);
        if (!mounted) return;
        if (sRes?.data?.features) {
          const items = sRes.data.features.map((f: any, idx: number) => ({
            id: `s-${idx}`,
            idx,
            name: f.properties?.ST_NM || f.properties?.NAME || f.properties?.name || `State ${idx}`,
            feature: f,
            props: f.properties,
          }));
          fuseState.current = new Fuse(items, { keys: ["name"], includeScore: true, threshold: 0.36, ignoreLocation: true });
        }
        if (dRes?.data?.features) {
          const items = dRes.data.features.map((f: any, idx: number) => ({
            id: `d-${idx}`,
            idx,
            name: f.properties?.DISTRICT || f.properties?.NAME || `District ${idx}`,
            feature: f,
            props: f.properties,
          }));
          fuseDistrict.current = new Fuse(items, { keys: ["name"], includeScore: true, threshold: 0.36, ignoreLocation: true });
        }
        if (pRes?.data?.features) {
          const items = pRes.data.features.map((f: any, idx: number) => ({
            id: `p-${idx}`,
            idx,
            name: f.properties?.pc_name || f.properties?.NAME || `PC ${idx}`,
            feature: f,
            props: f.properties,
          }));
          fusePC.current = new Fuse(items, { keys: ["name"], includeScore: true, threshold: 0.36, ignoreLocation: true });
        }
      } catch (err) {
        console.warn("Search index load error", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!q || q.trim().length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const query = q.trim();
    const isNumeric = /^\d+$/.test(query);

    const t = setTimeout(async () => {
      try {
        // 1) Numeric logic
        if (isNumeric) {
          if (query.length === 6) {
            // exact pincode lookup
            try {
              const res = await axios.get(`/api/pincode/${query}`);
              const p = res.data;
              if (p) {
                setSuggestions([{
                  id: `pin-${p.pincode}`,
                  type: "Pincode",
                  name: `${p.pincode} — ${p.officeName ?? ""}`,
                  pincode: p.pincode,
                  location: p.location?.coordinates ? [p.location.coordinates[0], p.location.coordinates[1]] as [number, number] : undefined,
                }]);
                setActiveIndex(-1);
                return;
              }
            } catch (err) {
              // not found -> no suggestions
              setSuggestions([]);
              return;
            }
          } else if (query.length >= 4 && query.length <= 5) {
            // prefix search
            try {
              const res = await axios.get(`/api/pincode/search?q=${encodeURIComponent(query)}&limit=${PINCODE_SUGGEST_LIMIT}`);
              const items = res.data || [];
              const sug = items.map((p: any) => ({
                id: `pin-${p.pincode}`,
                type: "Pincode",
                name: `${p.pincode} — ${p.officeName ?? ""}`,
                pincode: p.pincode,
                location: p.location?.coordinates ? [p.location.coordinates[0], p.location.coordinates[1]] as [number, number] : undefined,
              }));
              setSuggestions(sug);
              setActiveIndex(-1);
              return;
            } catch (err) {
              setSuggestions([]);
              return;
            }
          } else if (query.length === 3) {
            // prefix -> show district suggestions from local small map
            const arr = PIN_PREFIX_MAP[query];
            if (arr && arr.length) {
              const sug: Suggestion[] = arr.map((name, i) => ({
                id: `pref-${query}-${i}`,
                type: "PrefixDistrict" as const,
                name: `${name} (pincode prefix ${query})`,
                props: { prefix: query, district: name }
              }));
              setSuggestions(sug);
              setActiveIndex(-1);
              return;
            }
            // else fallthrough to local fuse
          } else {
            // 1-2 digits: do not suggest; fallthrough to local fuse or nominatim
          }
        }

        // 2) Local fused search (PC -> District -> State) like before
        const results: Suggestion[] = [];

        if (fusePC.current) {
          try {
            const r = fusePC.current.search(query, { limit: 6 });
            for (const it of r) {
              results.push({
                id: `p-${it.item.idx}`,
                type: "PC",
                name: it.item.name,
                feature: it.item.feature,
                props: it.item.props,
                score: 100 - (it.score ?? 0) * 100
              });
            }
          } catch (e) { /* ignore */ }
        }

        if (results.length < LOCAL_LIMIT && fuseDistrict.current) {
          try {
            const r = fuseDistrict.current.search(query, { limit: 6 });
            for (const it of r) {
              results.push({
                id: `d-${it.item.idx}`,
                type: "District",
                name: it.item.name,
                feature: it.item.feature,
                props: it.item.props,
                score: 80 - (it.score ?? 0) * 100
              });
            }
          } catch (e) {}
        }

        if (results.length < LOCAL_LIMIT && fuseState.current) {
          try {
            const r = fuseState.current.search(query, { limit: 6 });
            for (const it of r) {
              results.push({
                id: `s-${it.item.idx}`,
                type: "State",
                name: it.item.name,
                feature: it.item.feature,
                props: it.item.props,
                score: 60 - (it.score ?? 0) * 100
              });
            }
          } catch (e) {}
        }

        if (results.length > 0) {
          setSuggestions(results.slice(0, LOCAL_LIMIT));
          setActiveIndex(-1);
          return;
        }

        // 3) fallback to Nominatim for locality suggestions (if not numeric heavy)
        // rate-limit + cache (kept same as earlier)
        const cached = nominatimCache.get(query);
        if (cached) {
          setSuggestions((cached as any[]).map((it: any, i: number) => ({
            id: `n-${i}`,
            type: "Nominatim",
            name: it.display_name || `${it.lat},${it.lon}`,
            props: it
          })));
          setActiveIndex(-1);
          return;
        }

        // polite fallback
        try {
          const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&addressdetails=1&limit=6`);
          nominatimCache.set(query, res.data);
          setSuggestions((res.data || []).map((it: any, i: number) => ({
            id: `n-${i}`,
            type: "Nominatim",
            name: it.display_name || `${it.lat},${it.lon}`,
            props: it
          })));
          setActiveIndex(-1);
        } catch (err) {
          setSuggestions([]);
        }
      } catch (err) {
        console.warn("Search main error", err);
        setSuggestions([]);
      }
    }, 120);

    return () => clearTimeout(t);
  }, [q]);

  // when user selects a suggestion
  async function selectSuggestion(s: Suggestion) {
    if (!s) return;

    // pincode exact
    if (s.type === "Pincode") {
      // dispatch event to map
      const detail: any = { name: s.name, type: "pincode" };
      if (s.location) {
        detail.center = s.location;
        detail.zoom = 14;
      }
      detail.pincode = s.pincode;
      window.dispatchEvent(new CustomEvent("voicemap:fit", { detail }));
      setSuggestions([]);
      setQ("");
      inputRef.current?.blur();
      return;
    }

    // prefix district selected -> use backend districts or local district geojson if available
    if (s.type === "PrefixDistrict") {
      const d = s.props;
      // attempt to find district feature in client-side districts geojson and fit bbox
      // we simply dispatch name + type, outer logic will handle highlight/fit
      window.dispatchEvent(new CustomEvent("voicemap:fit", { detail: { name: d.district, type: "District", admin: { prefix: d.prefix } } }));
      setSuggestions([]);
      setQ("");
      inputRef.current?.blur();
      return;
    }

    // Nominatim result or other features -> compute bbox/center as in your existing flow
    let bbox: any = undefined;
    let center: any = undefined;
    if ((s.feature && s.feature.geometry) || (s.props && s.props.boundingbox)) {
      if (s.feature && s.feature.geometry) {
        const geom = s.feature.geometry;
        if (geom.type === "Point") center = geom.coordinates;
        else if (geom.type === "Polygon") {
          const coords = geom.coordinates.flat();
          const lons = coords.map((c: number[]) => c[0]);
          const lats = coords.map((c: number[]) => c[1]);
          bbox = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
        } else if (geom.type === "MultiPolygon") {
          const coords = geom.coordinates.flat(2);
          const lons = coords.map((c: number[]) => c[0]);
          const lats = coords.map((c: number[]) => c[1]);
          bbox = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
        }
      } else if (s.props && s.props.boundingbox) {
        const p = s.props;
        const [south, north, west, east] = p.boundingbox.map(Number);
        bbox = [[west, south], [east, north]];
      }
      window.dispatchEvent(new CustomEvent("voicemap:fit", { detail: { name: s.name, type: s.type, bbox, center, props: s.props, feature: s.feature } }));
    } else {
      window.dispatchEvent(new CustomEvent("voicemap:fit", { detail: { name: s.name, type: s.type, props: s.props } }));
    }

    setSuggestions([]);
    setQ("");
    inputRef.current?.blur();
  }

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
          placeholder="Search neighbourhood, district, state, constituency or pincode (e.g. 110001)..."
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