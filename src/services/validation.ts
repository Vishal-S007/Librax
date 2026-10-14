import { z } from 'zod';
import { isValidIsbn, normalizeIsbn } from '@/lib/isbn';

const currentYear = new Date().getFullYear();

/** Authors: semicolon-separated when a semicolon is present, so "Doe, Jane; Roe, Rick" keeps surname-first names intact. */
const authorList = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(v.includes(';') ? ';' : ',')).map((s) => s.trim()).filter(Boolean));

const csvList = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(/[;,]/)).map((s) => s.trim()).filter(Boolean));

export const bookInputSchema = z.object({
  isbn: z
    .string()
    .trim()
    .min(1, 'ISBN is required')
    .refine(isValidIsbn, 'Enter a valid ISBN-10 or ISBN-13 (checksum failed)')
    .transform(normalizeIsbn),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep the title under 200 characters'),
  subtitle: z.string().trim().max(200).optional().transform((v) => v || undefined),
  authors: authorList.refine((a) => a.length > 0, 'Add at least one author'),
  publisher: z.string().trim().min(1, 'Publisher is required').max(120),
  publicationYear: z.coerce
    .number({ invalid_type_error: 'Enter a year' })
    .int('Enter a whole year')
    .min(1450, 'Year looks too early')
    .max(currentYear + 1, `Year cannot be after ${currentYear + 1}`),
  category: z.string().trim().min(1, 'Choose or type a category').max(60),
  description: z.string().trim().max(4000, 'Description is too long').default(''),
  language: z.string().trim().min(1, 'Language is required').max(40),
  edition: z.string().trim().max(40).optional().transform((v) => v || undefined),
  pageCount: z.coerce.number({ invalid_type_error: 'Enter a number' }).int().min(1, 'At least 1 page').max(20000),
  coverUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || /^(https?:\/\/|data:image\/|\/)/i.test(v), 'Use an http(s) URL or a site-relative path'),
  tags: csvList.default([]),
  featured: z.boolean().optional(),
});
export type BookInput = z.output<typeof bookInputSchema>;
export type BookFormValues = z.input<typeof bookInputSchema>;

const phoneRe = /^[+()\-\s\d]{7,20}$/;

export const memberInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(100),
  email: z.string().trim().toLowerCase().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || phoneRe.test(v), 'Enter a valid phone number'),
  type: z.enum(['student', 'faculty', 'staff'], { errorMap: () => ({ message: 'Choose a membership type' }) }),
  department: z.string().trim().min(1, 'Department is required').max(80),
  borrowLimit: z
    .union([z.literal(''), z.coerce.number().int().min(1, 'At least 1').max(100, 'At most 100')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
});
export type MemberInput = z.output<typeof memberInputSchema>;
export type MemberFormValues = z.input<typeof memberInputSchema>;

export const copyInputSchema = z.object({
  barcode: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || /^[A-Za-z0-9-]{3,40}$/.test(v), 'Letters, digits and dashes only'),
  shelfLocation: z.string().trim().min(1, 'Shelf location is required').max(40),
  condition: z.enum(['new', 'good', 'fair', 'worn', 'poor']),
  acquiredAt: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), 'Pick a valid date'),
  notes: z.string().trim().max(500).optional().transform((v) => v || undefined),
});
export type CopyInput = z.output<typeof copyInputSchema>;
export type CopyFormValues = z.input<typeof copyInputSchema>;
