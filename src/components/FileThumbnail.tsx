import type { UploadedFile } from '../types'

interface FileThumbnailProps {
  file: UploadedFile
  onRemove: (id: string) => void
  onRotate: (id: string) => void
  onPreview?: (id: string) => void
  dragHandleProps?: Record<string, unknown>
}

const TAIL_LEN = 8

function splitName(name: string): { head: string; tail: string } {
  if (name.length <= TAIL_LEN + 1) return { head: '', tail: name }
  return {
    head: name.slice(0, name.length - TAIL_LEN),
    tail: name.slice(name.length - TAIL_LEN),
  }
}

export default function FileThumbnail({
  file,
  onRemove,
  onRotate,
  onPreview,
  dragHandleProps,
}: FileThumbnailProps) {
  const { head, tail } = splitName(file.name)
  const isMultiPage = file.type === 'pdf' && (file.pageCount ?? 1) > 1

  return (
    <div className="relative flex flex-col rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Drag handle */}
      <div
        className="absolute top-2 left-2 z-10 cursor-grab rounded-md bg-white/80 p-1 text-gray-400 hover:text-gray-600 hover:bg-white active:cursor-grabbing"
        {...dragHandleProps}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>

      {/* Thumbnail */}
      <button
        type="button"
        className="flex w-full items-center justify-center h-40 bg-gray-50 p-2 overflow-hidden cursor-zoom-in hover:bg-gray-100 transition-colors"
        onClick={() => onPreview?.(file.id)}
        title="点击放大预览"
      >
        <img
          src={file.thumbnailUrl}
          alt={file.name}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `rotate(${file.rotation}deg)` }}
          draggable={false}
        />
      </button>

      {/* File name with badges */}
      <div className="px-3 py-2 border-t border-gray-50 flex items-center gap-1 text-xs text-gray-700">
        {file.dup && (
          <span className="shrink-0 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium leading-none">
            重复
          </span>
        )}
        {isMultiPage && (
          <span className="shrink-0 rounded bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium leading-none">
            多页
          </span>
        )}
        <span className="flex min-w-0 flex-1 items-center" title={file.name}>
          <span className="truncate">{head}</span>
          <span className="shrink-0">{tail}</span>
        </span>
      </div>

      {/* Actions */}
      <div className="flex border-t border-gray-100">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          onClick={() => onRotate(file.id)}
          title="旋转"
        >
          <span className="text-sm">↻</span>
          旋转
        </button>
        <div className="w-px bg-gray-100" />
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
          onClick={() => onRemove(file.id)}
          title="删除"
        >
          <span className="text-sm">✕</span>
          删除
        </button>
      </div>
    </div>
  )
}
