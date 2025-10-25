// Main thread interface for SQLite Web Worker

export interface WorkerMessage {
  id: number;
  type: 'init' | 'exec' | 'query' | 'close' | 'export';
  sql?: string;
  params?: any[];
}

export interface WorkerResponse {
  id: number;
  type: 'success' | 'error';
  data?: any;
  error?: string;
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
};

/**
 * Helper functions for OPFS operations
 */
export async function clearOPFS(): Promise<void> {
  const opfsRoot = await navigator.storage.getDirectory();
  // @ts-ignore - entries() exists on FileSystemDirectoryHandle
  for await (const [name, handle] of opfsRoot.entries()) {
    await opfsRoot.removeEntry(name, { recursive: true });
  }
  console.log('Cleared OPFS');
}

export async function writeToOPFS(filename: string, data: Uint8Array): Promise<void> {
  const opfsRoot = await navigator.storage.getDirectory();
  const fileHandle = await opfsRoot.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Uint8Array(data));
  await writable.close();
  console.log(`Wrote ${data.length} bytes to OPFS: ${filename}`);
}

export async function checkFileInOPFS(filename: string): Promise<boolean> {
  try {
    const opfsRoot = await navigator.storage.getDirectory();
    await opfsRoot.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}

export class SQLiteWorker {
  private worker: Worker;
  private messageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private initialized = false;

  constructor() {
    this.worker = new Worker(
      new URL('./sqlite.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, type, data, error } = event.data;
      const pending = this.pendingRequests.get(id);

      if (!pending) {
        console.warn(`Received response for unknown request ID: ${id}`);
        return;
      }

      this.pendingRequests.delete(id);

      if (type === 'error') {
        pending.reject(new Error(error || 'Unknown error'));
      } else {
        pending.resolve(data);
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      // Reject all pending requests
      this.pendingRequests.forEach((pending) => {
        pending.reject(new Error('Worker error: ' + error.message));
      });
      this.pendingRequests.clear();
    };
  }

  private sendMessage(type: WorkerMessage['type'], sql?: string, params?: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.pendingRequests.set(id, { resolve, reject });

      const message: WorkerMessage = { id, type, sql, params };
      this.worker.postMessage(message);
    });
  }

  /**
   * Initialize the SQLite database
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.sendMessage('init');
    this.initialized = true;
  }

  /**
   * Execute SQL statement without returning results (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  async exec(sql: string, params?: any[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
    await this.sendMessage('exec', sql, params);
  }

  /**
   * Execute SQL query and return results (SELECT)
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return await this.sendMessage('query', sql, params);
  }

  async export(): Promise<Uint8Array> {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return await this.sendMessage('export');
  }

  /**
   * Close the database connection and terminate the worker
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await this.sendMessage('close');
      this.initialized = false;
    }
    this.worker.terminate();
    this.pendingRequests.clear();
  }
}

// Convenience function to create a new SQLite worker instance
export function createSQLiteWorker(): SQLiteWorker {
  return new SQLiteWorker();
}
