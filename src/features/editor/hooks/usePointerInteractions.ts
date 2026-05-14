// @ts-nocheck
import { useEffect } from 'react'

export function usePointerInteractions(options) {
  const { interactionHandlersRef, pianoRollRef, setPianoRollContextMenu, setTrackContextMenu } = options
  useEffect(() => {        function closeMenusFromOutsidePointer(event) {            if (event.button === 2)                return;            const target = event.target;            if (target instanceof Element && target.closest('.track-context-menu'))                return;            setTrackContextMenu(null);            setPianoRollContextMenu(null);        }        window.addEventListener('pointerdown', closeMenusFromOutsidePointer, { capture: true });        return () => window.removeEventListener('pointerdown', closeMenusFromOutsidePointer, { capture: true });    }, []);    useEffect(() => {        const roll = pianoRollRef.current;        if (!roll)            return undefined;        function handleNativeWheel(event) {            if (!event.ctrlKey)                return;            event.preventDefault();            interactionHandlersRef.current.zoomRoll(event.deltaY > 0 ? -1 : 1);        }        roll.addEventListener('wheel', handleNativeWheel, { passive: false });        return () => roll.removeEventListener('wheel', handleNativeWheel);    }, []);    
}
