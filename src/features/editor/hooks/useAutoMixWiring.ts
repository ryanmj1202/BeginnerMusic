// @ts-nocheck
import { useEffect, useState } from 'react'
import { BEATS_PER_BAR } from '../constants'
import { createId } from '../helpers'
import { DEFAULT_AUTO_MIX_SETTINGS, autoMixProject } from '../utils/autoMixProject'

export function useAutoMixWiring(options) {
  const { getCurrentPlaybackBeat, project, setActiveEditorTab, setProject, setSelectedAutoMixSectionId = () => {}, snapBeatToGrid, totalBeats } = options
  const [autoMixBusy, setAutoMixBusy] = useState(false)
  function createAutoMixSection(anchorBeat = getCurrentPlaybackBeat(), sectionCount = project.autoMixSections?.length ?? 0) {        const startBeat = Math.max(0, Math.min(totalBeats - 0.25, snapBeatToGrid(anchorBeat)));        const endBeat = Math.min(totalBeats, startBeat + BEATS_PER_BAR * 8);        return {            id: createId('mix'),            name: `커트 ${sectionCount + 1}`,            startBeat,            endBeat: Math.max(startBeat + 0.25, endBeat),            genre: 'balanced',            priorityMode: 'genre',            strength: 0.75,            reverb: 0.25,            stereoWidth: 0.45,            brightness: 0.5,            trackPriorities: {},        };    }    function addAutoMixSection() {        const anchorBeat = getCurrentPlaybackBeat();        setProject((current) => {            const sections = [...(current.autoMixSections ?? [])].sort((left, right) => left.startBeat - right.startBeat);            const startBeat = Math.max(0, Math.min(totalBeats - 0.25, snapBeatToGrid(anchorBeat)));            const previousSectionIndex = sections.findIndex((section) => startBeat > section.startBeat && startBeat < section.endBeat);            const nextSection = createAutoMixSection(startBeat, sections.length);            const adjustedSections = previousSectionIndex >= 0                ? sections.map((section, index) => index === previousSectionIndex ? { ...section, endBeat: startBeat } : section)                : sections;            return {                ...current,                autoMixSections: [...adjustedSections, nextSection].sort((left, right) => left.startBeat - right.startBeat),            };        });        setSelectedAutoMixSectionId(nextSection.id);        setActiveEditorTab('auto-mix');    }    function updateAutoMixSection(sectionId, updates) {        setProject((current) => ({            ...current,            autoMixSections: (current.autoMixSections ?? []).map((section) => {                if (section.id !== sectionId) return section;                const nextStartBeat = Math.max(0, Math.min(totalBeats - 0.25, updates.startBeat ?? section.startBeat));                const nextEndBeat = Math.max(nextStartBeat + 0.25, Math.min(totalBeats, updates.endBeat ?? section.endBeat));                return {                    ...section,                    ...updates,                    startBeat: nextStartBeat,                    endBeat: nextEndBeat,                    strength: Math.max(0, Math.min(1, updates.strength ?? section.strength)),                };            }).sort((left, right) => left.startBeat - right.startBeat),        }));    }    function deleteAutoMixSection(sectionId) {        setProject((current) => ({            ...current,            autoMixSections: (current.autoMixSections ?? []).filter((section) => section.id !== sectionId),        }));        setSelectedAutoMixSectionId((current) => current === sectionId ? null : current);    }    useEffect(() => {        function handleCutShortcut(event) {            const target = event.target;            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;            return;        }        window.addEventListener('keydown', handleCutShortcut);        return () => window.removeEventListener('keydown', handleCutShortcut);    }, [getCurrentPlaybackBeat, totalBeats]);    function updateAutoMixSettings(updates) {        setProject((current) => ({            ...current,            autoMixSettings: {                strength: current.autoMixSettings?.strength ?? 0.75,                reverb: current.autoMixSettings?.reverb ?? 0.25,                stereoWidth: current.autoMixSettings?.stereoWidth ?? 0.45,                brightness: current.autoMixSettings?.brightness ?? 0.5,                trackPriorities: current.autoMixSettings?.trackPriorities ?? {},                ...updates,            },        }));    }    function applyAutoMix() {        if (autoMixBusy) return;        setAutoMixBusy(true);        window.setTimeout(() => {            setProject((current) => autoMixProject(current));            setAutoMixBusy(false);        }, 80);    }    
  function resetAutoMix() {
    setProject((current) => ({
      ...current,
      autoMixSettings: { ...DEFAULT_AUTO_MIX_SETTINGS },
      audioClips: current.audioClips?.map((clip) => ({ ...clip, volume: 1 })),
      notesByTrack: Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.map((note) => ({ ...note, reverb: 0 })),
        ]),
      ),
      tracks: current.tracks.map((track) => ({ ...track, pan: 0, volume: 1 })),
    }))
  }

  return { autoMixBusy, addAutoMixSection, applyAutoMix, deleteAutoMixSection, resetAutoMix, updateAutoMixSection, updateAutoMixSettings }
}
