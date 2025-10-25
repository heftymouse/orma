import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface DirectoryContextType {
  directoryHandle: FileSystemDirectoryHandle | null;
  setDirectoryHandle: (handle: FileSystemDirectoryHandle) => void;
  getFileHandle: (path: string) => Promise<FileSystemFileHandle | null>;
  getFile: (path: string) => Promise<File | null>;
  createBlobUrl: (path: string) => Promise<string | null>;
}

const DirectoryContext = createContext<DirectoryContextType | null>(null);

export function useDirectory() {
  const context = useContext(DirectoryContext);
  if (!context) {
    throw new Error('useDirectory must be used within DirectoryProvider');
  }
  return context;
}

interface DirectoryProviderProps {
  children: ReactNode;
}

export function DirectoryProvider({ children }: DirectoryProviderProps) {
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const getFileHandle = useCallback(async (path: string): Promise<FileSystemFileHandle | null> => {
    if (!directoryHandle) return null;

    try {
      // Split path and navigate through directories
      const parts = path.split('/').filter(p => p.length > 0);
      let currentHandle: FileSystemDirectoryHandle = directoryHandle;

      // Navigate through directories (all but last part)
      for (let i = 0; i < parts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
      }

      // Get the file handle (last part)
      const fileName = parts[parts.length - 1];
      const fileHandle = await currentHandle.getFileHandle(fileName);
      return fileHandle;
    } catch (error) {
      console.error(`Failed to get file handle for path: ${path}`, error);
      return null;
    }
  }, [directoryHandle]);

  const getFile = useCallback(async (path: string): Promise<File | null> => {
    const fileHandle = await getFileHandle(path);
    if (!fileHandle) return null;

    try {
      return await fileHandle.getFile();
    } catch (error) {
      console.error(`Failed to get file for path: ${path}`, error);
      return null;
    }
  }, [getFileHandle]);

  const createBlobUrl = useCallback(async (path: string): Promise<string | null> => {
    const file = await getFile(path);
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [getFile]);

  return (
    <DirectoryContext.Provider
      value={{
        directoryHandle,
        setDirectoryHandle,
        getFileHandle,
        getFile,
        createBlobUrl,
      }}
    >
      {children}
    </DirectoryContext.Provider>
  );
}
