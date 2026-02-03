#!/usr/bin/env node

/**
 * MCP GSC Multi-Account
 * 
 * A Model Context Protocol server for Google Search Console
 * with multi-account support.
 * 
 * Features:
 * - Multi-account management (switch between accounts dynamically)
 * - Search Analytics with up to 25,000 rows
 * - Quick Wins detection (SEO opportunities)
 * - URL Indexing submission
 * - Period comparison
 * - Sitemap management
 * 
 * Account configuration:
 * - GSC_ACCOUNTS_JSON: JSON string with accounts config
 * - GSC_ACCOUNTS_FILE: Path to JSON file with accounts config
 * - GSC_REFRESH_TOKEN + GSC_EMAIL: Single account via env vars
 * - register_account tool: Add accounts at runtime
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ErrorCode,
  McpError 
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

import { AccountManager } from './accounts.js';
import { SearchConsoleService } from './search-console.js';
import {
  SearchAnalyticsSchema,
  QuickWinsSchema,
  InspectUrlSchema,
  SubmitIndexingSchema,
  ListSitemapsSchema,
  SubmitSitemapSchema,
  ComparePeriodsSchema,
} from './schemas.js';

// Initialize account manager from environment
const accountManager = AccountManager.fromEnvironment();

// Create MCP Server
const server = new Server(
  {
    name: 'mcp-gsc-multi-account',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to get service for an account
async function getService(accountIdOrEmail?: string): Promise<{ service: SearchConsoleService; email: string }> {
  const { client, account } = await accountManager.getAuthClient(accountIdOrEmail);
  const service = new SearchConsoleService(client);
  return { service, email: account.email };
}

// Register Account Schema
const RegisterAccountSchema = z.object({
  id: z.string().describe('Unique identifier for this account'),
  email: z.string().email().describe('Google account email'),
  refreshToken: z.string().describe('OAuth2 refresh token'),
  accessToken: z.string().optional().describe('Optional current access token'),
});

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'register_account',
        description: 'Register a new Google Search Console account for use. Accounts can also be configured via GSC_ACCOUNTS_JSON or GSC_ACCOUNTS_FILE environment variables.',
        inputSchema: zodToJsonSchema(RegisterAccountSchema),
      },
      {
        name: 'list_accounts',
        description: 'List all registered Google Search Console accounts',
        inputSchema: zodToJsonSchema(z.object({})),
      },
      {
        name: 'list_sites',
        description: 'List all sites accessible by an account',
        inputSchema: zodToJsonSchema(z.object({
          account: z.string().optional().describe('Account ID or email (uses first account if not specified)'),
        })),
      },
      {
        name: 'search_analytics',
        description: 'Get search performance data with up to 25,000 rows, regex filters, and flexible date ranges',
        inputSchema: zodToJsonSchema(SearchAnalyticsSchema),
      },
      {
        name: 'detect_quick_wins',
        description: 'Automatically detect SEO quick wins - keywords with high impressions but low CTR in positions 4-20',
        inputSchema: zodToJsonSchema(QuickWinsSchema),
      },
      {
        name: 'compare_periods',
        description: 'Compare search performance between two time periods',
        inputSchema: zodToJsonSchema(ComparePeriodsSchema),
      },
      {
        name: 'inspect_url',
        description: 'Inspect URL indexing status in Google Search Console',
        inputSchema: zodToJsonSchema(InspectUrlSchema),
      },
      {
        name: 'submit_url_for_indexing',
        description: 'Submit a URL to Google for indexing or request removal (uses Indexing API)',
        inputSchema: zodToJsonSchema(SubmitIndexingSchema),
      },
      {
        name: 'list_sitemaps',
        description: 'List all sitemaps for a site',
        inputSchema: zodToJsonSchema(ListSitemapsSchema),
      },
      {
        name: 'submit_sitemap',
        description: 'Submit a sitemap to Google Search Console',
        inputSchema: zodToJsonSchema(SubmitSitemapSchema),
      },
    ],
  };
});

// Call Tool Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'register_account': {
        const params = RegisterAccountSchema.parse(args);
        accountManager.registerAccount(
          params.id,
          params.email,
          params.refreshToken,
          params.accessToken
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Account ${params.id} (${params.email}) registered successfully`,
              totalAccounts: accountManager.count,
            }, null, 2),
          }],
        };
      }

      case 'list_accounts': {
        const accounts = accountManager.listAccounts();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              accounts,
              totalAccounts: accounts.length,
            }, null, 2),
          }],
        };
      }

      case 'list_sites': {
        const { account } = args as { account?: string };
        const { service, email } = await getService(account);
        const result = await service.listSites();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: email,
              sites: result.data.siteEntry || [],
              totalSites: result.data.siteEntry?.length || 0,
            }, null, 2),
          }],
        };
      }

      case 'search_analytics': {
        const params = SearchAnalyticsSchema.parse(args);
        const { service, email } = await getService(params.account);

        // Build request
        const requestBody: any = {
          startDate: params.startDate,
          endDate: params.endDate,
          dimensions: params.dimensions,
          searchType: params.type,
          aggregationType: params.aggregationType,
          rowLimit: params.rowLimit,
          startRow: params.startRow,
          dataState: params.dataState,
        };

        // Build filters
        const filters: any[] = [];
        if (params.pageFilter) {
          filters.push({
            dimension: 'page',
            operator: params.filterOperator || 'contains',
            expression: params.pageFilter,
          });
        }
        if (params.queryFilter) {
          filters.push({
            dimension: 'query',
            operator: params.filterOperator || 'contains',
            expression: params.queryFilter,
          });
        }
        if (params.countryFilter) {
          filters.push({
            dimension: 'country',
            operator: 'equals',
            expression: params.countryFilter,
          });
        }
        if (params.deviceFilter) {
          filters.push({
            dimension: 'device',
            operator: 'equals',
            expression: params.deviceFilter,
          });
        }

        if (filters.length > 0) {
          requestBody.dimensionFilterGroups = [{ groupType: 'and', filters }];
        }

        const result = await service.searchAnalytics(params.siteUrl, requestBody);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: email,
              siteUrl: params.siteUrl,
              dateRange: { start: params.startDate, end: params.endDate },
              rowCount: result.data.rows?.length || 0,
              data: result.data,
            }, null, 2),
          }],
        };
      }

      case 'detect_quick_wins': {
        const params = QuickWinsSchema.parse(args);
        const { service, email } = await getService(params.account);

        const quickWins = await service.detectQuickWins(
          params.siteUrl,
          params.startDate,
          params.endDate,
          {
            minImpressions: params.minImpressions,
            maxCtr: params.maxCtr,
            positionRangeMin: params.positionRangeMin,
            positionRangeMax: params.positionRangeMax,
            limit: params.limit,
          }
        );

        const totalAdditionalClicks = quickWins.reduce((sum, qw) => sum + qw.additionalClicks, 0);
        const highOpportunities = quickWins.filter(qw => qw.opportunity === 'High').length;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: email,
              siteUrl: params.siteUrl,
              dateRange: { start: params.startDate, end: params.endDate },
              thresholds: {
                minImpressions: params.minImpressions,
                maxCtr: params.maxCtr,
                positionRange: `${params.positionRangeMin}-${params.positionRangeMax}`,
              },
              summary: {
                totalQuickWins: quickWins.length,
                highOpportunities,
                potentialAdditionalClicks: totalAdditionalClicks,
              },
              quickWins,
            }, null, 2),
          }],
        };
      }

      case 'compare_periods': {
        const params = ComparePeriodsSchema.parse(args);
        const { service, email } = await getService(params.account);

        const result = await service.comparePeriods(
          params.siteUrl,
          params.currentStartDate,
          params.currentEndDate,
          params.previousStartDate,
          params.previousEndDate,
          params.dimensions,
          params.rowLimit
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: email,
              siteUrl: params.siteUrl,
              ...result,
            }, null, 2),
          }],
        };
      }

      case 'inspect_url': {
        const params = InspectUrlSchema.parse(args);
        const { service, email } = await getService(params.account);

        const result = await service.inspectUrl(
          params.siteUrl,
          params.inspectionUrl,
          params.languageCode
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: email,
              inspectedUrl: params.inspectionUrl,
              result: result.data,
            }, null, 2),
          }],
        };
      }

      case 'submit_url_for_indexing': {
        const params = SubmitIndexingSchema.parse(args);
        const { service, email } = await getService(params.account);

        try {
          const result = await service.submitUrlForIndexing(params.url, params.type);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                account: email,
                url: params.url,
                type: params.type,
                notifyTime: new Date().toISOString(),
                message: params.type === 'URL_UPDATED'
                  ? 'Successfully submitted URL for indexing. Google will crawl this URL soon.'
                  : 'Successfully requested URL removal from index.',
                response: result.data,
              }, null, 2),
            }],
          };
        } catch (error: any) {
          if (error.code === 403) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Indexing API not enabled or insufficient permissions',
                  suggestion: 'Enable the Indexing API in Google Cloud Console and ensure your OAuth has the indexing scope.',
                  url: params.url,
                }, null, 2),
              }],
            };
          }
          throw error;
        }
      }

      case 'list_sitemaps': {
        const params = ListSitemapsSchema.parse(args);
        const { service, email } = await getService(params.account);

        const result = await service.listSitemaps(params.siteUrl);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: email,
              siteUrl: params.siteUrl,
              sitemaps: result.data.sitemap || [],
            }, null, 2),
          }],
        };
      }

      case 'submit_sitemap': {
        const params = SubmitSitemapSchema.parse(args);
        const { service, email } = await getService(params.account);

        await service.submitSitemap(params.siteUrl, params.feedpath);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              account: email,
              siteUrl: params.siteUrl,
              sitemap: params.feedpath,
              message: 'Sitemap submitted successfully',
            }, null, 2),
          }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    throw error;
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP GSC Multi-Account Server running on stdio');
  console.error(`Accounts loaded: ${accountManager.count}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
