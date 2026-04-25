import type { LassoPoint, PatternSelection } from '../types'

export function getSelectionBounds(selection: PatternSelection) {
  const startStep = Math.min(selection.startStep, selection.endStep)
  const endStep = Math.max(selection.startStep, selection.endStep)
  const startRow = Math.min(selection.startRow, selection.endRow)
  const endRow = Math.max(selection.startRow, selection.endRow)

  return { endRow, endStep, startRow, startStep }
}

export function isPointInPolygon(pointX: number, pointY: number, points: LassoPoint[]) {
  if (points.length < 3) return false

  let inside = false

  for (
    let index = 0, previousIndex = points.length - 1;
    index < points.length;
    previousIndex = index, index += 1
  ) {
    const current = points[index]
    const previous = points[previousIndex]

    const intersects =
      current.gridY > pointY !== previous.gridY > pointY &&
      pointX < ((previous.gridX - current.gridX) * (pointY - current.gridY)) / (previous.gridY - current.gridY) + current.gridX

    if (intersects) inside = !inside
  }

  return inside
}