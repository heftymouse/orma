import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let db: any = null;

// Message types for communication
interface WorkerMessage {
  id: number;
  type: 'init' | 'exec' | 'query' | 'close';
  sql?: string;
  params?: any[];
}

interface WorkerResponse {
  id: number;
  type: 'success' | 'error';
  data?: any;
  error?: string;
}

// Initialize SQLite
async function initSQLite() {
  try {
    const sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });
    
    (await navigator.storage.getDirectory()).getFileHandle("orma.sqlite3").then(e => e.remove());
    db = new sqlite3.oo1.DB('/orma.sqlite3', 'c', "opfs");
    
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to initialize SQLite: ${error}`);
  }
}

// Execute SQL without returning results (INSERT, UPDATE, DELETE, CREATE, etc.)
function execSQL(sql: string, params: any[] = []) {
  if (!db) throw new Error('Database not initialized');
  
  // console.log(params)

  try {
    db.exec({
      sql,
      bind: params,
    });
    
    return { success: true };
  } catch (error) {
    throw error;
  }
}

// Query SQL and return results (SELECT)
function querySQL(sql: string, params: any[] = []) {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const results: any[] = [];
    
    db.exec({
      sql,
      bind: params,
      callback: (row: any) => {
        results.push(row);
      },
      rowMode: 'object',
    });
    
    return results;
  } catch (error) {
    throw error;
  }
}

// Close database
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
  return { success: true };
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, sql, params } = event.data;
  
  const response: WorkerResponse = {
    id,
    type: 'success',
  };
  
  try {
    switch (type) {
      case 'init':
        response.data = await initSQLite();
        break;
        
      case 'exec':
        if (!sql) throw new Error('SQL is required');
        response.data = execSQL(sql, params);
        break;
        
      case 'query':
        if (!sql) throw new Error('SQL is required');
        response.data = querySQL(sql, params);
        break;
        
      case 'close':
        response.data = closeDB();
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    response.type = 'error';
    response.error = error instanceof Error ? error.message : String(error);
  }
  
  self.postMessage(response);
};
