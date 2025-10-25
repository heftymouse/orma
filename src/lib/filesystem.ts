let handlePromise: Promise<FileSystemDirectoryHandle> = null!;

export function ensureDirectory(): Promise<FileSystemDirectoryHandle>{
    if (!handlePromise) {
        handlePromise = (async () => {
            // @ts-ignore
            let handle = await window.showDirectoryPicker()
            return handle
        })()
    }

    return handlePromise
}