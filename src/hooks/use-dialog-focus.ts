import { useEffect, useRef, type RefObject } from 'react'

export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open || !ref.current) return
    const previous = document.activeElement as HTMLElement | null
    const panel = ref.current
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0)
    const hidden: { element: HTMLElement; inert: boolean }[] = []
    let branch: HTMLElement = panel
    while (branch.parentElement && branch.parentElement !== document.body) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement && !sibling.hasAttribute('data-dialog-backdrop')) { hidden.push({ element: sibling, inert: sibling.inert }); sibling.inert = true }
      }
      branch = branch.parentElement
    }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    focusable()[0]?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.() }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus({ preventScroll: true }) }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus({ preventScroll: true }) }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', handleKey)
      hidden.forEach(({ element, inert }) => { element.inert = inert })
      previous?.focus({ preventScroll: true })
    }
  }, [ref, open])
}
