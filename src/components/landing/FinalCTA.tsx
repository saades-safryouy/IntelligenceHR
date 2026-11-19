import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Reveal, scrollToId, useLanding } from "./LandingPrimitives";

export function FinalCTA({ onGetStarted }: { onGetStarted?: () => void }) {
  const { t, isRtl } = useLanding();
  const reduce = useReducedMotion();
  return (
    <section id="contact" className="relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2.5rem] px-6 py-16 text-center sm:px-12 sm:py-24 ihr-glass">
          <div className="pointer-events-none absolute inset-0 ihr-grid" aria-hidden />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute start-1/2 top-1/2 size-[min(700px,120vw)] -translate-x-1/2 -translate-y-1/2 rounded-full ihr-glow"
            animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative">
            <h2 className="text-4xl font-extrabold tracking-tight text-balance text-ihr-fg sm:text-5xl lg:text-6xl">
              <span className="block">{t.cta.title1}</span>
              <span className="block pb-1 ihr-gradient-text">{t.cta.title2}</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ihr-muted">{t.cta.subtitle}</p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={t.nav.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onGetStarted?.()}
                className="group inline-flex min-w-44 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ihr-primary ihr-btn-primary"
              >
                              {t.cta.primary}
                <ArrowRight
                  aria-hidden="true"
                  className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${
                    isRtl ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"
                  }`}
                />
              </a>
              <button
                type="button"
                onClick={() => scrollToId("features")}
                className="inline-flex items-center justify-center rounded-full border border-ihr-border bg-ihr-card px-8 py-4 text-base font-semibold text-ihr-fg hover:bg-ihr-card-2"
              >
                {t.cta.secondary}
              </button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
