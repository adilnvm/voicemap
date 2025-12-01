import React from "react";
import "@/app/globals.css";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "VoiceMap",
  description: "India: States & Districts map"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen">
        {/* <NavBar
        // onReset={handleReset}
        // onToggleSidebar={() => setPanelOpen((s) => !s)}
        // showStates={showStates}
        // showPCs={showPCs}
        // setShowStates={setShowStates}
        // setShowPCs={setShowPCs}
      /> */}
        <div className="max-w-full">
          {children}
        </div>
      </body>
    </html>
  );
}
