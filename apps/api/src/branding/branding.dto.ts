import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BRANDING_ASSETS, CUSTOM_TEXTS, type CustomTextKey } from '../database/schema';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use the #rrggbb format');

export const AssetKindSchema = z.enum(BRANDING_ASSETS);

// Plain text: the web app never renders it as HTML. Null shows the default.
const shown = z.object({ 'pt-BR': z.string().nullable(), en: z.string().nullable() });
const TextsSchema = z.object(
  Object.fromEntries(Object.keys(CUSTOM_TEXTS).map((key) => [key, shown])) as Record<
    CustomTextKey,
    typeof shown
  >,
);
// Only the texts sent change; an empty one goes back to the default.
const edited = (max: number) => {
  const text = z.string().trim().max(max).optional();
  return z.object({ 'pt-BR': text, en: text }).optional();
};
const TextsUpdateSchema = z.object({
  homeTitle: edited(CUSTOM_TEXTS.homeTitle),
  homeSubtitle: edited(CUSTOM_TEXTS.homeSubtitle),
  newIdeaButton: edited(CUSTOM_TEXTS.newIdeaButton),
  newIdeaGuidance: edited(CUSTOM_TEXTS.newIdeaGuidance),
  titleHelp: edited(CUSTOM_TEXTS.titleHelp),
  similarTitle: edited(CUSTOM_TEXTS.similarTitle),
  similarHelp: edited(CUSTOM_TEXTS.similarHelp),
}) satisfies z.ZodType<Partial<Record<CustomTextKey, unknown>>>;

export class BrandingDto extends createZodDto(
  z.object({
    name: z.string(),
    // `#rrggbb`, or null for the default color.
    primaryColor: z.string().nullable(),
    loginTitle: z.string(),
    loginText: z.string(),
    // Replaced interface texts by language; null shows the default.
    texts: TextsSchema,
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
    texts: TextsUpdateSchema.optional(),
  }),
) {}
