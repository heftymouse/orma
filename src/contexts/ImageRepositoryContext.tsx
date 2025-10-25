import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ImageRepository } from '../lib/image-repository';
import { SQLiteWorker, clearOPFS, writeToOPFS } from '../lib/sqlite';
import { useDirectory } from './DirectoryContext';

interface ImageRepositoryContextType {
  repository: ImageRepository | null;
  isInitialized: boolean;
  error: Error | null;
  hasExistingDatabase: boolean;
}

const ImageRepositoryContext = createContext<ImageRepositoryContextType>({
  repository: null,
  isInitialized: false,
  error: null,
  hasExistingDatabase: false,
});

export function useImageRepository() {
  const context = useContext(ImageRepositoryContext);
  if (!context) {
    throw new Error('useImageRepository must be used within ImageRepositoryProvider');
  }
  return context;
}

interface ImageRepositoryProviderProps {
  children: ReactNode;
}

export function ImageRepositoryProvider({ children }: ImageRepositoryProviderProps) {
  const [repository, setRepository] = useState<ImageRepository | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasExistingDatabase, setHasExistingDatabase] = useState(false);
  const { directoryHandle } = useDirectory();

  useEffect(() => {
    const initRepository = async () => {
      try {
        // Only initialize when we have a directory handle
        if (!directoryHandle) {
          return;
        }
        
        let foundExistingDb = false;
        
        // Check if there's an existing orma.sqlite3 file in the directory
        try {
          const fileHandle = await directoryHandle.getFileHandle('orma.sqlite3');
          const file = await fileHandle.getFile();
          const arrayBuffer = await file.arrayBuffer();
          const dbData = new Uint8Array(arrayBuffer);
          
          console.log(`Found existing orma.sqlite3 (${dbData.length} bytes), loading...`);
          foundExistingDb = true;
          
          // Clear OPFS and write the database file
          await clearOPFS();
          await writeToOPFS('orma.sqlite3', dbData);
        } catch (err) {
          // File doesn't exist, that's okay - we'll create a new database
          console.log('No existing orma.sqlite3 found, creating new database');
          await clearOPFS();
        }

        const worker = new SQLiteWorker();
        const repo = new ImageRepository(worker);
        await repo.init();
        
        setRepository(repo);
        setIsInitialized(true);
        setHasExistingDatabase(foundExistingDb);
      } catch (err) {
        console.error('Failed to initialize image repository:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    };

    initRepository();

    // Cleanup on unmount
    return () => {
      if (repository) {
        repository.close().catch(console.error);
      }
    };
  }, [directoryHandle]);

  return (
    <ImageRepositoryContext.Provider value={{ repository, isInitialized, error, hasExistingDatabase }}>
      {children}
    </ImageRepositoryContext.Provider>
  );
}
