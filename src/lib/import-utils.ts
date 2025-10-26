import exifr from "exifr";

/**
 * Supported image file extensions
 */
export const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'jfif',
  'png', 'gif', 'webp', 'bmp',
  'tiff', 'tif', 'heic', 'heif',
  'avif', 'svg', 'ico'
]);

/**
 * Check if a file is an image based on its extension
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

/**
 * Recursively enumerate all files in a directory handle
 */
export async function* enumerateFiles(
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
 * EXIF parsing configuration
 */
export const EXIF_PARSE_OPTIONS: any = {
  tiff: true,
  exif: true,
  gps: true,
  iptc: true,
  xmp: true,
  icc: false,
  jfif: true,
  ihdr: true,
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
};

/**
 * Extract metadata from an image file using exifr
 */
export async function extractImageMetadata(file: File): Promise<any> {
  try {
    const metadata = await exifr.parse(file, EXIF_PARSE_OPTIONS);

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
