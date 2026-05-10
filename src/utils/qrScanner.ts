import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import jsQR from 'jsqr'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const PDFJS_CMAP_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/cmaps/'
const PDFJS_STANDARD_FONT_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/'

const PDF_RENDER_SCALE = 2
const TOP_LEFT_CROP_RATIO = 0.4

export async function scanInvoiceQR(file: File): Promise<string | null> {
  try {
    const canvas = file.type === 'application/pdf'
      ? await renderPdfPage1(file)
      : file.type.startsWith('image/')
        ? await renderImage(file)
        : null

    if (!canvas) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const cropResult = decodeCrop(ctx, canvas.width, canvas.height)
    if (cropResult) return cropResult

    const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const fullCode = jsQR(fullData.data, fullData.width, fullData.height)
    return fullCode?.data ?? null
  } catch {
    return null
  }
}

function decodeCrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): string | null {
  const cw = Math.max(1, Math.floor(width * TOP_LEFT_CROP_RATIO))
  const ch = Math.max(1, Math.floor(height * TOP_LEFT_CROP_RATIO))
  const data = ctx.getImageData(0, 0, cw, ch)
  const code = jsQR(data.data, data.width, data.height)
  return code?.data ?? null
}

async function renderPdfPage1(file: File): Promise<HTMLCanvasElement> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
  }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas
}

async function renderImage(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    return canvas
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Failed to load image for QR scan'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}
