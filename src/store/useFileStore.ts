import { create } from 'zustand'
import type { UploadedFile } from '../types'
import { defaultEnhanceOptions } from '../utils/imageEnhancer'
import type { EnhanceOptions } from '../utils/imageEnhancer'

interface FileStore {
  files: UploadedFile[]
  mergedPdfUrl: string | null
  mergedPdfBytes: Uint8Array | null
  isMerging: boolean
  enhanceOptions: EnhanceOptions

  addFiles: (files: UploadedFile[]) => void
  replaceFiles: (files: UploadedFile[]) => void
  removeFile: (id: string) => void
  removeDuplicates: () => void
  reorderFiles: (files: UploadedFile[]) => void
  rotateFile: (id: string) => void
  updateFile: (
    id: string,
    updates: Partial<Pick<UploadedFile, 'file' | 'name' | 'thumbnailUrl' | 'qrContent'>>
  ) => void
  setMergedPdf: (url: string, bytes: Uint8Array) => void
  setEnhanceOptions: (options: Partial<EnhanceOptions>) => void
  resetEnhanceOptions: () => void
  reset: () => void
}

const initialState = {
  files: [] as UploadedFile[],
  mergedPdfUrl: null as string | null,
  mergedPdfBytes: null as Uint8Array | null,
  isMerging: false,
  enhanceOptions: { ...defaultEnhanceOptions } as EnhanceOptions,
}

function computeDupFlags(files: UploadedFile[]): UploadedFile[] {
  const counts = new Map<string, number>()
  for (const f of files) {
    counts.set(f.hash, (counts.get(f.hash) ?? 0) + 1)
  }
  return files.map((f) => {
    const isDup = (counts.get(f.hash) ?? 0) > 1
    if (isDup === Boolean(f.dup)) return f
    return { ...f, dup: isDup }
  })
}

export const useFileStore = create<FileStore>((set, get) => ({
  ...initialState,

  addFiles: (newFiles) => {
    set((state) => ({ files: computeDupFlags([...state.files, ...newFiles]) }))
  },

  replaceFiles: (newFiles) => {
    const { files, mergedPdfUrl } = get()
    for (const f of files) {
      URL.revokeObjectURL(f.thumbnailUrl)
    }
    if (mergedPdfUrl) {
      URL.revokeObjectURL(mergedPdfUrl)
    }
    set({ files: computeDupFlags(newFiles), mergedPdfUrl: null, mergedPdfBytes: null })
  },

  removeFile: (id) => {
    const file = get().files.find((f) => f.id === id)
    if (file) {
      URL.revokeObjectURL(file.thumbnailUrl)
    }
    set((state) => ({ files: computeDupFlags(state.files.filter((f) => f.id !== id)) }))
  },

  removeDuplicates: () => {
    const { files } = get()
    const seen = new Set<string>()
    const survivors: UploadedFile[] = []
    for (const f of files) {
      if (seen.has(f.hash)) {
        URL.revokeObjectURL(f.thumbnailUrl)
        continue
      }
      seen.add(f.hash)
      survivors.push(f)
    }
    set({ files: computeDupFlags(survivors) })
  },

  reorderFiles: (files) => {
    set({ files })
  },

  rotateFile: (id) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, rotation: ((f.rotation + 90) % 360) as 0 | 90 | 180 | 270 } : f
      ),
    }))
  },

  updateFile: (id, updates) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f
        if (updates.thumbnailUrl && f.thumbnailUrl !== updates.thumbnailUrl) {
          URL.revokeObjectURL(f.thumbnailUrl)
        }
        return { ...f, ...updates }
      }),
    }))
  },

  setMergedPdf: (url, bytes) => {
    set({ mergedPdfUrl: url, mergedPdfBytes: bytes })
  },

  setEnhanceOptions: (options) => {
    set((state) => ({ enhanceOptions: { ...state.enhanceOptions, ...options } }))
  },

  resetEnhanceOptions: () => {
    set({ enhanceOptions: { ...defaultEnhanceOptions } })
  },

  reset: () => {
    const { files, mergedPdfUrl } = get()
    for (const f of files) {
      URL.revokeObjectURL(f.thumbnailUrl)
    }
    if (mergedPdfUrl) {
      URL.revokeObjectURL(mergedPdfUrl)
    }
    set({ ...initialState })
  },
}))
