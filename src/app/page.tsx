import type { Metadata } from "next";
import { Hero } from "@/components/sections/Hero";
import { Experience } from "@/components/sections/Experience";
import { Skills } from "@/components/sections/Skills";
import { Projects } from "@/components/sections/Projects";
import { HowIWork } from "@/components/sections/HowIWork";
import { Writing } from "@/components/sections/Writing";
import { About } from "@/components/sections/About";
import { Comedy } from "@/components/sections/Comedy";
import { Contact } from "@/components/sections/Contact";
import { routes, metadataFor, site } from "@/lib/site";

export const metadata: Metadata = {
  ...metadataFor(routes.home, site.title, site.description),
  title: { absolute: site.title },
};

export default function Home() {
  return (
    <>
      <Hero />
      <Projects />
      <Experience />
      <HowIWork />
      <Skills />
      <Writing />
      <About />
      <Comedy />
      <Contact />
    </>
  );
}
