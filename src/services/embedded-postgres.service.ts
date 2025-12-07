/**
 * Embedded PostgreSQL Service
 * Starts and manages a local PostgreSQL instance for offline use
 * This allows using PostgreSQL for both offline and online modes
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface EmbeddedPostgresConfig {
  dataDir: string;
  port: number;
  host: string;
  user: string;
  password: string;
  database: string;
}

class EmbeddedPostgresService {
  private postgresProcess: ChildProcess | null = null;
  private config: EmbeddedPostgresConfig;
  private isRunning: boolean = false;

  constructor() {
    // Default configuration
    this.config = {
      dataDir: path.join(os.homedir(), '.zapeera', 'postgres'),
      port: 5433, // Use 5433 to avoid conflicts with system PostgreSQL (5432)
      host: 'localhost',
      user: 'zapeera',
      password: 'zapeera_local',
      database: 'zapeera'
    };
  }

  /**
   * Check if PostgreSQL binary is available
   */
  private async checkPostgresBinary(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('postgres', ['--version']);
      process.on('close', (code) => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Initialize PostgreSQL data directory
   */
  private async initDataDirectory(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.config.dataDir)) {
        fs.mkdirSync(this.config.dataDir, { recursive: true });
        console.log('[EmbeddedPostgres] Created data directory:', this.config.dataDir);
      }

      // Check if already initialized
      const pgVersionFile = path.join(this.config.dataDir, 'PG_VERSION');
      if (fs.existsSync(pgVersionFile)) {
        console.log('[EmbeddedPostgres] Data directory already initialized');
        return true;
      }

      // Initialize database
      return new Promise((resolve) => {
        const initdb = spawn('initdb', [
          '-D', this.config.dataDir,
          '-U', this.config.user,
          '--auth-local=trust',
          '--auth-host=trust'
        ]);

        initdb.on('close', (code) => {
          if (code === 0) {
            console.log('[EmbeddedPostgres] ✅ Data directory initialized');
            resolve(true);
          } else {
            console.error('[EmbeddedPostgres] ❌ Failed to initialize data directory');
            resolve(false);
          }
        });

        initdb.on('error', (error) => {
          console.error('[EmbeddedPostgres] ❌ Initdb error:', error);
          resolve(false);
        });
      });
    } catch (error: any) {
      console.error('[EmbeddedPostgres] ❌ Error initializing data directory:', error);
      return false;
    }
  }

  /**
   * Start embedded PostgreSQL server
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.log('[EmbeddedPostgres] Already running');
      return true;
    }

    try {
      // Check if PostgreSQL is available
      const hasPostgres = await this.checkPostgresBinary();
      if (!hasPostgres) {
        console.warn('[EmbeddedPostgres] ⚠️  PostgreSQL binary not found');
        console.warn('[EmbeddedPostgres] ⚠️  Please install PostgreSQL or use SQLite instead');
        return false;
      }

      // Initialize data directory
      const initialized = await this.initDataDirectory();
      if (!initialized) {
        return false;
      }

      // Start PostgreSQL server
      this.postgresProcess = spawn('postgres', [
        '-D', this.config.dataDir,
        '-p', this.config.port.toString(),
        '-h', this.config.host,
        '-k', this.config.dataDir // Unix socket directory
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      // Handle output
      this.postgresProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('database system is ready')) {
          this.isRunning = true;
          console.log('[EmbeddedPostgres] ✅ PostgreSQL started on port', this.config.port);
        }
        console.log('[EmbeddedPostgres]', output.trim());
      });

      this.postgresProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        if (!error.includes('WARNING')) {
          console.error('[EmbeddedPostgres]', error.trim());
        }
      });

      this.postgresProcess.on('close', (code) => {
        this.isRunning = false;
        console.log('[EmbeddedPostgres] PostgreSQL stopped, code:', code);
      });

      this.postgresProcess.on('error', (error) => {
        console.error('[EmbeddedPostgres] ❌ Process error:', error);
        this.isRunning = false;
      });

      // Wait for server to be ready
      await new Promise((resolve) => setTimeout(resolve, 3000));

      return this.isRunning;
    } catch (error: any) {
      console.error('[EmbeddedPostgres] ❌ Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop embedded PostgreSQL server
   */
  async stop(): Promise<void> {
    if (this.postgresProcess) {
      this.postgresProcess.kill('SIGTERM');
      this.postgresProcess = null;
      this.isRunning = false;
      console.log('[EmbeddedPostgres] Stopped');
    }
  }

  /**
   * Get connection string
   */
  getConnectionString(): string {
    return `postgresql://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`;
  }

  /**
   * Check if PostgreSQL is running
   */
  isPostgresRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get configuration
   */
  getConfig(): EmbeddedPostgresConfig {
    return { ...this.config };
  }
}

// Singleton instance
let embeddedPostgresInstance: EmbeddedPostgresService | null = null;

export function getEmbeddedPostgresService(): EmbeddedPostgresService {
  if (!embeddedPostgresInstance) {
    embeddedPostgresInstance = new EmbeddedPostgresService();
  }
  return embeddedPostgresInstance;
}

export default getEmbeddedPostgresService;
