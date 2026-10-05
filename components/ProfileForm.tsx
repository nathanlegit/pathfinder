"use client";

import { useState } from "react";
import { TARGET_PATHS, type Profile } from "@/lib/types";

const YEARS = ["Foundation", "1st year", "2nd year", "3rd year", "4th year", "Master's", "PhD"];

type Props = {
  profile: Profile;
  onChange: (p: Profile) => void;
  onSubmit: () => void;
  running: boolean;
};

const inputCls =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";

export function ProfileForm({ profile, onChange, onSubmit, running }: Props) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    onChange({ ...profile, [key]: value });

  const togglePath = (path: string) =>
    set(
      "targetPaths",
      profile.targetPaths.includes(path)
        ? profile.targetPaths.filter((p) => p !== path)
        : [...profile.targetPaths, path],
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Name (optional)</label>
          <input className={inputCls} value={profile.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>University</label>
          <input
            className={inputCls}
            required
            placeholder="UCL"
            value={profile.university}
            onChange={(e) => set("university", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Degree</label>
          <input
            className={inputCls}
            required
            placeholder="BSc Computer Science"
            value={profile.degree}
            onChange={(e) => set("degree", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Year of study</label>
          <select
            className={inputCls}
            value={profile.yearOfStudy}
            onChange={(e) => set("yearOfStudy", e.target.value)}
          >
            {YEARS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Target paths</label>
        <div className="flex flex-wrap gap-2">
          {TARGET_PATHS.map((path) => {
            const on = profile.targetPaths.includes(path);
            return (
              <button
                type="button"
                key={path}
                onClick={() => togglePath(path)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  on
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {path}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelCls}>Interests</label>
        <textarea
          className={inputCls}
          rows={2}
          placeholder="ML, systems, trading, startups…"
          value={profile.interests}
          onChange={(e) => set("interests", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Location preferences</label>
        <input
          className={inputCls}
          placeholder="London, UK, remote"
          value={profile.locations}
          onChange={(e) => set("locations", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Current experience</label>
        <textarea
          className={inputCls}
          rows={3}
          placeholder="Projects, societies, previous internships…"
          value={profile.experience}
          onChange={(e) => set("experience", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>CV (optional PDF)</label>
        <CvUpload cvText={profile.cvText} onText={(t) => set("cvText", t)} />
      </div>

      <button
        type="submit"
        disabled={running}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
      >
        {running ? "Mapping your path…" : "Map my path"}
      </button>
    </form>
  );
}

// Uploads a PDF to /api/cv and stores the extracted text on the profile.
function CvUpload({ cvText, onText }: { cvText?: string; onText: (t: string | undefined) => void }) {
  const [status, setStatus] = useState<string | null>(null);

  async function upload(file: File) {
    setStatus("Reading CV…");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onText(data.text);
      setStatus(`${file.name} added (${data.text.length.toLocaleString()} characters)`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="cursor-pointer rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300">
        {cvText ? "Replace PDF" : "Upload PDF"}
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </label>
      {cvText && (
        <button
          type="button"
          className="text-xs text-zinc-500 hover:text-red-400"
          onClick={() => {
            onText(undefined);
            setStatus(null);
          }}
        >
          remove
        </button>
      )}
      {status && <span className="truncate text-xs text-zinc-500">{status}</span>}
    </div>
  );
}
