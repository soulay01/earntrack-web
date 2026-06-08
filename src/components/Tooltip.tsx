'use client'

import { useState, useRef, useCallback } from 'react'

export default function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<'top' | 'bottom'>('top')
  const wrapper = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleEnter = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (wrapper.current) {
        const rect = wrapper.current.getBoundingClientRect()
        setPos(rect.top < 120 ? 'bottom' : 'top')
      }
      setShow(true)
    }, 400)
  }, [])

  const handleLeave = useCallback(() => {
    clearTimeout(timer.current)
    setShow(false)
  }, [])

  return (
    <span ref={wrapper} className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <span className={`pointer-events-none absolute z-[9999] whitespace-nowrap rounded-md bg-[#1A2B22] px-2.5 py-1.5 text-[11px] font-medium text-[#C5D9D0] shadow-lg shadow-black/40 ${pos === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : 'top-full left-1/2 -translate-x-1/2 mt-2'}`}>
          {text}
        </span>
      )}
    </span>
  )
}
