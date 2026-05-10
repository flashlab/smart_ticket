export interface UploadedFile {
  id: string
  file: File
  name: string
  hash: string
  type: 'pdf' | 'image'
  thumbnailUrl: string
  rotation: number // 0, 90, 180, 270
  pageCount?: number
  dup?: boolean
  qrContent?: string | null
}
