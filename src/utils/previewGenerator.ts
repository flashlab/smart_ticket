import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const PDFJS_CMAP_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/cmaps/'
const PDFJS_STANDARD_FONT_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/'

const PREVIEW_MAX_WIDTH = 1600
const PREVIEW_MAX_HEIGHT = 2240
const PREVIEW_MAX_SCALE = 4

export async function generatePdfPreview(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
  }).promise
  const page = await pdf.getPage(1)
  const unscaled = page.getViewport({ scale: 1 })
  const scale = Math.min(
    PREVIEW_MAX_WIDTH / unscaled.width,
    PREVIEW_MAX_HEIGHT / unscaled.height,
    PREVIEW_MAX_SCALE
  )
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas.toDataURL('image/png')
}
