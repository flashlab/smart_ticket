import { useEffect, useState } from 'react'
import type { UploadedFile } from '../types'
import { generatePdfPreview } from '../utils/previewGenerator'

interface FilePreviewModalProps {
  file: UploadedFile
  onClose: () => void
}

const TRANSITION_MS = 200

export default function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [src, setSrc] = useState(file.thumbnailUrl)
  const [hiResReady, setHiResReady] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const enterFrame = requestAnimationFrame(() => setVisible(true))

    let cancelled = false
    let objUrl: string | null = null

    ;(async () => {
      try {
        if (file.type === 'image') {
          const url = URL.createObjectURL(file.file)
          objUrl = url
          if (!cancelled) {
            setSrc(url)
            setHiResReady(true)
          }
        } else {
          const url = await generatePdfPreview(file.file)
          if (!cancelled) {
            setSrc(url)
            setHiResReady(true)
          }
        }
      } catch (err) {
        console.error('Preview generation failed:', err)
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(enterFrame)
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [file])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, TRANSITION_MS)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="文件预览"
    >
      <button
        type="button"
        className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          handleClose()
        }}
        aria-label="关闭预览"
      >
        ✕
      </button>

      <div
        className={`flex items-center justify-center transition-transform duration-200 ease-out ${
          visible ? 'scale-100' : 'scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={file.name}
          className={`max-w-[90vw] max-h-[85vh] object-contain shadow-2xl rounded-md transition-opacity duration-200 ${
            hiResReady ? 'opacity-100' : 'opacity-90'
          }`}
          style={{ transform: `rotate(${file.rotation}deg)` }}
          draggable={false}
        />
      </div>

      <p className="mt-3 text-sm text-white/90 px-4 truncate max-w-[90vw]">{file.name}</p>
    </div>
  )
}
