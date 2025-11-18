"use client";

import React from "react";

type Props = {
  selected: { name: string; type: "state" | "pc"; props?: any } | null;
  onClose: () => void;
};

export default function InfoPanel({ selected, onClose }: Props) {
  // show placeholder when nothing selected
  if (!selected) {
    return (
      <div className="hidden sm:block">
        <div className="w-full h-full bg-white/10 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-white/10 flex items-center justify-center">
          <div className="text-slate-700 text-sm">Tap a state or parliamentary constituency to view details</div>
        </div>
      </div>
    );
  }

  const { name, type, props } = selected;

  // fields
  const title = name;
  const subtitle = type === "state" ? "State" : "Parliamentary Constituency";
  // optional additional props to show (pc_no, st_name, wiki)
  const pcNo = props?.pc_no ?? props?.PC_NO ?? null;
  const stName = props?.st_name ?? props?.ST_NM ?? props?.ST_NAME ?? null;
  const wikidata = props?.wikidata_qid ?? props?.WIKIDATA_QID ?? null;

  return (
    <div className="w-full sm:w-96 max-w-md">
      <div className="bg-white/30 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-2xl font-extrabold text-emerald-700">{title}</div>
            <div className="text-sm text-slate-700 mt-1">{subtitle}{stName ? ` • ${stName}` : ""}</div>
            {pcNo && <div className="text-xs text-slate-600 mt-2">PC No: {pcNo}</div>}
          </div>

          <div className="flex items-start gap-2">
            <button onClick={onClose} className="rounded-full bg-white/60 p-2 hover:scale-105 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-3">
          <div className="w-28 h-18 bg-white/40 rounded-md flex items-center justify-center text-slate-600 text-sm">
            Image
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-700 mb-2">
              Lorem ipsum dolor sit amet, consectetur adipisicing elit. Place-holder description for the area. This panel will include MP/MLA and officer details in Phase 2.
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="text-xs text-slate-600">Population</div>
              <div className="text-xs font-medium">—</div>

              <div className="text-xs text-slate-600">Districts / PCs</div>
              <div className="text-xs font-medium">{type === "state" ? "…" : "1"}</div>

              <div className="text-xs text-slate-600">Wikidata</div>
              <div className="text-xs font-medium">
                {wikidata ? (
                  <a className="text-emerald-700 underline" href={`https://www.wikidata.org/wiki/${wikidata}`} target="_blank" rel="noreferrer">
                    {wikidata}
                  </a>
                ) : (
                  "—"
                )}
              </div>

              <div className="text-xs text-slate-600">More</div>
              <div className="text-xs font-medium">—</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-1 rounded border text-sm">Share</button>
          <button className="px-3 py-1 rounded bg-emerald-600 text-white text-sm">Open Details</button>
        </div>
      </div>
    </div>
  );
}