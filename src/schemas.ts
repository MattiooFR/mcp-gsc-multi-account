import { z } from 'zod';

// Base schema with account selection
export const AccountSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Google account email to use. If not specified, will use the first available account.'),
});

// GSC Base Schema with site URL
export const GSCBaseSchema = AccountSchema.extend({
  siteUrl: z
    .string()
    .describe(
      'The site URL as defined in Search Console. Example: sc-domain:example.com or https://www.example.com/'
    ),
});

// Search Analytics Schema
export const SearchAnalyticsSchema = GSCBaseSchema.extend({
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format'),
  dimensions: z
    .string()
    .transform((val) => val.split(',').map(d => d.trim()))
    .refine((val) =>
      val.every((d) => ['query', 'page', 'country', 'device', 'searchAppearance', 'date'].includes(d))
    )
    .optional()
    .describe('Comma-separated dimensions: query, page, country, device, searchAppearance, date'),
  type: z
    .enum(['web', 'image', 'video', 'news', 'discover', 'googleNews'])
    .optional()
    .describe('Search type filter'),
  aggregationType: z
    .enum(['auto', 'byNewsShowcasePanel', 'byProperty', 'byPage'])
    .optional()
    .describe('Aggregation type'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .default(1000)
    .describe('Maximum rows to return (up to 25,000)'),
  startRow: z
    .number()
    .min(0)
    .optional()
    .describe('Starting row for pagination'),
  dataState: z
    .enum(['all', 'final'])
    .default('all')
    .describe('Data freshness: "all" for latest data, "final" for finalized data'),
  pageFilter: z.string().optional().describe('Filter by page URL'),
  queryFilter: z.string().optional().describe('Filter by search query'),
  countryFilter: z.string().optional().describe('Filter by country (ISO 3166-1 alpha-3)'),
  deviceFilter: z.enum(['DESKTOP', 'MOBILE', 'TABLET']).optional().describe('Filter by device'),
  filterOperator: z
    .enum(['equals', 'contains', 'notEquals', 'notContains', 'includingRegex', 'excludingRegex'])
    .default('contains')
    .optional()
    .describe('Operator for filters'),
});

// Quick Wins Detection Schema
export const QuickWinsSchema = GSCBaseSchema.extend({
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format'),
  minImpressions: z.number().default(100).describe('Minimum impressions threshold'),
  maxCtr: z.number().default(3.0).describe('Maximum CTR percentage'),
  positionRangeMin: z.number().default(4).describe('Minimum position (default: 4)'),
  positionRangeMax: z.number().default(20).describe('Maximum position (default: 20)'),
  limit: z.number().default(50).describe('Maximum quick wins to return'),
});

// URL Inspection Schema
export const InspectUrlSchema = GSCBaseSchema.extend({
  inspectionUrl: z.string().describe('The URL to inspect'),
  languageCode: z.string().default('en-US').optional().describe('Language code for messages'),
});

// Submit URL for Indexing Schema
export const SubmitIndexingSchema = AccountSchema.extend({
  url: z.string().describe('The full URL to submit for indexing'),
  type: z
    .enum(['URL_UPDATED', 'URL_DELETED'])
    .default('URL_UPDATED')
    .describe('URL_UPDATED to request indexing, URL_DELETED to request removal'),
});

// Sitemap Schemas
export const ListSitemapsSchema = GSCBaseSchema;

export const SubmitSitemapSchema = GSCBaseSchema.extend({
  feedpath: z.string().describe('The URL of the sitemap to submit'),
});

// Compare Periods Schema
export const ComparePeriodsSchema = GSCBaseSchema.extend({
  currentStartDate: z.string().describe('Current period start date (YYYY-MM-DD)'),
  currentEndDate: z.string().describe('Current period end date (YYYY-MM-DD)'),
  previousStartDate: z.string().describe('Previous period start date (YYYY-MM-DD)'),
  previousEndDate: z.string().describe('Previous period end date (YYYY-MM-DD)'),
  dimensions: z
    .string()
    .transform((val) => val.split(',').map(d => d.trim()))
    .optional()
    .describe('Dimensions to compare by'),
  rowLimit: z.number().default(100).describe('Maximum rows to return'),
});

// Export types
export type SearchAnalytics = z.infer<typeof SearchAnalyticsSchema>;
export type QuickWins = z.infer<typeof QuickWinsSchema>;
export type InspectUrl = z.infer<typeof InspectUrlSchema>;
export type SubmitIndexing = z.infer<typeof SubmitIndexingSchema>;
export type ComparePeriods = z.infer<typeof ComparePeriodsSchema>;
