// components/HoverCard.tsx
"use client";

import React from "react";

export default function HoverCard({ title, description }: { title: string; description?: string }) {
  return (
    <div className="bg-white rounded-lg shadow px-3 py-2 border">
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="text-xs text-slate-500 mt-1">{description}</div>}
    </div>
  );
}