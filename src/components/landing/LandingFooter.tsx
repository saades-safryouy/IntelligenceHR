import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { scrollToId, useLanding } from "./LandingPrimitives";
import logoForDark from "../../assets/IAgency_light_logo.png";
import logoForLight from "../../assets/IAgency_logo.png";
import type { LandingTheme } from "./landingTranslations";

export interface LandingFooterProps {
  theme: LandingTheme | undefined;
}

interface FooterLinkItem {
  id: string;
  label: string;
}

const linkClass =
  "rounded-sm text-sm text-ihr-muted transition-colors hover:text-ihr-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ihr-primary";

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-ihr-fg">{title}</h3>
      {children}
    </div>
  );
}

function FooterLinks({ title, items }: { title: string; items: FooterLinkItem[] }) {
  return (
    <FooterColumn title={title}>
      <nav aria-label={title}>
        <ul className="mt-4 space-y-3">
          {items.map(({ id, label }) => (
            <li key={`${id}-${label}`}>
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId(id);
                }}
                className={linkClass}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </FooterColumn>
  );
}

export function LandingFooter({ theme }: LandingFooterProps) {
  const { t } = useLanding();

  // Optional keys: add `product` and `modules` to footer in landingTranslations
  // to translate these headings. Until then the English fallbacks are used.
  const footerText = t.footer as typeof t.footer & { product?: string; modules?: string };

  const product: FooterLinkItem[] = [
    { id: "home", label: t.nav.home },
    { id: "features", label: t.nav.features },
    { id: "how-it-works", label: t.nav.how },
    { id: "analytics", label: t.nav.analytics },
  ];

  const f = t.overview.features;
  const modules: FooterLinkItem[] = [
    { id: "modules", label: f[0].title },
    { id: "modules", label: f[1].title },
    { id: "eflow", label: f[3].title },
    { id: "organigram", label: f[5].title },
    { id: "self-service", label: t.portal.eyebrow },
  ];

  // Treat the translated value as the site address; ensure it has a protocol.
  const site = t.footer.website;
  const siteHref = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const siteLabel = site.replace(/^https?:\/\//i, "").replace(/\/$/, "");

  return (
    <footer className="border-t border-ihr-border px-4 pt-16 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ihr-fg">
            {/* The name is written next to the logo, so the image is decorative */}
            <img
              src={theme === "dark" ? logoForDark : logoForLight}
              alt=""
              className="size-12"
            />
            <span>
              Intelligence<span className="text-ihr-primary">HR</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-ihr-muted">{t.footer.desc}</p>
        </div>

        <FooterLinks title={footerText.product ?? "Product"} items={product} />
        <FooterLinks title={footerText.modules ?? "Modules"} items={modules} />

        <FooterColumn title={t.footer.contact}>
          <ul className="mt-4 space-y-3 text-sm text-ihr-muted">
            <li className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-ihr-primary" aria-hidden="true" />
              <a
                href={siteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-ihr-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ihr-primary"
              >
                {siteLabel}
              </a>
            </li>
          </ul>
        </FooterColumn>
      </div>

      <div className="mx-auto mt-14 max-w-7xl border-t border-ihr-border pt-6 text-center text-xs text-ihr-muted">
        © {new Date().getFullYear()} Intelligence Agency. All rights reserved.
      </div>
    </footer>
  );
}
