"use client";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

export default function StaleIcon({ lastEmail }: { lastEmail: Date | string }) {
  const [showTip, setShowTip] = useState(false);
  const d = typeof lastEmail === "string" ? new Date(lastEmail) : lastEmail;
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));

  return (
    <div className="relative inline-flex">
      <AlertTriangle
        className="w-3.5 h-3.5 text-amber-400 cursor-help"
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      />
      {showTip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 whitespace-nowrap bg-gray-800 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1 shadow-lg pointer-events-none">
          No emails for {days} days — last received {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      )}
    </div>
  );
}
