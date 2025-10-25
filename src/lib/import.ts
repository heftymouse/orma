import exifr from "exifr";
import type { ImageRepository } from "./image-repository";

// Supported image file extensions
const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'jfif',
  'png', 'gif', 'webp', 'bmp',
  'tiff', 'tif', 'heic', 'heif',
  'avif', 'svg', 'ico'
]);

export interface ImageFileMetadata {
  file: File;
  path: string;
  metadata: any;
  error?: string;
}

interface ImportImagesOptions {
  maxDepth?: number;
  includeSubdirectories?: boolean;
  onProgress?: (current: number, total: number) => void;
  repository?: ImageRepository;
}

/**
 * Check if a file is an image based on its extension
 */
function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

/**
 * Recursively enumerate all files in a directory handle
 */
async function* enumerateFiles(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string = '',
  currentDepth: number = 0,
  maxDepth: number = Infinity
): AsyncGenerator<{ file: File; path: string }> {
  if (currentDepth > maxDepth) {
    return;
  }

  // @ts-ignore - FileSystemDirectoryHandle is async iterable
  for await (const [name, handle] of dirHandle.entries()) {
    const entryPath = currentPath ? `${currentPath}/${name}` : name;

    if (handle.kind === 'file') {
      if (isImageFile(name)) {
        const file = await handle.getFile();
        yield { file, path: entryPath };
      }
    } else if (handle.kind === 'directory') {
      yield* enumerateFiles(handle, entryPath, currentDepth + 1, maxDepth);
    }
  }
}

/**
 * Extract metadata from an image file using exifr
 */
