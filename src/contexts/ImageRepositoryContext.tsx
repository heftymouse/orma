import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ImageRepository } from '../lib/image-repository';
import { SQLiteWorker } from '../lib/sqlite';

interface ImageRepositoryContextType {
  repository: ImageRepository | null;
  isInitialized: boolean;
  error: Error | null;
}

const ImageRepositoryContext = createContext<ImageRepositoryContextType>({
  repository: null,
  isInitialized: false,
  error: null,
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

  useEffect(() => {
    const initRepository = async () => {
      try {
        const worker = new SQLiteWorker();
        const repo = new ImageRepository(worker);
        await repo.init();
        
        setRepository(repo);
        setIsInitialized(true);
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
  }, []);

  return (
    <ImageRepositoryContext.Provider value={{ repository, isInitialized, error }}>
      {children}
    </ImageRepositoryContext.Provider>
  );
}
