import type { ImageRepository } from "./image-repository";
import { isImageFile, enumerateFiles, extractImageMetadata } from "./import-utils";

export interface ImageFileMetadata {
  file: File;
  path: string;
  metadata: any;
  error?: string;
}

// Worker configuration constants
const WORKER_THRESHOLD = 50; // Enable workers for 50+ images
const BATCH_SIZE = 15; // Process 15 images per batch
const MAX_WORKERS = 6; // Cap at 6 workers

/**
 * Get the optimal number of workers based on hardware
 */
function getOptimalWorkerCount(): number {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.min(Math.max(cores - 1, 1), MAX_WORKERS);
}

interface ImportImagesOptions {
  maxDepth?: number;
  includeSubdirectories?: boolean;
  onProgress?: (current: number, total: number) => void;
  repository?: ImageRepository;
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
 * Import images using multiple workers for parallel processing
 * Uses a dynamic work queue to distribute batches across workers
 */
async function importImagesWithWorkers(
  dirHandle: FileSystemDirectoryHandle,
  options: ImportImagesOptions = {},
  targetDirHandle?: FileSystemDirectoryHandle
): Promise<ImageFileMetadata[]> {
  const { maxDepth = Infinity, onProgress, repository } = options;

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

  // Step 1: Use a single worker to enumerate all files
  const enumerationWorker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  
  const allFiles = await new Promise<Array<{ path: string }>>((resolve, reject) => {
    enumerationWorker.onmessage = (event) => {
      if (event.data.type === 'enumeration-complete') {
        resolve(event.data.files);
      } else if (event.data.type === 'error') {
        reject(new Error(event.data.error));
      }
    };

    enumerationWorker.onerror = (error) => {
      reject(error);
    };

    enumerationWorker.postMessage({
      type: 'enumerate',
      dirHandle: effectiveDirHandle,
      maxDepth,
      pathPrefix
    });
  });

  enumerationWorker.terminate();

  const totalFiles = allFiles.length;
  console.log(`Found ${totalFiles} image files`);

  // Step 2: Build a file map by re-enumerating (needed for File objects)
  const fileMap = new Map<string, File>();
  for await (const fileEntry of enumerateFiles(effectiveDirHandle, '', 0, maxDepth)) {
    const finalPath = pathPrefix ? `${pathPrefix}/${fileEntry.path}` : fileEntry.path;
    fileMap.set(finalPath, fileEntry.file);
  }

  // Step 3: Create batches for processing
  const batches: Array<Array<{ path: string }>> = [];
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    batches.push(allFiles.slice(i, i + BATCH_SIZE));
  }

  // Step 4: Create worker pool
  const workerCount = getOptimalWorkerCount();
  const workers: Worker[] = [];
  
  for (let i = 0; i < workerCount; i++) {
    workers.push(new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' }));
  }

  console.log(`Processing with ${workerCount} workers in ${batches.length} batches`);

  // Step 5: Process batches with dynamic work queue
  const results: ImageFileMetadata[] = [];
  let completedFiles = 0;
  let batchIndex = 0;
  const batchesToSave: ImageFileMetadata[] = [];

  const processBatch = (worker: Worker): Promise<void> => {
    if (batchIndex >= batches.length) {
      return Promise.resolve();
    }

    const currentBatch = batches[batchIndex++];
    
    return new Promise((resolve, reject) => {
      const handler = async (event: MessageEvent) => {
        if (event.data.type === 'batch-complete') {
          // Process results and combine with File objects
          for (const result of event.data.results) {
            const file = fileMap.get(result.path);
            
            const imageData: ImageFileMetadata = {
              file: file || new File([], result.path),
              path: result.path,
              metadata: result.metadata,
              error: result.error
            };

            results.push(imageData);
            batchesToSave.push(imageData);
            completedFiles++;
          }

          // Save to database incrementally after each batch
          if (repository && batchesToSave.length > 0) {
            await repository.saveImages(batchesToSave);
            batchesToSave.length = 0; // Clear the batch
          }

          if (onProgress) {
            onProgress(completedFiles, totalFiles);
          }

          worker.removeEventListener('message', handler);
          worker.removeEventListener('error', errorHandler);
          
          // Process next batch with this worker
          resolve(processBatch(worker));
        } else if (event.data.type === 'error') {
          worker.removeEventListener('message', handler);
          worker.removeEventListener('error', errorHandler);
          reject(new Error(event.data.error));
        }
      };

      const errorHandler = (error: ErrorEvent) => {
        worker.removeEventListener('message', handler);
        worker.removeEventListener('error', errorHandler);
        reject(error);
      };

      worker.addEventListener('message', handler);
      worker.addEventListener('error', errorHandler);

      worker.postMessage({
        type: 'process-batch',
        dirHandle: effectiveDirHandle,
        batch: currentBatch,
        maxDepth,
        pathPrefix
      });
    });
  };

  // Start processing with all workers
  await Promise.all(workers.map(worker => processBatch(worker)));

  // Cleanup workers
  workers.forEach(worker => worker.terminate());

  // Save any remaining items in the batch (shouldn't happen but just in case)
  if (repository && batchesToSave.length > 0) {
    await repository.saveImages(batchesToSave);
  }

  return results;
}

/**
 * Recursively enumerate image files in a directory and extract their metadata
 * Optionally copies the entire directory to a timestamped subdirectory
 * Automatically uses multi-worker processing for large imports (50+ images)
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

  // Quick check: count files to determine if we should use workers
  let fileCount = 0;
  const countGenerator = enumerateFiles(dirHandle, '', 0, maxDepth);
  
  for await (const _ of countGenerator) {
    fileCount++;
    // Early exit if we hit the threshold
    if (fileCount >= WORKER_THRESHOLD) {
      break;
    }
  }

  // Use workers for large imports
  if (fileCount >= WORKER_THRESHOLD) {
    console.log(`Using multi-worker processing for ${fileCount}+ images`);
    return importImagesWithWorkers(dirHandle, options, targetDirHandle);
  }

  // Use sequential processing for small imports
  console.log(`Using sequential processing for small import`);

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
