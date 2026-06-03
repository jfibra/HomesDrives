'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  MousePointer2,
  Trash2,
  Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TextState = {
  fontSize: number
  fontFamily: string
  fill: string
  fontWeight: string
  fontStyle: string
  textAlign: string
}

type Props = {
  posterUrl: string
  posterWidth: number
  posterHeight: number
}

const FONT_FAMILIES = ['Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New', 'Helvetica']

const MAX_W = 820
const MAX_H = 640

function calcDisplay(w: number, h: number) {
  const ratio = w / h
  let dw = Math.min(w, MAX_W)
  let dh = dw / ratio
  if (dh > MAX_H) { dh = MAX_H; dw = dh * ratio }
  return { dw: Math.round(dw), dh: Math.round(dh) }
}

const DEFAULT_TEXT: TextState = {
  fontSize: 36,
  fontFamily: 'Arial',
  fill: '#ffffff',
  fontWeight: 'bold',
  fontStyle: 'normal',
  textAlign: 'center',
}

export default function PosterEditor({ posterUrl, posterWidth, posterHeight }: Props) {
  // Use a container div so we create a fresh <canvas> element on every effect run.
  // This avoids the React 18 Strict Mode bug where the first effect cleanup removes
  // the canvas from the DOM before the async fabric import resolves, leaving the
  // second run with a detached element that Fabric attaches to but never inserts.
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<any>(null)
  const fabricNsRef = useRef<any>(null)

  const [activeTool, setActiveTool] = useState<'select' | 'text'>('select')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [textState, setTextState] = useState<TextState>(DEFAULT_TEXT)

  const { dw, dh } = calcDisplay(posterWidth, posterHeight)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let fc: any = null

    // Create a fresh canvas element for this effect run.
    const el = document.createElement('canvas')
    container.appendChild(el)

    async function init() {
      // Dynamic import keeps fabric out of the SSR bundle.
      // @ts-expect-error fabric v5 ships no bundled types
      const mod = await import('fabric')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fabric = (mod as any).fabric

      if (cancelled) {
        // Cleanup already ran before the import finished — remove the orphan element.
        if (container && container.contains(el)) el.remove()
        return
      }

      fabricNsRef.current = fabric

      fc = new fabric.Canvas(el, {
        selection: true,
        width: dw,
        height: dh,
        backgroundColor: '#1a1a2e',
        preserveObjectStacking: true,
      })
      canvasRef.current = fc

      // Load the generated poster as a real Fabric Image object so it is
      // selectable, moveable, and resizable — just like every other element.
      // It is sent to the back so overlaid text/images stay on top.
      fabric.Image.fromURL(posterUrl, (img: any) => {
        if (cancelled || !fc) return

        img.set({
          left: 0,
          top: 0,
          scaleX: dw / (img.width ?? 1),
          scaleY: dh / (img.height ?? 1),
          selectable: false,
          evented: false,
          hasBorders: false,
          hasControls: false,
        })

        fc.add(img)
        fc.sendToBack(img)           // always stays behind text / overlays
        fc.renderAll()
      })

      // Sync selection state to React.
      function sync() {
        const obj = fc.getActiveObject()
        if (!obj) { setSelectedType(null); return }
        setSelectedType(obj.type ?? null)
        if (obj.type === 'i-text' || obj.type === 'textbox') {
          setTextState({
            fontSize: obj.fontSize ?? 36,
            fontFamily: obj.fontFamily ?? 'Arial',
            fill: obj.fill ?? '#ffffff',
            fontWeight: obj.fontWeight ?? 'bold',
            fontStyle: obj.fontStyle ?? 'normal',
            textAlign: obj.textAlign ?? 'center',
          })
        }
      }

      fc.on('selection:created', sync)
      fc.on('selection:updated', sync)
      fc.on('selection:cleared', () => setSelectedType(null))
      fc.on('object:modified', sync)
    }

    void init()

    return () => {
      cancelled = true
      if (fc) {
        fc.dispose() // dispose() removes el from DOM automatically
      } else {
        // init() hasn't completed yet — remove the element we appended.
        if (container.contains(el)) el.remove()
      }
      canvasRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterUrl, dw, dh])

  // ── Toolbar actions ──────────────────────────────────────────────────────────

  function applyProp(key: string, value: any) {
    const fc = canvasRef.current
    if (!fc) return
    const obj = fc.getActiveObject()
    if (!obj) return
    obj.set(key, value)
    fc.renderAll()
    setTextState((prev) => ({ ...prev, [key]: value }))
  }

  function addText() {
    const fabric = fabricNsRef.current
    const fc = canvasRef.current
    if (!fabric || !fc) return

    const t = new fabric.IText('Your text here', {
      left: dw / 2,
      top: dh / 2,
      originX: 'center',
      originY: 'center',
      fontSize: 36,
      fontFamily: 'Arial',
      fill: '#ffffff',
      fontWeight: 'bold',
      textAlign: 'center',
      shadow: new fabric.Shadow({
        color: 'rgba(0,0,0,0.6)',
        blur: 8,
        offsetX: 2,
        offsetY: 2,
      }),
    })

    fc.add(t)
    fc.setActiveObject(t)
    fc.renderAll()
    setActiveTool('select')
    // Don't call enterEditing() here — it locks the canvas in text-input mode
    // and breaks click-selection for all other objects.
    // The user can double-click the text to start typing.
  }

  function addImage(file: File) {
    const fabric = fabricNsRef.current
    const fc = canvasRef.current
    if (!fabric || !fc) return

    const url = URL.createObjectURL(file)
    fabric.Image.fromURL(url, (img: any) => {
      const max = Math.min(dw, dh) * 0.45
      if ((img.width ?? 1) > max) img.scaleToWidth(max)
      img.set({ left: dw / 2, top: dh / 2, originX: 'center', originY: 'center' })
      fc.add(img)
      fc.setActiveObject(img)
      fc.renderAll()
    })
  }

  function deleteSelected() {
    const fc = canvasRef.current
    if (!fc) return
    const obj = fc.getActiveObject()
    if (obj) {
      fc.remove(obj)
      fc.discardActiveObject()
      fc.renderAll()
      setSelectedType(null)
    }
  }

  function bringForward() {
    const fc = canvasRef.current
    if (!fc) return
    const obj = fc.getActiveObject()
    if (obj) { fc.bringForward(obj); fc.renderAll() }
  }

  function sendBackward() {
    const fc = canvasRef.current
    if (!fc) return
    const obj = fc.getActiveObject()
    if (obj) { fc.sendBackwards(obj); fc.renderAll() }
  }

  function exportCanvas() {
    const fc = canvasRef.current
    if (!fc) return
    const multiplier = posterWidth / dw
    const dataUrl = fc.toDataURL({ format: 'png', multiplier })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'edited-poster.png'
    a.click()
  }

  // ── Derived UI state ─────────────────────────────────────────────────────────

  const isText = selectedType === 'i-text' || selectedType === 'textbox'
  const hasObj = selectedType !== null

  return (
    <div className="rounded-2xl border border-[#d7d0c4] bg-white shadow-[0_4px_32px_-8px_rgba(16,35,63,0.14)]">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ede6da] bg-[#faf7f2] px-5 py-3">
        <div>
          <h3 className="text-sm font-bold text-[#10233f]">Poster Editor</h3>
          <p className="text-xs text-[#5d6777]">
            Add text or images · Click to select · Drag to move · Handles to resize
          </p>
        </div>
        <button
          type="button"
          onClick={exportCanvas}
          className="inline-flex items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#18355f]"
        >
          <Download className="h-4 w-4" />
          Export & Download
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#ede6da] bg-white px-4 py-2.5">

        {/* Tool group */}
        <div className="flex gap-1 rounded-xl bg-[#f3efe7] p-1">
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              activeTool === 'select'
                ? 'bg-[#10233f] text-white shadow-sm'
                : 'text-[#5d6777] hover:text-[#10233f]',
            )}
          >
            <MousePointer2 className="h-3.5 w-3.5" />
            Select
          </button>
          <button
            type="button"
            onClick={addText}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#5d6777] transition-all hover:text-[#10233f]"
          >
            <Type className="h-3.5 w-3.5" />
            Add Text
          </button>
        </div>

        {/* Add image */}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#d8cebf] bg-[#faf7f2] px-3 py-1.5 text-xs font-semibold text-[#10233f] transition-colors hover:bg-[#f5ede4]">
          <ImageIcon className="h-3.5 w-3.5" />
          Add Image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])}
          />
        </label>

        <div className="h-5 w-px bg-[#e8dfd1]" />

        {/* Text formatting — visible only when a text object is selected */}
        {isText && (
          <>
            <select
              value={textState.fontFamily}
              onChange={(e) => applyProp('fontFamily', e.target.value)}
              className="h-8 rounded-lg border border-[#d8cebf] bg-white px-2 text-xs text-[#10233f] focus:outline-none focus:ring-1 focus:ring-[#10233f]"
            >
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => applyProp('fontSize', Math.max(6, textState.fontSize - 2))}
                className="flex h-8 w-7 items-center justify-center rounded-l-lg border border-[#d8cebf] bg-white text-[#10233f] hover:bg-[#f5ede4]"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={6}
                max={300}
                value={textState.fontSize}
                onChange={(e) => applyProp('fontSize', Math.max(6, Number(e.target.value)))}
                className="h-8 w-14 border-y border-[#d8cebf] bg-white text-center text-xs text-[#10233f] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => applyProp('fontSize', textState.fontSize + 2)}
                className="flex h-8 w-7 items-center justify-center rounded-r-lg border border-[#d8cebf] bg-white text-[#10233f] hover:bg-[#f5ede4]"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex">
              <button
                type="button"
                onClick={() => applyProp('fontWeight', textState.fontWeight === 'bold' ? 'normal' : 'bold')}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-l-lg border text-sm font-bold transition-all',
                  textState.fontWeight === 'bold'
                    ? 'border-[#10233f] bg-[#10233f] text-white'
                    : 'border-[#d8cebf] bg-white text-[#10233f] hover:bg-[#f5ede4]',
                )}
              >B</button>
              <button
                type="button"
                onClick={() => applyProp('fontStyle', textState.fontStyle === 'italic' ? 'normal' : 'italic')}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-r-lg border-y border-r text-sm italic transition-all',
                  textState.fontStyle === 'italic'
                    ? 'border-[#10233f] bg-[#10233f] text-white'
                    : 'border-[#d8cebf] bg-white text-[#10233f] hover:bg-[#f5ede4]',
                )}
              >I</button>
            </div>

            <div className="flex">
              {(['left', 'center', 'right'] as const).map((a, i) => {
                const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => applyProp('textAlign', a)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center border text-[#10233f] transition-all',
                      i === 0 ? 'rounded-l-lg' : i === 2 ? 'rounded-r-lg border-l-0' : 'border-l-0',
                      textState.textAlign === a
                        ? 'border-[#10233f] bg-[#10233f] text-white'
                        : 'border-[#d8cebf] bg-white hover:bg-[#f5ede4]',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>

            <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[#d8cebf] bg-white" title="Text color">
              <div className="h-4 w-4 rounded-sm border border-black/10" style={{ backgroundColor: textState.fill }} />
              <input
                type="color"
                value={textState.fill}
                onChange={(e) => applyProp('fill', e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>

            <div className="h-5 w-px bg-[#e8dfd1]" />
          </>
        )}

        {/* Layer order */}
        {hasObj && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={bringForward}
              className="flex h-8 items-center gap-1 rounded-lg border border-[#d8cebf] bg-white px-2.5 text-xs text-[#10233f] hover:bg-[#f5ede4]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Forward
            </button>
            <button
              type="button"
              onClick={sendBackward}
              className="flex h-8 items-center gap-1 rounded-lg border border-[#d8cebf] bg-white px-2.5 text-xs text-[#10233f] hover:bg-[#f5ede4]"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
        )}

        {hasObj && (
          <button
            type="button"
            onClick={deleteSelected}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </div>

      {/* Canvas area
          IMPORTANT: containerRef must be a plain unstyled div.
          overflow-hidden on the same element Fabric.js appends to suppresses
          pointer events on its absolutely-positioned upper-canvas layer,
          breaking all click-selection. Visual shadow/radius live on the wrapper. */}
      <div className="flex items-center justify-center bg-[#16213e] p-6 md:p-8">
        <div
          className="shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]"
          style={{ lineHeight: 0 }}
        >
          <div ref={containerRef} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 border-t border-[#ede6da] bg-[#faf7f2] px-5 py-2.5">
        <p className="text-xs text-[#5d6777]">
          {isText
            ? 'Double-click text to type · Drag to move · Corner handles to resize'
            : hasObj
            ? 'Drag to move · Corner handles to resize & rotate · Click outside to deselect'
            : 'Use the toolbar above to add text or images on top of the poster'}
        </p>
        <p className="shrink-0 text-xs text-[#8b7559]">{posterWidth} × {posterHeight} px</p>
      </div>
    </div>
  )
}
