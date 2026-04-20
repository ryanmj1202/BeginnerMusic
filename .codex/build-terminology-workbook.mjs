import fs from 'node:fs/promises'
import path from 'node:path'

const outputDir = path.resolve('outputs', 'terminology')
const outputPath = path.join(outputDir, 'beginner-music-terminology.xlsx')

const rows = [
  ['구역', '현재 표시', '초급자 표현', '쉬운 설명', '중요도', '메모'],
  ['하단 편집', '소리 세기', '소리 세기', '음표 하나가 얼마나 세게 연주되는지 정합니다.', '높음', '기존 전문 용어 대신 이 표현을 사용합니다.'],
  ['하단 편집', '음높이 휘기', '음높이 휘기', '음을 위아래로 살짝 휘게 만드는 값입니다.', '중간', '피치라는 영어를 쓰지 않습니다.'],
  ['하단 편집', '음량', '음량', '선택한 음표나 트랙의 소리 크기입니다.', '높음', '소리 세기와 구분해서 설명합니다.'],
  ['하단 편집', '좌우 위치', '좌우 위치', '소리가 왼쪽, 가운데, 오른쪽 중 어디에서 들릴지 정합니다.', '높음', '팬이라는 영어를 쓰지 않습니다.'],
  ['하단 편집', '연주 느낌', '연주 느낌', '연주 중간의 강조나 표현 정도를 조절합니다.', '중간', '고급 기능이라 설명을 짧게 둡니다.'],
  ['하단 편집', '떨림', '떨림', '소리에 흔들림을 더합니다.', '중간', '비브라토와 연결해 설명할 수 있습니다.'],
  ['하단 편집', '음표 정보', '음표 정보', '선택한 음표의 시작, 길이, 세기를 직접 봅니다.', '중간', '이벤트라는 영어를 쓰지 않습니다.'],
  ['상단 메뉴', '파일', '파일', '새 프로젝트, 불러오기, 저장을 모아 둔 메뉴입니다.', '높음', ''],
  ['상단 메뉴', '편집', '편집', '복사, 잘라내기, 붙여넣기, 되돌리기를 모아 둔 메뉴입니다.', '높음', ''],
  ['상단 메뉴', '멜로디 입력', '멜로디 입력', '건반과 칸을 보며 음표를 찍는 화면입니다.', '높음', ''],
  ['상단 메뉴', '배치', '배치', '트랙별 멜로디가 곡 안에서 어디에 놓였는지 보는 화면입니다.', '중간', ''],
  ['상단 메뉴', '빠르기', '빠르기', '곡 전체의 속도를 정하는 화면입니다.', '높음', ''],
  ['파일', '새 프로젝트', '새 프로젝트', '현재 작업을 비우고 새 곡을 시작합니다.', '높음', ''],
  ['파일', '불러오기', '불러오기', '저장한 프로젝트나 미디 파일을 엽니다.', '높음', ''],
  ['파일', '프로젝트 저장', '프로젝트 저장', '나중에 다시 편집할 수 있는 프로젝트 파일로 저장합니다.', '높음', ''],
  ['파일', '음악 파일 저장', '음악 파일 저장', '일반 음악 플레이어에서 들을 수 있는 파일로 저장합니다.', '높음', ''],
  ['파일', '미디 파일 저장', '미디 파일 저장', '다른 음악 프로그램에서 열 수 있는 미디 파일로 저장합니다.', '중간', ''],
  ['트랙', '트랙', '트랙', '악기 하나가 들어가는 줄입니다.', '높음', ''],
  ['트랙', '악기', '악기', '트랙에서 사용할 소리를 고릅니다.', '높음', ''],
  ['트랙', '채널', '채널', '미디에서 소리를 구분하는 번호입니다.', '낮음', '초급자 화면에서는 작게 보여도 됩니다.'],
  ['트랙', '음소거', '음소거', '이 트랙의 소리만 잠시 끕니다.', '높음', ''],
  ['자동 믹스', '자동 믹스', '자동 믹스', '트랙과 음표의 소리 크기를 자동으로 맞춥니다.', '높음', ''],
  ['자동 믹스', '믹스 컷', '믹스 컷', '곡 안에서 따로 소리 균형을 잡을 구간입니다.', '높음', ''],
  ['자동 믹스', '중심 트랙', '중심 트랙', '해당 구간에서 가장 잘 들려야 하는 트랙입니다.', '높음', ''],
  ['자동 믹스', '강도', '강도', '자동 믹스가 얼마나 세게 적용될지 정합니다.', '높음', ''],
  ['피아노 롤', '칸', '칸', '박자에 맞춰 음표를 놓기 위한 기준입니다.', '중간', ''],
  ['피아노 롤', '마디', '마디', '박자가 모인 큰 단위입니다.', '높음', ''],
  ['피아노 롤', '박', '박', '음악의 기본 박자 단위입니다.', '높음', ''],
  ['피아노 롤', '음표 단위', '음표 단위', '음표를 얼마나 세밀하게 움직일지 정합니다.', '높음', ''],
  ['피아노 롤', '키보드 입력', '키보드 입력', '컴퓨터 키보드로 음표를 바로 입력합니다.', '중간', ''],
  ['악기', '피아노', '피아노', '기본 멜로디를 연주하기 좋은 악기입니다.', '높음', ''],
  ['악기', '파워 드럼 세트', '파워 드럼 세트', '강한 드럼 소리를 내는 리듬 악기입니다.', '높음', ''],
  ['악기', '현악기', '현악기', '바이올린, 첼로 같은 줄 악기입니다.', '중간', ''],
  ['악기', '금관악기', '금관악기', '트럼펫, 트롬본 같은 힘 있는 관악기입니다.', '중간', ''],
]

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function columnName(index) {
  let name = ''
  let current = index + 1
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - remainder) / 26)
  }
  return name
}

