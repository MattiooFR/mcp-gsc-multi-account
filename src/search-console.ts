/**
 * Google Search Console Service
 * Handles all GSC API interactions with OAuth2 authentication
 */

import { google, searchconsole_v1, webmasters_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

type SearchAnalyticsRequest = webmasters_v3.Params$Resource$Searchanalytics$Query['requestBody'];

export interface QuickWin {
  query: string;
  page: string;
  currentPosition: number;
  impressions: number;
  currentClicks: number;
  currentCtr: number;
  potentialClicks: number;
  additionalClicks: number;
  opportunity: 'High' | 'Medium' | 'Low';
  optimizationNote: string;
}

export class SearchConsoleService {
  private authClient: OAuth2Client;

  constructor(authClient: OAuth2Client) {
    this.authClient = authClient;
  }

  private getWebmasters() {
    return google.webmasters({
      version: 'v3',
      auth: this.authClient,
    });
  }

  private getSearchConsole() {
    return google.searchconsole({
      version: 'v1',
      auth: this.authClient,
    });
  }

  private getIndexing() {
    return google.indexing({
      version: 'v3',
      auth: this.authClient,
    });
  }

  /**
   * Normalize URL to handle different formats
   */
  private normalizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        return `sc-domain:${parsedUrl.hostname}`;
      }
    } catch {
      // Already in sc-domain format or invalid
    }
    return url;
  }

  /**
   * Handle permission errors by trying sc-domain format
   */
  private async handlePermissionError<T>(
    operation: () => Promise<T>,
    fallbackOperation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
        return await fallbackOperation();
      }
      throw err;
    }
  }

  /**
   * List all sites the account has access to
   */
  async listSites() {
    const webmasters = this.getWebmasters();
    return webmasters.sites.list();
  }

  /**
   * Search Analytics Query
   */
  async searchAnalytics(siteUrl: string, requestBody: SearchAnalyticsRequest) {
    const webmasters = this.getWebmasters();
    return this.handlePermissionError(
      () => webmasters.searchanalytics.query({ siteUrl, requestBody }),
      () => webmasters.searchanalytics.query({ 
        siteUrl: this.normalizeUrl(siteUrl), 
        requestBody 
      })
    );
  }

  /**
   * Detect Quick Wins - Keywords with high impressions but low CTR in positions 4-20
   */
  async detectQuickWins(
    siteUrl: string,
    startDate: string,
    endDate: string,
    thresholds: {
      minImpressions: number;
      maxCtr: number;
      positionRangeMin: number;
      positionRangeMax: number;
      limit: number;
    }
  ): Promise<QuickWin[]> {
    const result = await this.searchAnalytics(siteUrl, {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 25000,
      dataState: 'all',
    });

    const rows = result.data.rows || [];
    
    const quickWins = rows
      .filter(row => {
        const impressions = row.impressions || 0;
        const ctr = (row.ctr || 0) * 100;
        const position = row.position || 0;

        return (
          impressions >= thresholds.minImpressions &&
          ctr <= thresholds.maxCtr &&
          position >= thresholds.positionRangeMin &&
          position <= thresholds.positionRangeMax
        );
      })
      .map(row => {
        const impressions = row.impressions || 0;
        const currentClicks = row.clicks || 0;
        const currentCtr = (row.ctr || 0) * 100;
        const position = row.position || 0;

        // Calculate potential with improved CTR based on position
        const targetCtr = position <= 5 ? 8 : position <= 10 ? 5 : 3;
        const potentialClicks = Math.round((impressions * targetCtr) / 100);
        const additionalClicks = Math.max(0, potentialClicks - currentClicks);

        // Determine opportunity level
        let opportunity: 'High' | 'Medium' | 'Low';
        if (additionalClicks >= 100) opportunity = 'High';
        else if (additionalClicks >= 30) opportunity = 'Medium';
        else opportunity = 'Low';

        return {
          query: row.keys?.[0] || 'N/A',
          page: row.keys?.[1] || 'N/A',
          currentPosition: Number(position.toFixed(1)),
          impressions,
          currentClicks,
          currentCtr: Number(currentCtr.toFixed(2)),
          potentialClicks,
          additionalClicks,
          opportunity,
          optimizationNote: `Position ${position.toFixed(1)} → Target top 3 for ${targetCtr}% CTR`,
        };
      })
      .sort((a, b) => b.additionalClicks - a.additionalClicks)
      .slice(0, thresholds.limit);

    return quickWins;
  }

  /**
   * URL Inspection
   */
  async inspectUrl(siteUrl: string, inspectionUrl: string, languageCode: string = 'en-US') {
    const searchConsole = this.getSearchConsole();
    return searchConsole.urlInspection.index.inspect({
      requestBody: {
        siteUrl,
        inspectionUrl,
        languageCode,
      },
    });
  }

  /**
   * Submit URL for Indexing (Indexing API)
   */
  async submitUrlForIndexing(url: string, type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED') {
    const indexing = this.getIndexing();
    return indexing.urlNotifications.publish({
      requestBody: {
        url,
        type,
      },
    });
  }

  /**
   * List Sitemaps
   */
  async listSitemaps(siteUrl: string) {
    const webmasters = this.getWebmasters();
    return this.handlePermissionError(
      () => webmasters.sitemaps.list({ siteUrl }),
      () => webmasters.sitemaps.list({ siteUrl: this.normalizeUrl(siteUrl) })
    );
  }

  /**
   * Submit Sitemap
   */
  async submitSitemap(siteUrl: string, feedpath: string) {
    const webmasters = this.getWebmasters();
    return this.handlePermissionError(
      () => webmasters.sitemaps.submit({ siteUrl, feedpath }),
      () => webmasters.sitemaps.submit({ 
        siteUrl: this.normalizeUrl(siteUrl), 
        feedpath 
      })
    );
  }

  /**
   * Compare two time periods
   */
  async comparePeriods(
    siteUrl: string,
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string,
    dimensions: string[] = ['query'],
    rowLimit: number = 100
  ) {
    const [current, previous] = await Promise.all([
      this.searchAnalytics(siteUrl, {
        startDate: currentStart,
        endDate: currentEnd,
        dimensions,
        rowLimit,
        dataState: 'all',
      }),
      this.searchAnalytics(siteUrl, {
        startDate: previousStart,
        endDate: previousEnd,
        dimensions,
        rowLimit,
        dataState: 'all',
      }),
    ]);

    const currentRows = current.data.rows || [];
    const previousRows = previous.data.rows || [];

    // Create lookup for previous period
    const previousLookup = new Map(
      previousRows.map(row => [row.keys?.join('|'), row])
    );

    // Compare and calculate changes
    const comparison = currentRows.map(currentRow => {
      const key = currentRow.keys?.join('|');
      const previousRow = previousLookup.get(key || '');

      const currentClicks = currentRow.clicks || 0;
      const previousClicks = previousRow?.clicks || 0;
      const currentImpressions = currentRow.impressions || 0;
      const previousImpressions = previousRow?.impressions || 0;
      const currentPosition = currentRow.position || 0;
      const previousPosition = previousRow?.position || 0;
      const currentCtr = (currentRow.ctr || 0) * 100;
      const previousCtr = (previousRow?.ctr || 0) * 100;

      return {
        keys: currentRow.keys,
        current: {
          clicks: currentClicks,
          impressions: currentImpressions,
          position: Number(currentPosition.toFixed(1)),
          ctr: Number(currentCtr.toFixed(2)),
        },
        previous: {
          clicks: previousClicks,
          impressions: previousImpressions,
          position: Number(previousPosition.toFixed(1)),
          ctr: Number(previousCtr.toFixed(2)),
        },
        change: {
          clicks: currentClicks - previousClicks,
          clicksPercent: previousClicks > 0 
            ? Number((((currentClicks - previousClicks) / previousClicks) * 100).toFixed(1))
            : null,
          impressions: currentImpressions - previousImpressions,
          position: Number((previousPosition - currentPosition).toFixed(1)), // Positive = improved
          ctr: Number((currentCtr - previousCtr).toFixed(2)),
        },
      };
    });

    // Sort by biggest click gains
    comparison.sort((a, b) => b.change.clicks - a.change.clicks);

    // Calculate totals
    const currentTotals = currentRows.reduce(
      (acc, row) => ({
        clicks: (acc.clicks || 0) + (row.clicks || 0),
        impressions: (acc.impressions || 0) + (row.impressions || 0),
      }),
      { clicks: 0, impressions: 0 }
    );

    const previousTotals = previousRows.reduce(
      (acc, row) => ({
        clicks: (acc.clicks || 0) + (row.clicks || 0),
        impressions: (acc.impressions || 0) + (row.impressions || 0),
      }),
      { clicks: 0, impressions: 0 }
    );

    const currClicks = currentTotals.clicks || 0;
    const prevClicks = previousTotals.clicks || 0;
    const currImpressions = currentTotals.impressions || 0;
    const prevImpressions = previousTotals.impressions || 0;

    return {
      comparison,
      summary: {
        currentPeriod: { start: currentStart, end: currentEnd, clicks: currClicks, impressions: currImpressions },
        previousPeriod: { start: previousStart, end: previousEnd, clicks: prevClicks, impressions: prevImpressions },
        change: {
          clicks: currClicks - prevClicks,
          clicksPercent: prevClicks > 0
            ? Number((((currClicks - prevClicks) / prevClicks) * 100).toFixed(1))
            : null,
          impressions: currImpressions - prevImpressions,
        },
      },
    };
  }
}
