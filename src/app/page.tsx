import type { Metadata } from "next";
import { Hero } from "@/components/sections/Hero";
import { Experience } from "@/components/sections/Experience";
import { Skills } from "@/components/sections/Skills";
import { Projects } from "@/components/sections/Projects";
import { About } from "@/components/sections/About";
import { Comedy } from "@/components/sections/Comedy";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: routes.home },
};

export default function Home() {
  return (
    <>
      <Hero />
      <Experience />
      <Skills />
      <Projects />
      <About />
      <Comedy />
    </>
  );
}
