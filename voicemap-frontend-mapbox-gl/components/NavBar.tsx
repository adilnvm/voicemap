// components/NavBar.tsx
"use client";

import React from "react";
import SearchBar from "./SearchBar";
import LayerToggle from "./LayerToggle";
import { RefreshCw, Menu } from "lucide-react";

export default function NavBar({
  onReset,
  onToggleSidebar,
  showStates,
  showPCs,
  setShowStates,
  setShowPCs,
}: {
  onReset: () => void;
  onToggleSidebar: () => void;
  showStates: boolean;
  showPCs: boolean;
  setShowStates: (v: boolean) => void;
  setShowPCs: (v: boolean) => void;
}) {
  return (
    <header className="w-full bg-white/70 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="text-2xl font-extrabold text-emerald-600">VoiceMap</div>
          <div className="text-sm text-slate-600 hidden sm:block">India</div>
        </div>

        {/* Search centered-grow */}
        <div className="flex-1">
          <SearchBar />
        </div>

        <div className="flex items-center gap-3">
          {/* small retry/reset icon */}
          <button
            onClick={onReset}
            title="Reset map"
            className="p-2 rounded-full border hover:bg-slate-50"
          >
            <RefreshCw className="w-5 h-5 text-slate-600" />
          </button>

          {/* layer toggles */}
          <LayerToggle
            showStates={showStates}
            showPCs={showPCs}
            setShowStates={setShowStates}
            setShowPCs={setShowPCs}
          />

          {/* hamburger */}
          <button
            onClick={onToggleSidebar}
            title="Menu"
            className="p-2 rounded-full border hover:bg-slate-50"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>

          <button className="hidden md:inline px-3 py-1 rounded border">Sign in</button>
        </div>
      </div>
    </header>
  );
}