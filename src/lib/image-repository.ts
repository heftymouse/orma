import { SQLiteWorker } from './sqlite';
import type { ImageFileMetadata } from './utils';

/**
 * Raw database record (internal use)
 */
interface ImageRecordRaw {
  id?: number;
  path: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  lastModified: string;
  dateTimeOriginal?: string;
  gpsLatitude?: string;
  gpsLongitude?: string;
  gpsAltitude?: number;
  metadata: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Public-facing image record with parsed fields
 */
export interface ImageRecord {
  id?: number;
  path: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  lastModified: Date;
  // Queryable fields
  dateTimeOriginal?: Date;
  gpsLatitude?: [number, number, number]; // [degrees, minutes, seconds]
  gpsLongitude?: [number, number, number]; // [degrees, minutes, seconds]
  gpsAltitude?: number;
  // All metadata as parsed object
  metadata: any;
  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Extended image record with parsed GPS coordinates in decimal format
 */
export interface ImageRecordWithGPS extends ImageRecord {
  gpsLatitudeDecimal?: number;
  gpsLongitudeDecimal?: number;
}

export interface ImageSearchQuery {
  path?: string;
  dateFrom?: string;
  dateTo?: string;
  hasGPS?: boolean;
  nearLocation?: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
  };
  limit?: number;
  offset?: number;
}



export class ImageRepository {
  private db: SQLiteWorker;
  private initialized = false;

  constructor(db: SQLiteWorker) {
    this.db = db;
  }

  /**
   * Convert GPS coordinate array [degrees, minutes, seconds] to decimal degrees
   */
  private gpsArrayToDecimal(gpsArray: [number, number, number]): number {
    const [degrees, minutes, seconds] = gpsArray;
    return degrees + minutes / 60 + seconds / 3600;
  }

  /**
   * Transform raw database record to public ImageRecord with parsed fields
   */
  private transformRecord(raw: ImageRecordRaw): ImageRecord {
    return {
      id: raw.id,
      path: raw.path,
      filename: raw.filename,
      fileSize: raw.fileSize,
      mimeType: raw.mimeType,
      lastModified: new Date(raw.lastModified),
      dateTimeOriginal: raw.dateTimeOriginal ? new Date(raw.dateTimeOriginal) : undefined,
      gpsLatitude: parseGPSArray(raw.gpsLatitude),
      gpsLongitude: parseGPSArray(raw.gpsLongitude),
      gpsAltitude: raw.gpsAltitude,
      metadata: JSON.parse(raw.metadata),
      createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    };
  }

  /**
   * Initialize the repository and create tables
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.db.init();

    // Create images table with only queryable fields
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        mimeType TEXT,
        lastModified TEXT,
        
        -- Queryable fields
        dateTimeOriginal TEXT,
        gpsLatitude TEXT,
        gpsLongitude TEXT,
        gpsAltitude REAL,
        
        -- All metadata as JSON
        metadata TEXT NOT NULL,
        
        -- Timestamps
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for queryable fields
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_path ON images(path)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_date ON images(dateTimeOriginal)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_images_gps ON images(gpsLatitude, gpsLongitude)');

    this.initialized = true;
  }

  /**
   * Save or update an image with metadata
   */
  async saveImage(imageData: ImageFileMetadata): Promise<number> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    const meta = imageData.metadata || {};
    
    // Prepare data for database (raw format with JSON strings)
    const dbRecord = {
      path: imageData.path,
      filename: meta.filename || imageData.file.name,
      fileSize: meta.fileSize || imageData.file.size,
      mimeType: meta.mimeType || imageData.file.type,
      lastModified: meta.lastModified?.toISOString() || new Date(imageData.file.lastModified).toISOString(),
      
      // Queryable fields
      dateTimeOriginal: meta.DateTimeOriginal?.toISOString() || new Date(imageData.file.lastModified).toISOString(),
      // Serialize GPS arrays as JSON strings for database
      gpsLatitude: Array.isArray(meta.GPSLatitude) ? JSON.stringify(meta.GPSLatitude) : undefined,
      gpsLongitude: Array.isArray(meta.GPSLongitude) ? JSON.stringify(meta.GPSLongitude) : undefined,
      gpsAltitude: meta.GPSAltitude,
      
      // All metadata as JSON
      metadata: JSON.stringify(meta),
    };

    // Use INSERT OR REPLACE to handle duplicates
    await this.db.exec(`
      INSERT OR REPLACE INTO images (
        path, filename, fileSize, mimeType, lastModified,
        dateTimeOriginal, gpsLatitude, gpsLongitude, gpsAltitude,
        metadata, updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, CURRENT_TIMESTAMP
      )
    `, [
      dbRecord.path, dbRecord.filename, dbRecord.fileSize, dbRecord.mimeType, dbRecord.lastModified,
      dbRecord.dateTimeOriginal, dbRecord.gpsLatitude, dbRecord.gpsLongitude, dbRecord.gpsAltitude,
      dbRecord.metadata,
    ]);

    // Get the inserted/updated row ID
    const result = await this.db.query<{ id: number }>(
      'SELECT id FROM images WHERE path = ?',
      [dbRecord.path]
    );

    return result[0].id;
  }

