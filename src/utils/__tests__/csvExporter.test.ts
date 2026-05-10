import { buildCsv, HEADER } from '../csvExporter'
import type { UploadedFile } from '../../types'

const baseFile = (overrides: Partial<UploadedFile>): UploadedFile => ({
  id: overrides.id ?? 'id',
  file: new File([], overrides.name ?? 'x.pdf'),
  name: overrides.name ?? 'x.pdf',
  hash: overrides.hash ?? 'h',
  type: overrides.type ?? 'pdf',
  thumbnailUrl: overrides.thumbnailUrl ?? '',
  rotation: overrides.rotation ?? 0,
  dup: overrides.dup,
  qrContent: overrides.qrContent,
})

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

describe('buildCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const out = buildCsv([])
    expect(out.charCodeAt(0)).toBe(0xfeff)
  })

  it('emits the spec header (10 columns) as the first row', () => {
    const out = stripBom(buildCsv([]))
    const headerLine = out.split('\r\n')[0]
    expect(headerLine.split(',')).toEqual([...HEADER])
    expect(HEADER).toHaveLength(10)
  })

  it('expands an 8-field QR payload into cols 3-10', () => {
    const f = baseFile({
      name: 'a.pdf',
      qrContent: '01,32,,2541,2939.00,20250914,,CDA5',
    })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,a.pdf,01,32,,2541,2939.00,20250914,,CDA5')
  })

  it('truncates a 9-field payload to 8 (drops the trailing field)', () => {
    const f = baseFile({
      name: 'a.pdf',
      qrContent: 'A,B,C,D,E,F,G,H,EXTRA',
    })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,a.pdf,A,B,C,D,E,F,G,H')
  })

  it('pads a short 5-field payload to 8 with empty cells', () => {
    const f = baseFile({ name: 'a.pdf', qrContent: 'A,B,C,D,E' })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,a.pdf,A,B,C,D,E,,,')
  })

  it('marks qrContent === null as 解析失败 in col 3 (PDF)', () => {
    const f = baseFile({ name: 'a.pdf', qrContent: null })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,a.pdf,解析失败,,,,,,,')
  })

  it('marks qrContent === null as 解析失败 in col 3 (image)', () => {
    const f = baseFile({ name: 'a.jpg', type: 'image', qrContent: null })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,a.jpg,解析失败,,,,,,,')
  })

  it('treats qrContent === undefined as a defensive failure', () => {
    const f = baseFile({ name: 'a.pdf' })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,a.pdf,解析失败,,,,,,,')
  })

  it('expands an image with a string qrContent identically to a PDF', () => {
    const f = baseFile({
      name: 'photo.jpg',
      type: 'image',
      qrContent: '01,32,,2541,2939.00,20250914,,CDA5',
    })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1]).toBe('1,photo.jpg,01,32,,2541,2939.00,20250914,,CDA5')
  })

  it('quotes filenames containing commas and double quotes', () => {
    const f = baseFile({ name: 'He said "hi", ok.pdf', qrContent: null })
    const lines = stripBom(buildCsv([f])).split('\r\n')
    expect(lines[1].startsWith('1,"He said ""hi"", ok.pdf",解析失败,')).toBe(true)
  })

  it('separates rows with CRLF', () => {
    const a = baseFile({ id: '1', name: 'a.pdf', qrContent: null })
    const b = baseFile({ id: '2', name: 'b.pdf', qrContent: null })
    const out = stripBom(buildCsv([a, b]))
    expect(out.split('\r\n')).toHaveLength(3)
    expect(out.includes('\n')).toBe(true)
    expect(out.replace(/\r\n/g, '')).not.toMatch(/\n/)
  })
})
