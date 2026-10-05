"use client";

// Onboarding: 1 · CV + basics, 2 · what drives you, 3 · preferences.
// The profile is saved in the browser; finishing sends you to /matches, which starts a run.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { EMPTY_PROFILE, loadProfile, saveProfile } from "@/lib/store";
import { MOTIVATIONS, TARGET_PATHS, type Profile } from "@/lib/types";

const YEARS = ["Foundation", "1st year", "2nd year", "3rd year", "4th year", "Master's", "PhD"];
const STEPS = ["CV", "What drives you", "Preferences"];

// Skills we look for in the CV text to show "what we spotted". Purely keyword matching.
const SKILLS = [
  "Python", "Java", "C++", "C#", "JavaScript", "TypeScript", "React", "SQL", "R", "MATLAB", "Excel", "Figma",
  "PyTorch", "TensorFlow", "Machine learning", "Data analysis", "Statistics", "Linux", "Git", "AWS",
  "Leadership", "Public speaking", "Robotics", "Hackathon", "Research", "Trading", "Finance", "Teaching",
];

function spottedSkills(text: string): string[] {
  return SKILLS.filter((s) => {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
  }).slice(0, 8);
}

export default function Onboarding() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [step, setStep] = useState(0);
  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // localStorage only exists in the browser, so load after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(loadProfile());
  }, []);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((p) => ({ ...p, [key]: value }));
  const toggle = (key: "motivations" | "targetPaths", value: string) =>
    setProfile((p) => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter((v) => v !== value) : [...p[key], value],
    }));

  async function uploadCv(file: File) {
    setCvStatus("Reading your CV…");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile((p) => ({ ...p, cvText: data.text, cvName: file.name }));
      setCvStatus(null);
    } catch (err) {
      setCvStatus((err as Error).message);
    }
  }

  const stepValid = [
    profile.university.trim() && profile.degree.trim(),
    profile.motivations.length > 0,
    profile.targetPaths.length > 0,
  ][step];

  function next() {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    saveProfile(profile);
    router.push("/matches?run=1");
  }

  const skills = profile.cvText ? spottedSkills(profile.cvText) : [];

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-ink bg-cream">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-6 py-4">
          <Logo />
          <ol className="eyebrow ml-auto flex flex-wrap gap-2 tracking-[0.1em]">
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`border-2 border-ink px-3 py-2 ${
                    i < step
                      ? "cursor-pointer bg-ink text-cream"
                      : i === step
                        ? "bg-blue text-cream shadow-[3px_3px_0_#111]"
                        : "bg-cream text-ink"
                  }`}
                >
                  {i + 1} · {label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-10 px-6 pt-14 pb-20">
        {/* Left: CV */}
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-6">
          {profile.cvText ? (
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-ink bg-sky">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H6v18h12V7z" />
                    <path d="M14 3v4h4" />
                    <path d="M9 13l2 2 4-4" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="truncate font-extrabold">{profile.cvName ?? "your_cv.pdf"}</div>
                  <div className="eyebrow mt-0.5 text-[11px] tracking-[0.1em] text-blue">Read and understood</div>
                </div>
              </div>
              <div className="mt-5 mb-4 h-0.5 bg-ink" />
              <div className="eyebrow mb-3 text-[11px] text-muted">What we spotted</div>
              {skills.length ? (
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span key={s} className="chip bg-cream px-2.5 py-1.5 text-[13px]">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-body">Text read. We&apos;ll use all of it when matching.</p>
              )}
              <p className="mt-4 text-sm leading-normal text-body">
                <b>Next:</b> everything in your CV goes into the search plan, so projects and societies count as experience.
              </p>
            </div>
          ) : (
            <div className="card p-6">
              <div className="eyebrow text-[11px] text-muted">Your CV</div>
              <p className="mt-3 text-[15px] leading-normal text-body">
                Optional, but it makes matches sharper. PDF only, nothing leaves your browser except to read the text.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="press flex min-h-[120px] cursor-pointer items-center justify-center gap-2.5 border-2 border-dashed border-ink bg-sand p-4 text-center text-[15px] font-bold shadow-[4px_4px_0_#111]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M4 20h16" />
            </svg>
            {cvStatus ?? (profile.cvText ? "Swap CV" : "Drop your CV (PDF)")}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadCv(f);
              e.target.value = "";
            }}
          />
        </aside>

        {/* Right: current step */}
        <section className="min-w-0 flex-[2_1_560px]">
          <div className="eyebrow tracking-[0.16em] text-blue">Step {step + 1} of 3</div>

          {step === 0 && (
            <>
              <h1 className="mt-3 mb-3.5 text-[clamp(40px,5vw,68px)] leading-[0.95] font-black tracking-[-0.05em]">
                First, the <span className="hl">basics</span>.
              </h1>
              <p className="mb-7 max-w-[52ch] text-lg leading-normal text-body">
                Year of study matters most: half of spring weeks are first-years only.
              </p>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Your first name (optional)">
                  <input className="field" value={profile.name ?? ""} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="University">
                  <input className="field" placeholder="UCL" value={profile.university} onChange={(e) => set("university", e.target.value)} />
                </Field>
                <Field label="Degree">
                  <input className="field" placeholder="BSc Computer Science" value={profile.degree} onChange={(e) => set("degree", e.target.value)} />
                </Field>
                <Field label="Year of study">
                  <select className="field" value={profile.yearOfStudy} onChange={(e) => set("yearOfStudy", e.target.value)}>
                    {YEARS.map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="mt-3 mb-3.5 text-[clamp(40px,5vw,68px)] leading-[0.95] font-black tracking-[-0.05em]">
                What gets you out of <span className="hl">bed</span>?
              </h1>
              <p className="mb-7 max-w-[52ch] text-lg leading-normal text-body">
                Pick as many as feel true. Honest answers beat impressive ones; “money” is a perfectly good reason.
              </p>
              <div className="flex flex-wrap gap-3">
                {MOTIVATIONS.map((m) => (
                  <Pill key={m} on={profile.motivations.includes(m)} onClick={() => toggle("motivations", m)}>
                    {m}
                  </Pill>
                ))}
              </div>
              <p className="eyebrow mt-4 tracking-[0.1em] text-muted">
                {profile.motivations.length === 0 ? "Pick at least one" : `${profile.motivations.length} picked · we will weigh these heavily`}
              </p>
              <div className="mt-10 flex flex-col gap-2.5">
                <label htmlFor="interests" className="text-lg font-extrabold">
                  Topics you&apos;re into
                </label>
                <input
                  id="interests"
                  className="field shadow-[4px_4px_0_#111]"
                  placeholder="machine learning, trading, robotics…"
                  value={profile.interests}
                  onChange={(e) => set("interests", e.target.value)}
                />
              </div>
              <div className="mt-8 flex flex-col gap-2.5">
                <label htmlFor="extra" className="text-lg font-extrabold">
                  Anything else we should know?
                </label>
                <span className="text-sm text-muted">A project you&apos;re proud of, a society you run, a place you&apos;d love to work.</span>
                <textarea
                  id="extra"
                  rows={4}
                  className="field resize-y p-4 text-base shadow-[4px_4px_0_#111]"
                  placeholder="e.g. I built a Discord bot that tracks bus times for my halls…"
                  value={profile.experience}
                  onChange={(e) => set("experience", e.target.value)}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="mt-3 mb-3.5 text-[clamp(40px,5vw,68px)] leading-[0.95] font-black tracking-[-0.05em]">
                Where do you want to <span className="hl">aim</span>?
              </h1>
              <p className="mb-7 max-w-[52ch] text-lg leading-normal text-body">
                Pick the paths you&apos;re curious about. Not sure? Pick a few and let the matches decide.
              </p>
              <div className="flex flex-wrap gap-3">
                {TARGET_PATHS.map((p) => (
                  <Pill key={p} on={profile.targetPaths.includes(p)} onClick={() => toggle("targetPaths", p)}>
                    {p}
                  </Pill>
                ))}
              </div>
              <div className="mt-10 flex flex-col gap-2.5">
                <label htmlFor="where" className="text-lg font-extrabold">
                  Where?
                </label>
                <input
                  id="where"
                  className="field shadow-[4px_4px_0_#111]"
                  placeholder="London, UK, remote"
                  value={profile.locations}
                  onChange={(e) => set("locations", e.target.value)}
                />
              </div>
            </>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="btn btn-cream press px-5 py-4 text-base shadow-[4px_4px_0_#111]">
                ← Back
              </button>
            ) : (
              <Link href="/" className="btn btn-cream press px-5 py-4 text-base shadow-[4px_4px_0_#111]">
                ← Back
              </Link>
            )}
            <button
              type="button"
              disabled={!stepValid}
              onClick={next}
              className="btn btn-blue press px-6 py-4 text-base shadow-[4px_4px_0_#111]"
            >
              {step < 2 ? "Continue →" : "Find my matches →"}
            </button>
            <span className="ml-auto text-sm text-muted">You can change these anytime.</span>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="eyebrow text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-12 cursor-pointer border-2 border-ink px-4.5 py-3.5 text-base font-bold transition-[transform,box-shadow] duration-100 ${
        on ? "-rotate-1 bg-blue text-cream shadow-[4px_4px_0_#111]" : "bg-white text-ink"
      }`}
    >
      {on ? `✓ ${children}` : children}
    </button>
  );
}