  /**
   * Save multiple images in a batch
   */
  async saveImages(images: ImageFileMetadata[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    await this.db.exec('BEGIN TRANSACTION');
    
    try {
      for (const image of images) {
        await this.saveImage(image);
      }
      await this.db.exec('COMMIT');
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async getImages(): Promise<ImageRecord[] | null> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    const results = await this.db.query<ImageRecordRaw>(
      'SELECT * FROM images',
    );
    console.log(results)

    return results.length > 0 ? results.map(this.transformRecord) : null;
  }

  /**
   * Get an image by path
   */
  async getImageByPath(path: string): Promise<ImageRecord | null> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    const results = await this.db.query<ImageRecordRaw>(
      'SELECT * FROM images WHERE path = ?',
      [path]
    );

    return results.length > 0 ? this.transformRecord(results[0]) : null;
  }

  /**
   * Get an image by ID
   */
  async getImageById(id: number): Promise<ImageRecord | null> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    const results = await this.db.query<ImageRecordRaw>(
      'SELECT * FROM images WHERE id = ?',
      [id]
    );

    return results.length > 0 ? this.transformRecord(results[0]) : null;
  }

  /**
   * Search images with filters
   */
  async searchImages(query: ImageSearchQuery): Promise<ImageRecord[]> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    const conditions: string[] = [];
    const params: any[] = [];

    if (query.path) {
      conditions.push('path LIKE ?');
      params.push(`%${query.path}%`);
    }

    if (query.dateFrom) {
      conditions.push('dateTimeOriginal >= ?');
      params.push(query.dateFrom);
    }

    if (query.dateTo) {
      conditions.push('dateTimeOriginal <= ?');
      params.push(query.dateTo);
    }

    if (query.hasGPS !== undefined) {
      if (query.hasGPS) {
        conditions.push('gpsLatitude IS NOT NULL AND gpsLongitude IS NOT NULL');
      } else {
        conditions.push('gpsLatitude IS NULL OR gpsLongitude IS NULL');
      }
    }

    // For nearLocation, we need to filter after fetching since GPS is stored as JSON
    let nearLocationFilter: ((record: ImageRecord) => boolean) | undefined;
    if (query.nearLocation) {
      const { latitude, longitude, radiusKm = 10 } = query.nearLocation;
      // Ensure we only get records with GPS data
      conditions.push('gpsLatitude IS NOT NULL AND gpsLongitude IS NOT NULL');
      
      // Create a filter function for Haversine distance calculation
      nearLocationFilter = (record: ImageRecord) => {
        const lat = record.gpsLatitude ? this.gpsArrayToDecimal(record.gpsLatitude) : undefined;
        const lon = record.gpsLongitude ? this.gpsArrayToDecimal(record.gpsLongitude) : undefined;
        
        if (lat === undefined || lon === undefined) return false;
        
        // Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = this.toRadians(lat - latitude);
        const dLon = this.toRadians(lon - longitude);
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(this.toRadians(latitude)) * Math.cos(this.toRadians(lat)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return distance <= radiusKm;
      };
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT * FROM images
      ${whereClause}
      ORDER BY dateTimeOriginal DESC
    `;

    const rawResults = await this.db.query<ImageRecordRaw>(sql, params);
    
    // Transform raw records to parsed records
    let results = rawResults.map(raw => this.transformRecord(raw));
    
    // Apply location filter if needed
    if (nearLocationFilter) {
      results = results.filter(nearLocationFilter);
    }
    
    // Apply pagination after filtering
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get statistics about the image collection
   */
  async getStatistics(): Promise<{
    totalImages: number;
    totalSize: number;
    imagesWithGPS: number;
    dateRange: { oldest?: string; newest?: string };
  }> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    const [countResult, sizeResult, gpsResult, dateResult] = await Promise.all([
      this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM images'),
      this.db.query<{ total: number }>('SELECT SUM(fileSize) as total FROM images'),
      this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM images WHERE gpsLatitude IS NOT NULL AND gpsLongitude IS NOT NULL'),
      this.db.query<{ oldest: string; newest: string }>(
        'SELECT MIN(dateTimeOriginal) as oldest, MAX(dateTimeOriginal) as newest FROM images WHERE dateTimeOriginal IS NOT NULL'
      ),
    ]);

    return {
      totalImages: countResult[0].count,
      totalSize: sizeResult[0].total || 0,
      imagesWithGPS: gpsResult[0].count,
      dateRange: {
        oldest: dateResult[0]?.oldest,
        newest: dateResult[0]?.newest,
      },
    };
  }

  /**
   * Delete an image by path
   */
  async deleteImage(path: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    await this.db.exec('DELETE FROM images WHERE path = ?', [path]);
  }

  /**
   * Delete all images
   */
  async deleteAll(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Repository not initialized. Call init() first.');
    }

    await this.db.exec('DELETE FROM images');
  }

  /**
   * Close the repository and database connection
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await this.db.close();
      this.initialized = false;
    }
  }
}

/**
 * Create a new image repository instance
 */
export function createImageRepository(db: SQLiteWorker): ImageRepository {
  return new ImageRepository(db);
}

function parseGPSArray(gpsString?: string): [number, number, number] | undefined {
    if (!gpsString) return undefined;
    try {
      const gpsArray = JSON.parse(gpsString);
      if (Array.isArray(gpsArray) && gpsArray.length === 3) {
        return gpsArray as [number, number, number];
      }
    } catch {
      // Return undefined if parsing fails
    }
    return undefined;
  }