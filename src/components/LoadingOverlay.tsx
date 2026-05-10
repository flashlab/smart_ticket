interface LoadingOverlayProps {
  message: string
  current?: number
  total?: number
}

export default function LoadingOverlay({ message, current, total }: LoadingOverlayProps) {
  const showProgress = typeof current === 'number' && typeof total === 'number' && total > 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="rounded-2xl bg-white px-8 py-6 shadow-xl flex flex-col items-center gap-3">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
        <p className="text-sm font-medium text-gray-700">
          {showProgress ? `${message} (${current}/${total})...` : `${message}...`}
        </p>
      </div>
    </div>
  )
}
