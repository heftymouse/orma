import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { WorkerMessage, WorkerResponse } from './sqlite';

let sqlite3: Sqlite3Static = null!;
let db: any = null;

// Initialize SQLite
async function initSQLite() {
  try {
    sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });
    
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

function exportDB() {
  try {
    return sqlite3.capi.sqlite3_js_db_export(db)
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

      case 'export':
        response.data = exportDB();
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
