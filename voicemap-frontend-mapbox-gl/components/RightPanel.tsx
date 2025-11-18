// components/RightPanel.tsx
"use client";

import React from "react";
import { ChevronsRight, X } from "lucide-react";

export default function RightPanel({
  open,
  onClose,
  onToggle,
  selected,
  onReset,
  geojsonError,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  selected: { name: string; type?: string } | null;
  onReset: () => void;
  geojsonError?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`fixed right-4 top-20 bottom-6 z-60 transition-all duration-300 ${
        open ? "translate-x-0" : "translate-x-[420px]"
      }`}
      style={{ width: 400 }}
    >
      <div
        className="h-full rounded-2xl bg-white/60 backdrop-blur-xl border border-white/20 shadow-lg flex flex-col"
        role="region"
        aria-label="Details panel"
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
              {/* placeholder image */}
              <img src="/placeholder-96x96.png" alt="placeholder" className="w-10 h-10 object-cover rounded" />
            </div>
            <div>
              <div className="text-sm text-slate-500">Selected</div>
              <div className="text-lg font-semibold">{selected?.name ?? "Tap a state or parliamentary constituency"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="px-3 py-1 rounded-md bg-white/80 border text-sm shadow-sm hover:bg-white"
            >
              Reset
            </button>
            <button onClick={onClose} className="p-2 rounded-full border bg-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 flex-1 overflow-auto">
          {geojsonError ? (
            <div className="rounded p-4 bg-red-50 border border-red-100">
              <div className="font-medium text-sm text-red-700">Data load failed</div>
              <div className="text-xs text-red-600 mt-1">{geojsonError}</div>
              <div className="mt-3">
                <button
                  onClick={onRetry}
                  className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 text-sm text-slate-700">
                {/* placeholder description */}
                Lorem ipsum dolor sit amet, consectetur adipisicing elit. Voluptates, quia, dolor. This panel shows details for the selected administrative unit.
              </div>

              <div className="mt-6">
                <div className="text-xs text-slate-500">Quick links</div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button className="px-3 py-1 rounded bg-white border text-sm">View on OSM</button>
                  <button className="px-3 py-1 rounded bg-white border text-sm">Download GeoJSON</button>
                  <button className="px-3 py-1 rounded bg-white border text-sm">More</button>
                </div>
              </div>

              <div className="mt-6 text-xs text-slate-500">Meta</div>
              <div className="mt-2 text-sm text-slate-700">
                {selected ? (
                  <>
                    <div><strong>Type:</strong> {selected.type ?? "—"}</div>
                    <div className="mt-1"><strong>Name:</strong> {selected.name}</div>
                  </>
                ) : (
                  <div>No selection</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* handle / drag */}
        <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-slate-500">VoiceMap — demo</div>
          <button onClick={onToggle} title="Collapse" className="p-2 rounded-full border bg-white/60">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}