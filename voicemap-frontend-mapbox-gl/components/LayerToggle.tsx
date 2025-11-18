"use client";

import React from "react";

export default function LayerToggle({
  showStates,
  showPCs,
  setShowStates,
  setShowPCs,
}: {
  showStates: boolean;
  showPCs: boolean;
  setShowStates: (v: boolean) => void;
  setShowPCs: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowStates(!showStates)}
        className={`px-3 py-1 rounded-full border flex items-center gap-2 text-sm ${
          showStates ? "bg-emerald-600 text-white" : "bg-white text-slate-700"
        }`}
        title="Toggle States"
      >
        <span className="w-3 h-3 rounded-sm" style={{ background: showStates ? "#10B981" : "#D1D5DB" }} />
        <span className="hidden sm:inline-block">States</span>
      </button>

      <button
        onClick={() => setShowPCs(!showPCs)}
        className={`px-3 py-1 rounded-full border flex items-center gap-2 text-sm ${
          showPCs ? "bg-emerald-600 text-white" : "bg-white text-slate-700"
        }`}
        title="Toggle Parliamentary Constituencies"
      >
        <span className="w-3 h-3 rounded-sm" style={{ background: showPCs ? "#059669" : "#D1D5DB" }} />
        <span className="hidden sm:inline-block">PCs</span>
      </button>
    </div>
  );
}