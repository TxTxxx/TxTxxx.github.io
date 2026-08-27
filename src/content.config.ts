import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    category: z.enum(["embodied-ai", "tech-sharing", "journal"]).optional(),
    featured_slot: z.union([z.literal(1), z.literal(2)]).optional(),
    cover_image: z.string().optional(),
    cover_fit: z.enum(["contain", "cover"]).default("contain"),
    cover_alt: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

const paperRadar = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/paper-radar" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    focus: z.string(),
    best_first: z.string(),
    paper_count: z.number().int().min(0).max(4),
    draft: z.boolean().default(false)
  })
});

const paperDeepDives = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/paper-deep-dives" }),
  schema: z.object({
    title: z.string(),
    paper_title: z.string(),
    date: z.coerce.date(),
    authors: z.string(),
    institutions: z.string(),
    venue: z.string(),
    summary: z.string(),
    reading_time: z.string(),
    paper_url: z.string().url(),
    project_url: z.string().url().optional(),
    hero_image: z.string(),
    hero_alt: z.string(),
    draft: z.boolean().default(false)
  })
});

export const collections = { blog, paperRadar, paperDeepDives };
