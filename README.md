# MCP GSC Multi-Account

A Model Context Protocol (MCP) server for Google Search Console with **multi-account support**.

Manage multiple GSC accounts from a single MCP server. Perfect for agencies, SEO professionals, or anyone managing multiple properties.

## Features

- 🔄 **Multi-Account** - Switch between accounts dynamically
- 📊 **Search Analytics** - Up to 25,000 rows with regex filtering
- 🎯 **Quick Wins Detection** - Automatic SEO opportunity identification
- 📈 **Period Comparison** - Compare performance between time periods
- 🔍 **URL Inspection** - Check indexing status of any URL
- 📤 **URL Indexing** - Submit URLs for indexing via Indexing API
- 🗺️ **Sitemap Management** - List and submit sitemaps

## Installation

```bash
npm install mcp-gsc-multi-account
```

Or run directly:

```bash
npx mcp-gsc-multi-account
```

## Configuration

### Required Environment Variables

```bash
GOOGLE_GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_GSC_CLIENT_SECRET=your-client-secret
```

### Account Configuration

#### Option 1: Single Account (Simple)

```bash
GSC_REFRESH_TOKEN=1//your-refresh-token
GSC_EMAIL=user@gmail.com  # optional, defaults to "default"
```

#### Option 2: Multiple Accounts via JSON

```bash
GSC_ACCOUNTS_JSON='{"accounts":[{"id":"main","email":"main@gmail.com","refreshToken":"1//..."},{"id":"client1","email":"client@gmail.com","refreshToken":"1//..."}]}'
```

#### Option 3: Multiple Accounts via File

```bash
GSC_ACCOUNTS_FILE=/path/to/accounts.json
```

accounts.json format:
```json
{
  "accounts": [
    {
      "id": "main",
      "email": "main@gmail.com",
      "refreshToken": "1//..."
    },
    {
      "id": "client1",
      "email": "client@gmail.com",
      "refreshToken": "1//..."
    }
  ]
}
```

#### Option 4: Runtime Registration

Use the `register_account` tool to add accounts at runtime:

```json
{
  "tool": "register_account",
  "arguments": {
    "id": "newclient",
    "email": "newclient@gmail.com",
    "refreshToken": "1//..."
  }
}
```

## MCP Configuration

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "mcp-gsc-multi-account"],
      "env": {
        "GOOGLE_GSC_CLIENT_ID": "your-client-id",
        "GOOGLE_GSC_CLIENT_SECRET": "your-secret",
        "GSC_ACCOUNTS_FILE": "/path/to/accounts.json"
      }
    }
  }
}
```

### mcporter

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx -y mcp-gsc-multi-account",
      "env": {
        "GOOGLE_GSC_CLIENT_ID": "your-client-id",
        "GOOGLE_GSC_CLIENT_SECRET": "your-secret",
        "GSC_REFRESH_TOKEN": "1//your-token"
      }
    }
  }
}
```

## Available Tools

### Account Management

#### register_account
Register a new account at runtime.
- `id` (required): Unique identifier
- `email` (required): Google account email
- `refreshToken` (required): OAuth2 refresh token

#### list_accounts
List all registered accounts.

#### list_sites
List all sites accessible by an account.
- `account` (optional): Account ID or email

### Search Analytics

#### search_analytics
Get search performance data.
- `siteUrl` (required): Site URL (e.g., `https://example.com` or `sc-domain:example.com`)
- `startDate` (required): Start date (YYYY-MM-DD)
- `endDate` (required): End date (YYYY-MM-DD)
- `account` (optional): Account to use
- `dimensions` (optional): query, page, country, device, date
- `rowLimit` (optional): Max 25,000 rows
- `pageFilter`, `queryFilter`, `countryFilter`, `deviceFilter`
- `filterOperator`: equals, contains, includingRegex, excludingRegex

#### detect_quick_wins
Find SEO optimization opportunities - keywords ranking 4-20 with high impressions but low CTR.
- `siteUrl`, `startDate`, `endDate` (required)
- `minImpressions` (default: 100)
- `maxCtr` (default: 3.0%)
- `positionRangeMin/Max` (default: 4-20)
- `limit` (default: 50)

#### compare_periods
Compare metrics between two time periods.
- `siteUrl` (required)
- `currentStartDate`, `currentEndDate` (required)
- `previousStartDate`, `previousEndDate` (required)
- `dimensions` (optional)

### URL Management

#### inspect_url
Check URL indexing status.
- `siteUrl`, `inspectionUrl` (required)

#### submit_url_for_indexing
Submit URL for Google indexing (requires Indexing API enabled).
- `url` (required)
- `type`: URL_UPDATED (index) or URL_DELETED (remove)

### Sitemaps

#### list_sitemaps
List sitemaps for a site.
- `siteUrl` (required)

#### submit_sitemap
Submit a sitemap.
- `siteUrl`, `feedpath` (required)

## Getting OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **Search Console API** and **Indexing API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the credentials

### Getting a Refresh Token

Use the Google OAuth Playground or run:

```bash
npx -y google-search-console-mcp-server google-search-console-mcp-setup
```

## Examples

```
"List my GSC accounts"

"Show quick wins for https://example.com using the main account"

"Compare last 7 days vs previous 7 days for sc-domain:example.com"

"Submit https://example.com/new-article for indexing"

"Get top 100 queries for https://example.com from 2024-01-01 to 2024-01-31"
```

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