async function extractImageMetadata(file: File): Promise<any> {
  try {
    const metadata = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      icc: false,
      jfif: true,
      ihdr: true,
      // Pick only human-readable fields useful for photographers
      pick: [
        // Camera & Lens
        'Make', 'Model', 'LensModel', 'LensMake',
        
        // Exposure settings
        'ISO', 'ISOSpeedRatings',
        'FNumber', 'ApertureValue',
        'ExposureTime', 'ShutterSpeedValue',
        'ExposureCompensation', 'ExposureMode', 'ExposureProgram',
        'MeteringMode', 'Flash',
        
        // Focus
        'FocalLength', 'FocalLengthIn35mmFormat',
        'FocusMode', 'FocusDistance',
        
        // Image properties
        'ImageWidth', 'ImageHeight',
        'Orientation',
        'ColorSpace',
        'WhiteBalance',
        
        // Date & Time
        'DateTimeOriginal', 'CreateDate', 'ModifyDate',
        'OffsetTime', 'OffsetTimeOriginal',
        
        // GPS (if available)
        'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
        'GPSDateStamp', 'GPSTimeStamp',
        
        // Creator/Copyright
        'Artist', 'Copyright', 'Creator',
        'ImageDescription', 'UserComment',
        
        // IPTC fields
        'Caption', 'Headline', 'Keywords',
        'Credit', 'Source', 'City', 'Country',
        
        // Shooting conditions
        'BrightnessValue',
        'LightSource',
        'Contrast', 'Saturation', 'Sharpness',
        
        // File format
        'FileType', 'MIMEType',
      ]
    });

    return {
      // File info
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      lastModified: new Date(file.lastModified),
      
      // Metadata from exifr
      ...metadata,
    };
  } catch (error) {
    throw new Error(`Failed to extract metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Recursively copy all files from source directory to target directory
 */
async function copyDirectory(
  sourceDirHandle: FileSystemDirectoryHandle,
  targetDirHandle: FileSystemDirectoryHandle,
  currentPath: string = ''
): Promise<void> {
  // @ts-ignore - FileSystemDirectoryHandle is async iterable
  for await (const [name, handle] of sourceDirHandle.entries()) {
    if (handle.kind === 'file') {
      // Copy file
      const file = await handle.getFile();
      const targetFileHandle = await targetDirHandle.getFileHandle(name, { create: true });
      const writable = await targetFileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      
      const path = currentPath ? `${currentPath}/${name}` : name;
      console.log(`Copied file: ${path}`);
    } else if (handle.kind === 'directory') {
      // Create subdirectory and recurse
      const targetSubDirHandle = await targetDirHandle.getDirectoryHandle(name, { create: true });
      const subPath = currentPath ? `${currentPath}/${name}` : name;
      await copyDirectory(handle, targetSubDirHandle, subPath);
    }
  }
}

/**
 * Recursively enumerate image files in a directory and extract their metadata
 * Optionally copies the entire directory to a timestamped subdirectory
 * 
 * @param dirHandle - FileSystemDirectoryHandle to start enumeration from
 * @param options - Configuration options
 * @param targetDirHandle - Optional target directory to copy files to (creates timestamped subdirectory)
 * @returns Array of image files with their metadata
 * 
 * @example
 * ```typescript
 * const dirHandle = await window.showDirectoryPicker();
 * const images = await importImages(dirHandle, {
 *   maxDepth: 3,
 *   onProgress: (current, total) => console.log(`${current}/${total}`),
 *   repository: repo // Optional: save to database
 * }, targetDirHandle);
 * ```
 */
export async function importImages(
  dirHandle: FileSystemDirectoryHandle,
  options: ImportImagesOptions = {},
  targetDirHandle?: FileSystemDirectoryHandle
): Promise<ImageFileMetadata[]> {
  const {
    maxDepth = Infinity,
    onProgress,
    repository
  } = options;

  let effectiveDirHandle = dirHandle;
  let pathPrefix = '';

  // If target directory is provided, copy the entire directory first
  if (targetDirHandle) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const importDirName = `import_${timestamp}`;
    const importDirHandle = await targetDirHandle.getDirectoryHandle(importDirName, { create: true });
    
    console.log(`Copying directory to: ${importDirName}`);
    await copyDirectory(dirHandle, importDirHandle);
    console.log(`Directory copy complete`);
    
    effectiveDirHandle = importDirHandle;
    pathPrefix = importDirName;
  }

  const results: ImageFileMetadata[] = [];
  const files: { file: File; path: string }[] = [];

  // First pass: collect all image files
  for await (const fileEntry of enumerateFiles(effectiveDirHandle, '', 0, maxDepth)) {
    files.push(fileEntry);
  }

  const total = files.length;

  // Second pass: extract metadata with progress tracking
  for (let i = 0; i < files.length; i++) {
    const { file, path } = files[i];
    
    try {
      const metadata = await extractImageMetadata(file);
      const finalPath = pathPrefix ? `${pathPrefix}/${path}` : path;
      
      const imageData: ImageFileMetadata = {
        file,
        path: finalPath,
        metadata
      };

      // Save to database if repository provided
      if (repository) {
        await repository.saveImage(imageData);
      }
      
      results.push(imageData);
    } catch (error) {
      const finalPath = pathPrefix ? `${pathPrefix}/${path}` : path;
      results.push({
        file,
        path: finalPath,
        metadata: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}

/**
 * Stream-based version that yields results as they are processed
 * More memory efficient for large directories
 * 
 * @example
 * ```typescript
 * for await (const imageData of importImagesStream(dirHandle, { 
 *   maxDepth: 3,
 *   repository: repo // Optional: save to database as we go
 * })) {
 *   console.log(imageData.path, imageData.metadata);
 * }
 * ```
 */
export async function* importImagesStream(
  dirHandle: FileSystemDirectoryHandle,
  options: ImportImagesOptions = {}
): AsyncGenerator<ImageFileMetadata> {
  const { maxDepth = Infinity, repository } = options;

  for await (const { file, path } of enumerateFiles(dirHandle, '', 0, maxDepth)) {
    try {
      const metadata = await extractImageMetadata(file);
      const imageData: ImageFileMetadata = {
        file,
        path,
        metadata
      };
      
      // Save to database if repository provided
      if (repository) {
        await repository.saveImage(imageData);
      }
      
      yield imageData;
    } catch (error) {
      yield {
        file,
        path,
        metadata: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Import individual files (from file picker)
 * Copies files to a timestamped subdirectory before importing
 * 
 * @param files - Array of File objects to import
 * @param targetDirHandle - Directory handle where files should be copied
 * @param repository - Optional repository to save images to
 * @returns Array of imported image metadata
 */
export async function importFiles(
  files: File[],
  targetDirHandle: FileSystemDirectoryHandle,
  repository?: ImageRepository
): Promise<ImageFileMetadata[]> {
  const results: ImageFileMetadata[] = [];

  // Create a timestamped subdirectory for the imported files
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-MM-SS
  const importDirName = `import_${timestamp}`;
  const importDirHandle = await targetDirHandle.getDirectoryHandle(importDirName, { create: true });
  
  console.log(`Created import directory: ${importDirName}`);

  for (const file of files) {
    // Check if it's an image file
    if (!isImageFile(file.name)) {
      console.warn(`Skipping non-image file: ${file.name}`);
      continue;
    }

    try {
      // Copy file to the import directory
      const fileHandle = await importDirHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      
      console.log(`Copied file to ${importDirName}/${file.name}`);
      
      // Extract metadata
      const metadata = await extractImageMetadata(file);
      const path = `${importDirName}/${file.name}`;
      
      const imageData: ImageFileMetadata = {
        file,
        path, // Use the new path in the import directory
        metadata
      };

      // Save to database if repository provided
      if (repository) {
        await repository.saveImage(imageData);
      }

      results.push(imageData);
    } catch (error) {
      results.push({
        file,
        path: file.name,
        metadata: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}
