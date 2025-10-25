import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import exifr from 'exifr'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

interface EnumerateImagesOptions {
  maxDepth?: number;
  includeSubdirectories?: boolean;
  onProgress?: (current: number, total: number) => void;
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
      ],
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
 * Recursively enumerate image files in a directory and extract their metadata
 * 
 * @param dirHandle - FileSystemDirectoryHandle to start enumeration from
 * @param options - Configuration options
 * @returns Array of image files with their metadata
 * 
 * @example
 * ```typescript
 * const dirHandle = await window.showDirectoryPicker();
 * const images = await enumerateImageMetadata(dirHandle, {
 *   maxDepth: 3,
 *   onProgress: (current, total) => console.log(`${current}/${total}`)
 * });
 * ```
 */
export async function enumerateImageMetadata(
  dirHandle: FileSystemDirectoryHandle,
  options: EnumerateImagesOptions = {}
): Promise<ImageFileMetadata[]> {
  const {
    maxDepth = Infinity,
    onProgress
  } = options;

  const results: ImageFileMetadata[] = [];
  const files: { file: File; path: string }[] = [];

  // First pass: collect all image files
  for await (const fileEntry of enumerateFiles(dirHandle, '', 0, maxDepth)) {
    files.push(fileEntry);
  }

  const total = files.length;

  // Second pass: extract metadata with progress tracking
  for (let i = 0; i < files.length; i++) {
    const { file, path } = files[i];
    
    try {
      const metadata = await extractImageMetadata(file);
      results.push({
        file,
        path,
        metadata
      });
    } catch (error) {
      results.push({
        file,
        path,
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
 */
export async function* enumerateImageMetadataStream(
  dirHandle: FileSystemDirectoryHandle,
  options: EnumerateImagesOptions = {}
): AsyncGenerator<ImageFileMetadata> {
  const { maxDepth = Infinity } = options;

  for await (const { file, path } of enumerateFiles(dirHandle, '', 0, maxDepth)) {
    try {
      const metadata = await extractImageMetadata(file);
      yield {
        file,
        path,
        metadata
      };
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
