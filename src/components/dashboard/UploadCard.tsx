"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import type { ResumeInfo } from "@/components/dashboard/types";

export default function UploadCard({ onUploaded }: { onUploaded: (r: ResumeInfo) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const uploadFile = useCallback(
    (file: File) => {
      setError(null);
      setDone(false);
      setProgress(0);

      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/resume/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
      };
      xhr.onload = () => {
        try {
          // XHR rather than apiFetch because only XHR reports upload progress —
          // so the { ok, data } envelope (lib/api/response) is unwrapped by hand.
          const body = JSON.parse(xhr.responseText) as
            | { ok: true; data: { resumeId: string; rawText: string } }
            | { ok: false; error: string };

          if (body.ok) {
            setProgress(100);
            setDone(true);
            setTimeout(() => setProgress(null), 900);
            onUploaded({
              id: body.data.resumeId,
              rawText: body.data.rawText,
              source: "uploaded",
              structuredJson: null,
            });
          } else {
            setError(body.error || "Upload failed.");
            setProgress(null);
          }
        } catch {
          setError("Unexpected server response.");
          setProgress(null);
        }
      };
      xhr.onerror = () => {
        setError("Network error while uploading. Please try again.");
        setProgress(null);
      };
      xhr.send(formData);
    },
    [onUploaded]
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) uploadFile(accepted[0]);
    },
    [uploadFile]
  );

  // Drag-and-drop is desktop-only; on touch devices we rely on the native
  // <label>+<input> below (see NATIVE_INPUT_ID) because iOS Safari refuses to
  // open a file picker from a JS-triggered click — only a real tap on a
  // label/input works there.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  });

  const uploading = progress !== null && !done;

  const NATIVE_INPUT_ID = "resume-native-file-input";

  return (
    <div>
      {/* Native file input — the reliable path on mobile/iOS. The <label>
          buttons below point at this by id, so a tap opens the OS file picker
          with no JS gesture forwarding (which iOS blocks). */}
      <input
        id={NATIVE_INPUT_ID}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />

      <label
        htmlFor={NATIVE_INPUT_ID}
        {...getRootProps({
          className: `block cursor-pointer relative overflow-hidden rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all duration-300 ${
            isDragActive
              ? "border-violet-400/70 bg-violet-500/10 scale-[1.01]"
              : "border-panel/15 hover:border-violet-400/40 hover:bg-panel/[0.03]"
          }`,
        })}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {uploading ? (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FileText className="mx-auto h-9 w-9 text-violet-300 animate-pulse" />
              <p className="mt-3 text-sm text-fg/70">Parsing your resume…</p>
              <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-panel/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut" }}
                />
              </div>
            </motion.div>
          ) : done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
              <p className="mt-3 text-sm text-emerald-300/90">Resume parsed successfully</p>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <UploadCloud className="mx-auto h-9 w-9 text-violet-300/90" />
              </motion.div>
              <p className="mt-3 font-medium text-fg/85">
                <span className="hidden sm:inline">Drag &amp; drop your resume, or </span>
                <span className="sm:hidden">Add your resume — </span>tap to browse
              </p>
              <p className="mt-1 text-xs text-fg/40">PDF or DOCX · parsed locally, never shared</p>
              {/* Visual button only — the surrounding <label> handles the tap,
                  so this must NOT be a <button> (that would swallow the tap). */}
              <motion.span
                whileTap={{ scale: 0.96 }}
                className="btn-gradient mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-medium text-fg"
              >
                Choose file
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </label>

      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-sm text-red-400">
          {error}
        </motion.p>
      )}
    </div>
  );
}
