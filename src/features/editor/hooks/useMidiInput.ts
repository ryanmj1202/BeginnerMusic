import { useEffect } from 'react'

type MidiNavigator = Navigator & {
  requestMIDIAccess?: () => Promise<MIDIAccess>
}

type UseMidiInputOptions = {
  finishMidiNote: (channel: number, pitch: number, eventTimeStamp?: number) => void
  handleMidiAftertouch: (channel: number, value: number) => void
  handleMidiControlChange: (channel: number, controller: number, value: number, eventTimeStamp?: number) => void
  handleMidiPitchBend: (channel: number, leastSignificant: number, mostSignificant: number) => void
  handleMidiProgramChange: (channel: number, program: number) => void
  isPlaying: boolean
  keyboardInputEnabled: boolean
  startMidiNote: (channel: number, pitch: number, velocity: number, eventTimeStamp?: number) => void
}

export function useMidiInput({
  finishMidiNote,
  handleMidiAftertouch,
  handleMidiControlChange,
  handleMidiPitchBend,
  handleMidiProgramChange,
  isPlaying,
  keyboardInputEnabled,
  startMidiNote,
}: UseMidiInputOptions) {
  useEffect(() => {
    const midiNavigator = navigator as MidiNavigator
    if (!keyboardInputEnabled || !midiNavigator.requestMIDIAccess) return undefined

    let cancelled = false
    let midiAccess: MIDIAccess | null = null
    const connectedInputs: MIDIInput[] = []

    function handleMidiMessage(event: MIDIMessageEvent) {
      if (!event.data) return
      const [status = 0, first = 0, second = 0] = event.data
      const command = status & 0xf0
      const channel = status & 0x0f
      if (command === 0x90 && second > 0) {
        startMidiNote(channel, first, Math.max(0.01, Math.min(1, second / 127)), event.timeStamp)
        return
      }
      if (command === 0x80 || command === 0x90) {
        finishMidiNote(channel, first, event.timeStamp)
        return
      }
      if (command === 0xb0) {
        handleMidiControlChange(channel, first, second, event.timeStamp)
        return
      }
      if (command === 0xc0) {
        handleMidiProgramChange(channel, first)
        return
      }
      if (command === 0xe0) {
        handleMidiPitchBend(channel, first, second)
        return
      }
      if (command === 0xa0 || command === 0xd0) {
        handleMidiAftertouch(channel, command === 0xd0 ? first : second)
      }
    }

    function connectInputs(access: MIDIAccess) {
      connectedInputs.forEach((input) => {
        input.onmidimessage = null
      })
      connectedInputs.length = 0
      access.inputs.forEach((input) => {
        input.onmidimessage = handleMidiMessage
        connectedInputs.push(input)
      })
    }

    void midiNavigator.requestMIDIAccess().then((access) => {
      if (cancelled) return
      midiAccess = access
      connectInputs(access)
      access.onstatechange = () => connectInputs(access)
    }).catch(() => undefined)

    return () => {
      cancelled = true
      connectedInputs.forEach((input) => {
        input.onmidimessage = null
      })
      if (midiAccess) midiAccess.onstatechange = null
    }
  }, [keyboardInputEnabled, isPlaying])
}
