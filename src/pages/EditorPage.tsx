import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useFileStore } from '../store/useFileStore'
import { generateThumbnail } from '../utils/thumbnailGenerator'
import { autoCorrectFromFile, canvasToFile } from '../utils/documentScanner'
import { scanInvoiceQR } from '../utils/qrScanner'
import { buildCsv, downloadCsv } from '../utils/csvExporter'
import { sha256Hex } from '../utils/fileHash'
import SortableFileList from '../components/SortableFileList'
import FilePreviewModal from '../components/FilePreviewModal'
import LoadingOverlay from '../components/LoadingOverlay'
import type { UploadedFile } from '../types'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf'

export default function EditorPage() {
  const navigate = useNavigate()
  const files = useFileStore((s) => s.files)
  const isMerging = useFileStore((s) => s.isMerging)
  const addFiles = useFileStore((s) => s.addFiles)
  const removeFile = useFileStore((s) => s.removeFile)
  const reorderFiles = useFileStore((s) => s.reorderFiles)
  const rotateFile = useFileStore((s) => s.rotateFile)
  const setMergedPdf = useFileStore((s) => s.setMergedPdf)
  const enhanceOptions = useFileStore((s) => s.enhanceOptions)
  const setEnhanceOptions = useFileStore((s) => s.setEnhanceOptions)
  const resetEnhanceOptions = useFileStore((s) => s.resetEnhanceOptions)

  const updateFile = useFileStore((s) => s.updateFile)
  const removeDuplicates = useFileStore((s) => s.removeDuplicates)

  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ success: number; failed: number } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(
    null
  )
  const [isAdding, setIsAdding] = useState(false)
  const [addProgress, setAddProgress] = useState<{ current: number; total: number } | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewFile = previewId ? files.find((f) => f.id === previewId) ?? null : null

  const dupHashes = new Map<string, number>()
  for (const f of files) {
    if (f.dup) dupHashes.set(f.hash, (dupHashes.get(f.hash) ?? 0) + 1)
  }
  let dupRemovableCount = 0
  for (const n of dupHashes.values()) dupRemovableCount += n - 1

  // Guard: redirect if no files
  useEffect(() => {
    if (files.length === 0) {
      navigate('/', { replace: true })
    }
  }, [files.length, navigate])

  const handleAddMore = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFilesSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files
      if (!selected || selected.length === 0) return

      const list = Array.from(selected)
      setIsAdding(true)
      setAddProgress({ current: 0, total: list.length })
      try {
        const newFiles: UploadedFile[] = []
        for (let i = 0; i < list.length; i++) {
          const file = list[i]
          const [thumb, hash] = await Promise.all([
            generateThumbnail(file),
            sha256Hex(file),
          ])
          const type = file.type === 'application/pdf' ? 'pdf' : 'image'
          newFiles.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            hash,
            type,
            thumbnailUrl: thumb.thumbnailUrl,
            pageCount: thumb.pageCount,
            rotation: 0,
          })
          setAddProgress({ current: i + 1, total: list.length })
        }
        addFiles(newFiles)
      } finally {
        setIsAdding(false)
        setAddProgress(null)
        // Reset input so same file can be re-selected
        e.target.value = ''
      }
    },
    [addFiles]
  )

  const handleMerge = useCallback(async () => {
    if (isMerging || files.length === 0) return
    useFileStore.setState({ isMerging: true })
    try {
      const { mergeFiles } = await import('../utils/pdfMerger')
      const bytes = await mergeFiles(files, enhanceOptions)
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setMergedPdf(url, bytes)
      navigate('/result')
    } catch (err) {
      console.error('Merge failed:', err)
      alert('合并失败，请重试')
    } finally {
      useFileStore.setState({ isMerging: false })
    }
  }, [files, isMerging, setMergedPdf, navigate, enhanceOptions])

  const handleExportCsv = useCallback(async () => {
    if (isExporting || isMerging) return
    const current = useFileStore.getState().files
    if (current.length === 0) return

    const toScan = current.filter((f) => f.qrContent === undefined)
    if (toScan.length > 0) {
      setIsExporting(true)
      setExportProgress({ current: 0, total: toScan.length })
      try {
        for (let i = 0; i < toScan.length; i++) {
          const f = toScan[i]
          const result = await scanInvoiceQR(f.file)
          updateFile(f.id, { qrContent: result ?? null })
          setExportProgress({ current: i + 1, total: toScan.length })
        }
      } finally {
        setIsExporting(false)
        setExportProgress(null)
      }
    }

    const fresh = useFileStore.getState().files
    downloadCsv(buildCsv(fresh))
  }, [isExporting, isMerging, updateFile])

  const handleAutoCorrect = useCallback(async () => {
    const imageFiles = files.filter((f) => f.type === 'image')
    if (imageFiles.length === 0) return

    setIsScanning(true)
    setScanResult(null)

    let success = 0
    let failed = 0

    for (const item of imageFiles) {
      try {
        const result = await autoCorrectFromFile(item.file)
        if (result.success && result.canvas) {
          const correctedFile = await canvasToFile(result.canvas, item.name)
          const { thumbnailUrl } = await generateThumbnail(correctedFile)
          updateFile(item.id, { file: correctedFile, thumbnailUrl })
          success++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setScanResult({ success, failed })
    setIsScanning(false)
  }, [files, updateFile])

  // Don't render content if redirecting
  if (files.length === 0) return null

  return (
    <div className="bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-3 flex flex-wrap items-center gap-3">
          {/* File count */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            共 {files.length} 个文件
          </span>

          {/* Duplicate cleanup */}
          {dupRemovableCount > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
              onClick={removeDuplicates}
              disabled={isMerging || isExporting || isAdding}
              title="保留每组重复文件中的第一个，移除其余"
            >
              一键去除 {dupRemovableCount} 个重复文件
            </button>
          )}

          <div className="flex-1" />

          {/* Add more */}
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            onClick={handleAddMore}
            disabled={isMerging || isExporting || isAdding}
          >
            + 添加更多
          </button>

          {/* Export CSV */}
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={handleExportCsv}
            disabled={isExporting || isMerging || isAdding || files.length === 0}
          >
            {isExporting && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {isExporting ? '识别中...' : '导出 CSV'}
          </button>

          {/* Merge */}
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={handleMerge}
            disabled={isMerging || isExporting || isAdding}
          >
            {isMerging && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {isMerging ? '合并中...' : '合并 PDF'}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={handleFilesSelected}
      />

      {/* Main content */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        <SortableFileList
          files={files}
          onReorder={reorderFiles}
          onRemove={removeFile}
          onRotate={rotateFile}
          onPreview={setPreviewId}
        />

        {/* Image Enhancement Panel */}
        <div className="mt-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            onClick={() => setEnhanceOpen(!enhanceOpen)}
          >
            <span className="text-sm font-medium text-gray-700">
              🎨 图像增强
              <span className="ml-2 text-xs text-gray-400 font-normal">（仅对图片文件生效）</span>
            </span>
            <span className={`text-gray-400 transition-transform duration-200 ${enhanceOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {enhanceOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
              {/* Contrast */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-600">对比度</label>
                  <span className="text-xs text-gray-500 font-mono">{Math.round(enhanceOptions.contrast * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={enhanceOptions.contrast}
                  onChange={(e) => setEnhanceOptions({ contrast: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Brightness */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-600">亮度</label>
                  <span className="text-xs text-gray-500 font-mono">{Math.round(enhanceOptions.brightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={enhanceOptions.brightness}
                  onChange={(e) => setEnhanceOptions({ brightness: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Sharpen */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-600">锐化</label>
                  <span className="text-xs text-gray-500 font-mono">{Math.round(enhanceOptions.sharpen * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={enhanceOptions.sharpen}
                  onChange={(e) => setEnhanceOptions({ sharpen: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Reset button */}
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={resetEnhanceOptions}
              >
                重置
              </button>
            </div>
          )}
        </div>

        {/* Document Scan Correction Panel */}
        <div className="mt-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            onClick={() => setScanOpen(!scanOpen)}
          >
            <span className="text-sm font-medium text-gray-700">
              🔍 智能文档校正
              <span className="ml-2 text-xs text-gray-400 font-normal">（自动边缘检测与透视校正）</span>
            </span>
            <span className={`text-gray-400 transition-transform duration-200 ${scanOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {scanOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                自动检测文档边缘并校正透视变形，适用于拍照的发票/票据。仅对图片文件生效。
              </p>

              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={handleAutoCorrect}
                disabled={isScanning || isMerging || isExporting || isAdding || files.filter((f) => f.type === 'image').length === 0}
              >
                {isScanning && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {isScanning ? '校正中...' : '一键校正所有图片'}
              </button>

              {files.filter((f) => f.type === 'image').length === 0 && (
                <p className="text-xs text-amber-600">当前没有图片文件，无法执行校正。</p>
              )}

              {scanResult && (
                <p className="text-xs text-gray-600">
                  处理结果：
                  {scanResult.success > 0 && (
                    <span className="text-green-600 font-medium">成功 {scanResult.success} 张</span>
                  )}
                  {scanResult.success > 0 && scanResult.failed > 0 && '，'}
                  {scanResult.failed > 0 && (
                    <span className="text-amber-600 font-medium">跳过 {scanResult.failed} 张</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hi-res preview */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewId(null)} />
      )}

      {/* Merge / export / add overlay */}
      {isMerging && <LoadingOverlay message="正在合并文件" />}
      {!isMerging && isExporting && (
        <LoadingOverlay
          message="正在识别二维码"
          current={exportProgress?.current}
          total={exportProgress?.total}
        />
      )}
      {!isMerging && !isExporting && isAdding && (
        <LoadingOverlay
          message="正在加载文件"
          current={addProgress?.current}
          total={addProgress?.total}
        />
      )}
    </div>
  )
}
