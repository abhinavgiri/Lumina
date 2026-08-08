"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Briefcase, Sparkles, Hash, LayoutTemplate } from "lucide-react";
import { searchAll, type SearchItem } from "@/lib/searchData";

const TYPE_ICON = {
  Job: Briefcase,
  Skill: Sparkles,
  Keyword: Hash,
  Template: LayoutTemplate,
} as const;

export default function SearchBar({ onPick }: { onPick?: (item: SearchItem) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = searchAll(query);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg/35" />
        <input
          className="input-dark w-full pl-10 pr-4 py-2.5 text-sm"
          placeholder="Search jobs, skills, keywords, templates…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="glass-deep absolute z-50 mt-2 w-full overflow-hidden py-1.5 max-h-80 overflow-y-auto"
          >
            {results.map((item, i) => {
              const Icon = TYPE_ICON[item.type];
              return (
                <button
                  key={`${item.type}-${item.label}-${i}`}
                  className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-panel/[0.06] transition-colors"
                  onClick={() => {
                    onPick?.(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-violet-300/80" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-fg/30">{item.type}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
