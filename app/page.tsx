// Landing page.

import Link from "next/link";
import { Logo } from "@/components/Logo";

const TICKER = ["Spring weeks", "Internships", "Insight days", "Hackathons", "Research placements", "Courses", "Events"];

const WHY = [
  {
    title: "Live, not stale",
    body: "TinyFish searches and reads real careers pages right now, not a database scraped last spring. Every pick links to its source.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </>
    ),
  },
  {
    title: "Explains every match",
    body: "No black-box scores. Each pick says which bit of you it fits, cites the deadline and eligibility, and flags what to brush up.",
    icon: (
      <>
        <path d="M4 5h16v11H8l-4 4z" />
        <path d="M8 10h8" />
      </>
    ),
  },
  {
    title: "Deadlines, sorted",
    body: "Save a role and it lands on your deadline timeline. Hit Watch and TinyFish checks the page daily for changes.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    title: "Built for first-timers",
    body: "First-year with no network? Good. We start from what drives you, then find courses, events and people to close the gap.",
    icon: <path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z" />,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Nav */}
      <header className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-6 pt-6">
        <Logo size="lg" />
        <nav className="eyebrow ml-auto hidden flex-wrap items-center gap-6 sm:flex">
          <a href="#how" className="text-ink no-underline">
            How it works
          </a>
          <a href="#why" className="text-ink no-underline">
            Why us
          </a>
        </nav>
        <div className="flex gap-3 max-sm:ml-auto">
          <Link href="/matches" className="btn btn-cream press hidden shadow-[4px_4px_0_#111] sm:inline-flex">
            My matches
          </Link>
          <Link href="/onboarding" className="btn btn-blue press shadow-[4px_4px_0_#111]">
            Start free →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-16 px-6 pt-16 pb-24">
        <div className="min-w-0 flex-[1_1_520px]">
          <div className="eyebrow inline-flex -rotate-[1.5deg] items-center gap-2.5 border-2 border-ink bg-sky px-3.5 py-2 shadow-[3px_3px_0_#111]">
            <span className="h-2 w-2 rounded-full bg-blue" />
            For students &amp; fresh grads
          </div>
          <h1 className="mt-7 text-[clamp(52px,8vw,116px)] leading-[0.9] font-black tracking-[-0.055em]">
            Find the path that fits <span className="hl text-blue">you</span>.
          </h1>
          <div className="mt-8 mb-6 h-1 w-16 bg-ink" />
          <p className="max-w-[46ch] text-[19px] leading-relaxed text-body">
            Drop your CV, tell us what actually drives you, and Pathfinder hunts the live web for spring weeks, internships,
            events and research that match. Every pick comes with a reason, not just a keyword hit.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/onboarding" className="btn btn-blue press px-6 py-4 text-[17px] shadow-[6px_6px_0_#111]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4" />
                <path d="M7 9l5-5 5 5" />
                <path d="M4 20h16" />
              </svg>
              Drop your CV
            </Link>
            <a href="#how" className="btn btn-cream press px-6 py-4 text-[17px] shadow-[6px_6px_0_#111]">
              See how it works
            </a>
          </div>
          <p className="eyebrow mt-6 font-medium tracking-[0.08em] text-muted">
            Free for students · Live web, real links · Your data stays in your browser
          </p>
        </div>

        {/* Collage */}
        <div className="relative min-h-[520px] min-w-0 flex-[1_1_440px]" aria-hidden="true">
          <div className="card absolute top-0 left-[4%] w-[74%] -rotate-[4deg] p-5 shadow-[8px_8px_0_#111]">
            <div className="eyebrow text-[11px] text-muted">your_cv.pdf</div>
            <div className="mt-4 mb-2.5 h-3 w-3/5 bg-ink" />
            <div className="mb-2 h-2 w-[90%] bg-line" />
            <div className="mb-2 h-2 w-[78%] bg-line" />
            <div className="mb-4 h-2 w-[84%] bg-sky" />
            <div className="flex flex-wrap gap-2">
              <span className="chip">Python</span>
              <span className="chip">Robotics society</span>
              <span className="chip">Hackathon winner</span>
            </div>
          </div>
          <div className="absolute top-[190px] right-0 w-[78%] rotate-2 border-2 border-ink bg-blue p-6 text-cream shadow-[8px_8px_0_#111]">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow text-[11px]">Strong match</span>
              <span className="chip bg-cream text-ink">Closes in 9 days</span>
            </div>
            <div className="mt-3.5 text-[28px] leading-[1.05] font-black tracking-[-0.03em]">Spring Insight Programme</div>
            <div className="mt-1.5 text-[15px] font-semibold opacity-90">Quant fund · London · Spring 2027</div>
            <div className="mt-4 border-t-2 border-cream pt-3.5 text-sm leading-normal">
              <b>Why you:</b> first-years eligible, matches your ML interest, and you said you love cracking hard puzzles.
            </div>
          </div>
          <div className="absolute bottom-2 left-0 flex -rotate-6 items-center gap-2 border-2 border-ink bg-sky px-4 py-3.5 text-[15px] font-extrabold shadow-[4px_4px_0_#111]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
            </svg>
            Matched on motivation, not just keywords
          </div>
          <div className="eyebrow absolute right-[2%] bottom-[-10px] flex h-24 w-24 rotate-12 items-center justify-center rounded-full border-2 border-ink bg-cream text-center text-[11px] leading-tight tracking-[0.08em] shadow-[4px_4px_0_#111]">
            no
            <br />
            experience
            <br />
            needed
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="overflow-hidden border-y-2 border-ink bg-ink text-cream">
        <div className="flex gap-9 px-6 py-4 text-[28px] font-black tracking-[-0.02em] whitespace-nowrap uppercase">
          {TICKER.map((t, i) => (
            <span key={t} className="flex gap-9">
              {t}
              {i < TICKER.length - 1 && <span className="text-sky">✶</span>}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1280px] px-6 pt-28 pb-24">
        <div className="eyebrow tracking-[0.16em] text-blue">How it works</div>
        <h2 className="mt-3.5 mb-14 max-w-[16ch] text-[clamp(40px,5.4vw,72px)] leading-[0.95] font-black tracking-[-0.045em]">
          Three steps. Zero spreadsheets.
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-7">
          <div className="card p-8">
            <div className="text-[64px] leading-none font-black tracking-[-0.05em] text-blue">01</div>
            <h3 className="mt-5 mb-2.5 text-[26px] font-extrabold tracking-[-0.02em]">Drop your CV</h3>
            <p className="leading-relaxed text-body">
              A PDF is enough. Half-finished is fine. We read your skills, projects and the stuff you forgot was impressive.
            </p>
          </div>
          <div className="-rotate-1 border-2 border-ink bg-sky p-8 shadow-[6px_6px_0_#111]">
            <div className="text-[64px] leading-none font-black tracking-[-0.05em] text-blue">02</div>
            <h3 className="mt-5 mb-2.5 text-[26px] font-extrabold tracking-[-0.02em]">Tell us what drives you</h3>
            <p className="leading-relaxed text-[#2A2F3D]">
              Climate? Money? Building things? Pick your motivations and we weigh them as heavily as your grades.
            </p>
          </div>
          <div className="border-2 border-ink bg-blue p-8 text-cream shadow-[6px_6px_0_#111]">
            <div className="text-[64px] leading-none font-black tracking-[-0.05em] text-sky">03</div>
            <h3 className="mt-5 mb-2.5 text-[26px] font-extrabold tracking-[-0.02em]">Get matched, live</h3>
            <p className="leading-relaxed">
              TinyFish searches and reads real careers pages in about a minute. Each match gets a plain-English “why you” and
              the deadline up front.
            </p>
          </div>
        </div>
      </section>

      {/* Why */}
      <section id="why" className="border-y-2 border-ink bg-sand">
        <div className="mx-auto flex max-w-[1280px] flex-wrap gap-14 px-6 py-24">
          <div className="min-w-0 flex-[1_1_380px]">
            <div className="eyebrow tracking-[0.16em] text-blue">Why Pathfinder</div>
            <h2 className="mt-3.5 mb-6 text-[clamp(40px,5vw,64px)] leading-[0.95] font-black tracking-[-0.045em]">
              Job boards show you <span className="line-through decoration-4">everything</span>. We show you{" "}
              <span className="hl">yours</span>.
            </h2>
            <p className="max-w-[42ch] text-lg leading-relaxed text-body">
              Built for people who don&apos;t have a careers network yet. No jargon, no 400-tab job hunts, no guessing whether
              you&apos;re “qualified enough”.
            </p>
          </div>
          <div className="grid min-w-0 flex-[1.3_1_520px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
            {WHY.map((w) => (
              <div key={w.title} className="border-2 border-ink bg-cream p-6 shadow-[4px_4px_0_#111]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1E3A8F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {w.icon}
                </svg>
                <h3 className="mt-3.5 mb-2 text-xl font-extrabold">{w.title}</h3>
                <p className="text-[15px] leading-normal text-body">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1280px] px-6 pt-24">
        <div className="relative flex flex-wrap items-end gap-10 border-2 border-ink bg-blue p-[clamp(36px,6vw,80px)] text-cream shadow-[10px_10px_0_#111]">
          <div className="min-w-0 flex-[1_1_520px]">
            <h2 className="text-[clamp(44px,6.4vw,92px)] leading-[0.9] font-black tracking-[-0.055em]">Your first yes is out there.</h2>
            <p className="mt-6 max-w-[44ch] text-[19px] leading-normal text-[#E4EAF8]">
              Two minutes to set up. Then Pathfinder does the hunting while you&apos;re in lectures.
            </p>
          </div>
          <Link href="/onboarding" className="btn btn-cream press px-7 py-5 text-lg font-black shadow-[6px_6px_0_#111]">
            Start my path →
          </Link>
          <div className="eyebrow absolute -top-5 right-8 rotate-[4deg] border-2 border-ink bg-sky px-4 py-2.5 text-ink shadow-[3px_3px_0_#111]">
            Free for students
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-6 pt-24 pb-10">
        <div className="mb-6 h-0.5 bg-ink" />
        <div className="eyebrow flex flex-wrap items-center gap-x-8 gap-y-4">
          <Logo />
          <span className="text-muted">Powered by TinyFish Search, Fetch, Agent &amp; Monitor</span>
          <span className="ml-auto text-muted">Made for students, by students</span>
        </div>
      </footer>
    </div>
  );
}
