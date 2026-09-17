"use client";

import Link from "next/link";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";

type Section = { title: string; body: React.ReactNode };

export function LegalPage({ title, intro, sections }: { title: { en: string; es: string }; intro: { en: string; es: string }; sections: { en: Section[]; es: Section[] } }) {
  const { locale } = useLanguage();
  const content = sections[locale];
  return <main className="legal-page"><header><Link href="/login"><MagicBrainLogo /></Link><LanguageToggle /></header><article><span className="eyebrow">MAGIC BRAIN · LEGAL</span><h1>{title[locale]}</h1><p className="legal-intro">{intro[locale]}</p><small>{locale === "es" ? "Última actualización: 17 de septiembre de 2026" : "Last updated: 17 September 2026"}</small>{content.map((section) => <section key={section.title}><h2>{section.title}</h2><div>{section.body}</div></section>)}</article><footer><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><Link href="/terms">Terms</Link><a href="mailto:assarasua@gmail.com">assarasua@gmail.com</a></footer></main>;
}
