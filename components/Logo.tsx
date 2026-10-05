import Link from "next/link";

// Wordmark with the blue dot; the large version adds the boxed path icon from the landing design.
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 font-black tracking-[-0.04em] text-ink no-underline hover:text-ink ${
        size === "lg" ? "text-[26px]" : "text-[22px]"
      }`}
    >
      {size === "lg" && (
        <span className="inline-flex h-[34px] w-[34px] items-center justify-center border-2 border-ink bg-blue shadow-[3px_3px_0_#111]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBF5E9" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20 L10 8 L14 14 L20 4" />
            <circle cx="20" cy="4" r="1.5" />
          </svg>
        </span>
      )}
      <span>
        pathfinder<span className="text-blue">.</span>
      </span>
    </Link>
  );
}
