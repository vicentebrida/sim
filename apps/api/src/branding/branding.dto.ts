import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BRANDING_ASSETS } from '../database/schema';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use the #rrggbb format');

export const AssetKindSchema = z.enum(BRANDING_ASSETS);

export class BrandingDto extends createZodDto(
  z.object({
    name: z.string(),
    // `#rrggbb`, or null for the default color.
    primaryColor: z.string().nullable(),
    loginTitle: z.string(),
    loginText: z.string(),
    // Image URLs (they change when the image does), or null when not set.
    logoLight: z.string().nullable(),
    logoDark: z.string().nullable(),
    favicon: z.string().nullable(),
    loginImage: z.string().nullable(),
  }),
) {}

export class BrandingUpdateDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(40).optional(),
    primaryColor: color.nullable().optional(),
    loginTitle: z.string().trim().max(80).optional(),
    loginText: z.string().trim().max(500).optional(),
  }),
) {}
