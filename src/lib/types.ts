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