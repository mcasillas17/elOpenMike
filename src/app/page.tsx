import { Hero } from "@/components/sections/Hero";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";
import { About } from "@/components/sections/About";
import { Comedy } from "@/components/sections/Comedy";

export default function Home() {
  return (
    <>
      <Hero />
      <Experience />
      <Projects />
      <About />
      <Comedy />
    </>
  );
}
