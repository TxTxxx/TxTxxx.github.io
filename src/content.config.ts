import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    featured_slot: z.union([z.literal(1), z.literal(2)]).optional(),
    cover_image: z.string().optional(),
    cover_alt: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

export const collections = { blog };
