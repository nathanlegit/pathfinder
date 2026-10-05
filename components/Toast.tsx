"use client";

import { AnimatePresence, motion } from "motion/react";

// Bottom-centre confirmation ("★ Saved to your shortlist"). Sits above the mobile tab bar.
export function Toast({ message }: { message: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 24, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: -1 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="border-2 border-ink bg-ink px-5 py-3 font-extrabold text-cream shadow-[4px_4px_0_#CFD9F2]"
            role="status"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
