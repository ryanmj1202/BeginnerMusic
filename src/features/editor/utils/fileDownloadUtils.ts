export function getSafeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ') || 'beginner-music'
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function getCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff)
}

function writeUint32(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

export async function createZipBlob(files: Array<{ name: string; blob: Blob }>) {
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  const centralDirectory: number[] = []
  let offset = 0
  const toBlobPart = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer
  const utf8FileNameFlag = 0x0800

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const data = new Uint8Array(await file.blob.arrayBuffer())
    const crc = getCrc32(data)
    const localHeader: number[] = []
    writeUint32(localHeader, 0x04034b50)
    writeUint16(localHeader, 20)
    writeUint16(localHeader, utf8FileNameFlag)
    writeUint16(localHeader, 0)
    writeUint16(localHeader, 0)
    writeUint16(localHeader, 0)
    writeUint32(localHeader, crc)
    writeUint32(localHeader, data.length)
    writeUint32(localHeader, data.length)
    writeUint16(localHeader, nameBytes.length)
    writeUint16(localHeader, 0)
    parts.push(toBlobPart(new Uint8Array(localHeader)), toBlobPart(nameBytes), toBlobPart(data))

    writeUint32(centralDirectory, 0x02014b50)
    writeUint16(centralDirectory, 20)
    writeUint16(centralDirectory, 20)
    writeUint16(centralDirectory, utf8FileNameFlag)
    writeUint16(centralDirectory, 0)
    writeUint16(centralDirectory, 0)
    writeUint16(centralDirectory, 0)
    writeUint32(centralDirectory, crc)
    writeUint32(centralDirectory, data.length)
    writeUint32(centralDirectory, data.length)
    writeUint16(centralDirectory, nameBytes.length)
    writeUint16(centralDirectory, 0)
    writeUint16(centralDirectory, 0)
    writeUint16(centralDirectory, 0)
    writeUint16(centralDirectory, 0)
    writeUint32(centralDirectory, 0)
    writeUint32(centralDirectory, offset)
    centralDirectory.push(...nameBytes)
    offset += localHeader.length + nameBytes.length + data.length
  }

  const centralDirectoryOffset = offset
  const centralDirectoryBytes = new Uint8Array(centralDirectory)
  const endRecord: number[] = []
  writeUint32(endRecord, 0x06054b50)
  writeUint16(endRecord, 0)
  writeUint16(endRecord, 0)
  writeUint16(endRecord, files.length)
  writeUint16(endRecord, files.length)
  writeUint32(endRecord, centralDirectoryBytes.length)
  writeUint32(endRecord, centralDirectoryOffset)
  writeUint16(endRecord, 0)

  return new Blob([...parts, toBlobPart(centralDirectoryBytes), toBlobPart(new Uint8Array(endRecord))], { type: 'application/zip' })
}