const sharedStrings = []
const sharedStringMap = new Map()

function sharedStringIndex(value) {
  const text = String(value)
  const existing = sharedStringMap.get(text)
  if (existing !== undefined) return existing
  const nextIndex = sharedStrings.length
  sharedStrings.push(text)
  sharedStringMap.set(text, nextIndex)
  return nextIndex
}

function sheetXml() {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`
      const style = rowIndex === 0 ? 1 : colIndex === 2 || colIndex === 3 || colIndex === 5 ? 2 : 0
      return `<c r="${ref}" t="s" s="${style}"><v>${sharedStringIndex(value)}</v></c>`
    }).join('')
    return `<row r="${rowIndex + 1}" ht="${rowIndex === 0 ? 24 : 34}" customHeight="1">${cells}</row>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="16" customWidth="1"/>
    <col min="2" max="2" width="20" customWidth="1"/>
    <col min="3" max="3" width="20" customWidth="1"/>
    <col min="4" max="4" width="48" customWidth="1"/>
    <col min="5" max="5" width="12" customWidth="1"/>
    <col min="6" max="6" width="34" customWidth="1"/>
  </cols>
  <sheetData>${body}</sheetData>
  <autoFilter ref="A1:F${rows.length}"/>
</worksheet>`
}

function sharedStringsXml() {
  const items = sharedStrings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${items}</sst>`
}

const files = new Map([
  ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`],
  ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
  ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="용어정리" sheetId="1" r:id="rId1"/></sheets>
</workbook>`],
  ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`],
  ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3C4"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`],
])

files.set('xl/worksheets/sheet1.xml', sheetXml())
files.set('xl/sharedStrings.xml', sharedStringsXml())

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function uint16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function uint32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

function makeZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name)
    const contentBuffer = Buffer.from(content)
    const crc = crc32(contentBuffer)
    const localHeader = Buffer.concat([
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(crc), uint32(contentBuffer.length), uint32(contentBuffer.length),
      uint16(nameBuffer.length), uint16(0), nameBuffer,
    ])
    localParts.push(localHeader, contentBuffer)
    centralParts.push(Buffer.concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(crc), uint32(contentBuffer.length), uint32(contentBuffer.length),
      uint16(nameBuffer.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0),
      uint32(offset), nameBuffer,
    ]))
    offset += localHeader.length + contentBuffer.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.size), uint16(entries.size),
    uint32(centralDirectory.length), uint32(offset), uint16(0),
  ])
  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(outputPath, makeZip(files))
console.log(outputPath)
