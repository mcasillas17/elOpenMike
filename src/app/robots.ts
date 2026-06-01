import type { MetadataRoute } from "next";
import { absoluteUrl, routes } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absoluteUrl(routes.sitemap),
  };
}
