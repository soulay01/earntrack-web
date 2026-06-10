'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; pos: 'top' | 'bottom' } | null>(null)
  const wrapper = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const update = useCallback(() => {
    if (!wrapper.current) return
    const rect = wrapper.current.getBoundingClientRect()
    const pos = rect.top < 120 ? 'bottom' : 'top'
    const tooltipHeight = pos === 'top' ? 8 : 8
    const top = pos === 'top' ? rect.top - tooltipHeight : rect.bottom + tooltipHeight
    setCoords({
      top,
      left: rect.left + rect.width / 2,
      pos,
    })
  }, [])

  const handleEnter = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      update()
      setShow(true)
    }, 400)
  }, [update])

  const handleLeave = useCallback(() => {
    clearTimeout(timer.current)
    setShow(false)
  }, [])

  useEffect(() => {
    if (!show) return
    const onScroll = () => { setShow(false); setCoords(null) }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [show])

  return (
    <span ref={wrapper} className="inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && coords && typeof document !== 'undefined' && createPortal(
        <span
          className="pointer-events-none fixed z-[99999] whitespace-nowrap rounded-md bg-[#1A2B22] px-2.5 py-1.5 text-[11px] font-medium text-[#C5D9D0] shadow-lg shadow-black/40"
          style={{
            top: coords.top,
            left: coords.left,
            transform: 'translateX(-50%)',
            marginTop: coords.pos === 'bottom' ? 6 : undefined,
            marginBottom: coords.pos === 'top' ? 6 : undefined,
          }}>
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}
