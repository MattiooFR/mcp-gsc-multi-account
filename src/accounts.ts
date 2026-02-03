/**
 * Multi-Account Manager for Google Search Console
 * 
 * Accounts can be configured via:
 * 1. Environment variables (GSC_ACCOUNTS_JSON)
 * 2. Config file path (GSC_ACCOUNTS_FILE)
 * 3. Runtime registration via tool
 * 
 * Account format:
 * {
 *   "accounts": [
 *     {
 *       "id": "main",
 *       "email": "user@gmail.com",
 *       "refreshToken": "1//...",
 *       "accessToken": "ya29...",  // optional, will be refreshed
 *     }
 *   ]
 * }
 */

import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';

export interface GSCAccount {
  id: string;
  email: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

export interface AccountsConfig {
  clientId: string;
  clientSecret: string;
  accounts: GSCAccount[];
}

export class AccountManager {
  private accounts: Map<string, GSCAccount> = new Map();
  private authClients: Map<string, OAuth2Client> = new Map();
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Load accounts from environment or file
   */
  static fromEnvironment(): AccountManager {
    const clientId = process.env.GOOGLE_GSC_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GSC_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_GSC_CLIENT_ID and GOOGLE_GSC_CLIENT_SECRET are required');
    }

    const manager = new AccountManager(clientId, clientSecret);

    // Try loading from JSON env var
    const accountsJson = process.env.GSC_ACCOUNTS_JSON;
    if (accountsJson) {
      try {
        const config = JSON.parse(accountsJson);
        for (const account of config.accounts || []) {
          manager.addAccount(account);
        }
      } catch (e) {
        console.error('Failed to parse GSC_ACCOUNTS_JSON:', e);
      }
    }

    // Try loading from file
    const accountsFile = process.env.GSC_ACCOUNTS_FILE;
    if (accountsFile && fs.existsSync(accountsFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(accountsFile, 'utf-8'));
        for (const account of config.accounts || []) {
          manager.addAccount(account);
        }
      } catch (e) {
        console.error('Failed to load GSC_ACCOUNTS_FILE:', e);
      }
    }

    // Try loading individual account from env
    const singleRefreshToken = process.env.GSC_REFRESH_TOKEN;
    const singleEmail = process.env.GSC_EMAIL || 'default';
    if (singleRefreshToken) {
      manager.addAccount({
        id: 'default',
        email: singleEmail,
        refreshToken: singleRefreshToken,
        accessToken: process.env.GSC_ACCESS_TOKEN,
      });
    }

    return manager;
  }

  /**
   * Add or update an account
   */
  addAccount(account: GSCAccount): void {
    this.accounts.set(account.id, account);
    // Also index by email for convenience
    this.accounts.set(account.email.toLowerCase(), account);
    // Clear cached auth client
    this.authClients.delete(account.id);
    this.authClients.delete(account.email.toLowerCase());
  }

  /**
   * Register an account at runtime (via MCP tool)
   */
  registerAccount(id: string, email: string, refreshToken: string, accessToken?: string): void {
    this.addAccount({ id, email, refreshToken, accessToken });
  }

  /**
   * List all registered accounts
   */
  listAccounts(): { id: string; email: string }[] {
    const seen = new Set<string>();
    const result: { id: string; email: string }[] = [];
    
    for (const [key, account] of this.accounts) {
      if (!seen.has(account.id)) {
        seen.add(account.id);
        result.push({ id: account.id, email: account.email });
      }
    }
    
    return result;
  }

  /**
   * Get account by ID or email
   */
  getAccount(idOrEmail: string): GSCAccount | undefined {
    return this.accounts.get(idOrEmail) || this.accounts.get(idOrEmail.toLowerCase());
  }

  /**
   * Get OAuth2Client for an account
   */
  async getAuthClient(idOrEmail?: string): Promise<{ client: OAuth2Client; account: GSCAccount }> {
    // Get account (use first if not specified)
    let account: GSCAccount | undefined;
    
    if (idOrEmail) {
      account = this.getAccount(idOrEmail);
      if (!account) {
        throw new Error(`Account not found: ${idOrEmail}`);
      }
    } else {
      // Use first available account
      const accounts = this.listAccounts();
      if (accounts.length === 0) {
        throw new Error('No accounts configured. Use register_account or set GSC_ACCOUNTS_JSON/GSC_ACCOUNTS_FILE');
      }
      account = this.getAccount(accounts[0].id)!;
    }

    // Check cache
    const cacheKey = account.id;
    let client = this.authClients.get(cacheKey);

    if (!client) {
      client = new OAuth2Client(this.clientId, this.clientSecret, 'http://localhost');
      
      client.setCredentials({
        refresh_token: account.refreshToken,
        access_token: account.accessToken,
      });

      // Auto-refresh handler
      client.on('tokens', (tokens) => {
        if (tokens.access_token) {
          account!.accessToken = tokens.access_token;
          if (tokens.expiry_date) {
            account!.expiresAt = tokens.expiry_date;
          }
        }
      });

      this.authClients.set(cacheKey, client);
    }

    // Ensure we have a valid token
    const tokens = client.credentials;
    const now = Date.now();
    const expiresAt = tokens.expiry_date || account.expiresAt || 0;
    
    if (!tokens.access_token || expiresAt < now + 60000) {
      // Refresh token
      try {
        const { credentials } = await client.refreshAccessToken();
        client.setCredentials(credentials);
        account.accessToken = credentials.access_token || undefined;
        account.expiresAt = credentials.expiry_date || undefined;
      } catch (e) {
        throw new Error(`Failed to refresh token for ${account.email}: ${e}`);
      }
    }

    return { client, account };
  }

  /**
   * Get total number of unique accounts
   */
  get count(): number {
    return this.listAccounts().length;
  }
}
