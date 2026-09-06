import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Exclude local samples before Markdown image imports can enter a public build.
const paperPattern = process.env.PAPER_RADAR_PREVIEW === "1"
  ? "**/*.md"
  : ["**/*.md", "!**/*-preview.md"];

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
  loader: glob({ pattern: paperPattern, base: "./src/content/paper-radar" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    focus: z.string(),
    best_first: z.string(),
    paper_count: z.number().int().min(0).max(4),
    papers: z.array(z.object({
      title: z.string(),
      short_title: z.string().optional(),
      url: z.string().url(),
      summary: z.string().max(240),
      tags: z.array(z.string()).max(2).default([]),
      publication: z.string().optional(),
      code_url: z.string().url().optional(),
      guide_url: z.string().regex(/^\/papers\/deep-dive\/[a-z0-9-]+\/$/).optional(),
      note: z.string().optional(),
      reading_status: z.enum(["收藏", "初读", "在读", "精读"]).optional()
    })).max(4).optional(),
    draft: z.boolean().default(false)
  })
});

const paperDeepDives = defineCollection({
  loader: glob({ pattern: paperPattern, base: "./src/content/paper-deep-dives" }),
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
