"use client";

import { useEffect } from "react";

/** Auto-opens the browser print dialog ("Save as PDF") shortly after load. */
export default function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto mb-4 max-w-[210mm] text-center print:hidden">
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
