import type { UploadedFile } from '../types'

export const HEADER = [
  '序号',
  '文件名',
  '字段1',
  '种类/版本',
  '发票代码',
  '发票号码',
  '金额/校验码',
  '开票日期',
  '校验码/金额',
  '加密字符',
] as const

const QR_FIELD_COUNT = 8
const BOM = '﻿'
const CRLF = '\r\n'

export function buildCsv(files: UploadedFile[]): string {
  const lines: string[] = []
  lines.push(HEADER.map(escapeCell).join(','))

  files.forEach((f, i) => {
    const qrCells = qrPayloadToCells(f.qrContent)
    const row = [String(i + 1), f.name, ...qrCells].map(escapeCell).join(',')
    lines.push(row)
  })

  return BOM + lines.join(CRLF)
}

export function downloadCsv(content: string, filename = 'invoices.csv'): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function qrPayloadToCells(qrContent: string | null | undefined): string[] {
  if (typeof qrContent === 'string') {
    const parts = qrContent.split(',').slice(0, QR_FIELD_COUNT)
    while (parts.length < QR_FIELD_COUNT) parts.push('')
    return parts
  }
  return ['解析失败', '', '', '', '', '', '', '']
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
