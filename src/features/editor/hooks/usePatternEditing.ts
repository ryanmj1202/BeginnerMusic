type UsePatternEditingOptions = Record<string, any>

export function usePatternEditing({
  beginPatternRepeat,
  cacheRollPointerGeometry,
  commitPatternRepeatGap,
  copySelectedNotes,
  cutSelectedNotes,
  finishPatternRepeat,
  pasteSelectedNotes,
  patternSelectionRef,
  rollPitches,
  selectNotesInPatternArea,
  setSelectedNoteIds,
  setSelectionBox,
  ungroupSelectedPattern,
  updatePatternRepeatPreview,
  updateSelectionBox,
}: UsePatternEditingOptions) {
  function beginPatternSelection(pitch: number, step: number, event: React.PointerEvent<HTMLElement>) {
    const rowIndex = rollPitches.indexOf(pitch)
    if (rowIndex < 0) return

    event.preventDefault()
    event.stopPropagation()
    setSelectionBox(null)
    cacheRollPointerGeometry()

    const selection = {
      active: true,
      endRow: rowIndex,
      endStep: step,
      startRow: rowIndex,
      startStep: step,
    }

    patternSelectionRef.current = selection
    setSelectedNoteIds([])
    updateSelectionBox(selection)
    selectNotesInPatternArea(selection)
  }

  return {
    beginPatternRepeat,
    beginPatternSelection,
    commitPatternRepeatGap,
    copySelectedNotes,
    cutSelectedNotes,
    finishPatternRepeat,
    pasteSelectedNotes,
    ungroupSelectedPattern,
    updatePatternRepeatPreview,
  }
}
