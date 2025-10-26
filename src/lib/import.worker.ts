import { enumerateFiles, extractImageMetadata } from "./import-utils";

interface WorkerMessage {
  type: 'enumerate' | 'process-batch';
  dirHandle?: FileSystemDirectoryHandle;
  maxDepth?: number;
  batch?: Array<{ path: string }>;
  pathPrefix?: string;
}

interface WorkerResponse {
  type: 'enumeration-complete' | 'batch-complete' | 'error';
  files?: Array<{ path: string }>;
  results?: Array<{
    path: string;
    metadata: any;
    error?: string;
  }>;
  error?: string;
}

// Worker message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, dirHandle, maxDepth, batch, pathPrefix } = event.data;

  try {
    if (type === 'enumerate') {
      // Enumerate all image files in the directory
      if (!dirHandle) {
        throw new Error('Directory handle is required for enumeration');
      }

      const files: Array<{ path: string }> = [];
      
      for await (const fileEntry of enumerateFiles(dirHandle, '', 0, maxDepth ?? Infinity)) {
        const finalPath = pathPrefix ? `${pathPrefix}/${fileEntry.path}` : fileEntry.path;
        files.push({ path: finalPath });
      }

      const response: WorkerResponse = {
        type: 'enumeration-complete',
        files
      };
      self.postMessage(response);

    } else if (type === 'process-batch') {
      // Process a batch of files
      if (!dirHandle || !batch) {
        throw new Error('Directory handle and batch are required for processing');
      }

      const results: Array<{
        path: string;
        metadata: any;
        error?: string;
      }> = [];

      // Create a map to quickly access files by path
      const fileMap = new Map<string, File>();
      
      // Re-enumerate to get File objects (we only have paths in the batch)
      for await (const fileEntry of enumerateFiles(dirHandle, '', 0, maxDepth ?? Infinity)) {
        const finalPath = pathPrefix ? `${pathPrefix}/${fileEntry.path}` : fileEntry.path;
        fileMap.set(finalPath, fileEntry.file);
      }

      // Process each file in the batch
      for (const { path } of batch) {
        const file = fileMap.get(path);
        
        if (!file) {
          results.push({
            path,
            metadata: null,
            error: 'File not found'
          });
          continue;
        }

        try {
          const metadata = await extractImageMetadata(file);
          results.push({
            path,
            metadata
          });
        } catch (error) {
          results.push({
            path,
            metadata: null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const response: WorkerResponse = {
        type: 'batch-complete',
        results
      };
      self.postMessage(response);
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    self.postMessage(response);
  }
};
