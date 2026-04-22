import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const sourceCsvPath = path.join(workspaceRoot, 'translation-visible-ui-2026-04-21.csv')
const outputDir = path.join(workspaceRoot, 'outputs', 'translation')
const outputCsvPath = path.join(outputDir, 'beginner-music-visible-ui-latest.csv')
const outputXlsxPath = path.join(outputDir, 'beginner-music-visible-ui-latest.xlsx')
const artifactToolPath = pathToFileURL(
  'C:/Users/MINJAE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs',
).href

const { Workbook, SpreadsheetFile } = await import(artifactToolPath)

const extraRows = [
  ['Instrument Picker', 'instrument.standardDrumKit', 'Standard Drum Kit', ''],
  ['Arrange View', 'arrange.description', 'See the whole song structure and jump straight to the exact edit point.', ''],
  ['Arrange View', 'arrange.help.overview', 'Check full song structure', ''],
  ['Arrange View', 'arrange.help.jump', 'Jump straight into editing', ''],
  ['Arrange View', 'arrange.help.cut', 'Place AutoMix cuts', ''],
  ['Tempo View', 'tempo.description', 'Manage base BPM and section-by-section tempo flow.', ''],
  ['Tempo View', 'tempo.baseBpm', 'Base BPM', ''],
  ['Tempo View', 'tempo.sectionCount', 'Tempo Sections', ''],
  ['Tempo View', 'tempo.targetBpm', 'Selected Section BPM', ''],
  ['Tempo View', 'tempo.addSection', 'Add Tempo Section', ''],
  ['Tempo View', 'tempo.editBase', 'Edit Base BPM', ''],
  ['Tempo View', 'tempo.empty', 'No tempo sections yet.', ''],
  ['Tempo View', 'tempo.sectionName', 'Section Name', ''],
  ['Tempo View', 'tempo.startBar', 'Start Bar', ''],
  ['Tempo View', 'tempo.endBar', 'End Bar', ''],
  ['Tempo View', 'tempo.sectionBpm', 'Section BPM', ''],
  ['Tempo View', 'tempo.sectionHint', 'After you create a section, adjust its BPM directly.', ''],
]

function toCsvCell(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const sourceCsv = await fs.readFile(sourceCsvPath, 'utf8')
const sourceRows = sourceCsv
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split(','))

const header = sourceRows[0]
const rowMap = new Map(sourceRows.slice(1).map((row) => [row[1], row]))

extraRows.forEach((row) => {
  rowMap.set(row[1], row)
})

const mergedRows = [header, ...Array.from(rowMap.values()).sort((left, right) => {
  const sectionCompare = left[0].localeCompare(right[0])
  if (sectionCompare !== 0) return sectionCompare
  return left[1].localeCompare(right[1])
})]

const csvText = mergedRows.map((row) => row.map(toCsvCell).join(',')).join('\n')

await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(outputCsvPath, csvText, 'utf8')

const workbook = await Workbook.fromCSV(csvText, { sheetName: 'Visible UI Terms' })
const output = await SpreadsheetFile.exportXlsx(workbook)
await output.save(outputXlsxPath)

console.log(JSON.stringify({ outputCsvPath, outputXlsxPath }, null, 2))
