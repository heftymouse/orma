import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DirectoryPickerProps {
  onDirectorySelected: (handle: FileSystemDirectoryHandle) => void;
}

export function DirectoryPicker({ onDirectorySelected }: DirectoryPickerProps) {
  const handlePickDirectory = async () => {
    try {
      // @ts-ignore - showDirectoryPicker is not yet in TypeScript types
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
      });
      onDirectorySelected(dirHandle);
    } catch (error) {
      // User cancelled or error occurred
      console.error('Failed to pick directory:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <FolderOpen size={32} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to Orma
          </h1>
          <p className="text-gray-600">
            Select a folder containing your photos to get started. We'll organize and help you browse your memories.
          </p>
        </div>

        <Button
          onClick={handlePickDirectory}
          size="lg"
          className="w-full"
        >
          <FolderOpen size={20} className="mr-2" />
          Select Photo Folder
        </Button>

        <p className="text-xs text-gray-500 mt-4">
          Your photos stay on your device. We only need permission to read them.
        </p>
      </div>
    </div>
  );
}
