'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ZoomIn, ZoomOut, Maximize, FolderPlus, FileText, 
  Hand, MousePointer, Grid3X3, Circle, X,
  Sun, Moon, Plus, Palette, Trash2, Download, Upload,
  Square, Triangle, Minus, Link2, Code2, Type
} from 'lucide-react'
import dynamic from 'next/dynamic'

// Dynamic import for tldraw (no SSR)
const TldrawCanvas = dynamic(() => import('@/components/TldrawCanvas').then(mod => mod.TldrawCanvas), { ssr: false })

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

interface Note {
  id: string
  title: string
  content: string
  canvasX: number
  canvasY: number
  canvasWidth: number
  canvasHeight: number
  type: 'TEXT' | 'CANVAS' | 'STICKY'
  tags: string[]
  folderId?: string
  color?: string
}

interface Folder {
  id: string
  name: string
  color?: string
  icon?: string
  canvasX: number
  canvasY: number
  canvasWidth: number
  canvasHeight: number
  parentId?: string
}

// Canvas Elements (shapes, lines, text, etc.)
interface CanvasElement {
  id: string
  type: 'shape' | 'line' | 'arrow' | 'text' | 'simblock'
  x: number
  y: number
  width: number
  height: number
  // For lines/arrows
  endX?: number
  endY?: number
  // Style
  color: string
  strokeColor: string
  strokeWidth: number
  fill: boolean
  // Shape specific
  shapeType?: 'rectangle' | 'circle' | 'triangle' | 'diamond'
  // Text specific
  text?: string
  fontSize?: number
  // SimBlock specific
  blockType?: 'input' | 'process' | 'output' | 'condition' | 'loop'
  code?: string
  // Connection
  connectedTo?: string
}

type GridType = 'dots' | 'lines' | 'none'

type ToolType = 'select' | 'pan' | 'note' | 'folder' | 'canvas' | 'sticky' | 
  'text' | 'shape' | 'line' | 'arrow' | 'connect' | 'simblock'

const STORAGE_KEY = 'neural-notebook-data'
const STICKY_COLORS = ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa', '#e9d5ff']
const FOLDER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
const SHAPE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

const SIM_BLOCK_TYPES = [
  { type: 'input', label: 'Input', color: '#22c55e', icon: '📥' },
  { type: 'process', label: 'Process', color: '#3b82f6', icon: '⚙️' },
  { type: 'output', label: 'Output', color: '#f59e0b', icon: '📤' },
  { type: 'condition', label: 'Condition', color: '#8b5cf6', icon: '❓' },
  { type: 'loop', label: 'Loop', color: '#ef4444', icon: '🔄' },
]

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function NeuralNotebook() {
  // Canvas State
  const canvasRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [gridType, setGridType] = useState<GridType>('dots')
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Data State
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'note' | 'folder' | 'element' | null>(null)
  
  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })
  const [currentElement, setCurrentElement] = useState<CanvasElement | null>(null)
  const [shapeType, setShapeType] = useState<'rectangle' | 'circle' | 'triangle' | 'diamond'>('rectangle')
  const [selectedColor, setSelectedColor] = useState(SHAPE_COLORS[0])
  
  // UI State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [editingElement, setEditingElement] = useState<CanvasElement | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  
  // Element drag
  const [elementDrag, setElementDrag] = useState<{
    id: string
    type: 'note' | 'folder' | 'element'
    startX: number
    startY: number
    elementStartX: number
    elementStartY: number
  } | null>(null)

  // ═════════════════════════════════════════════════════════════════
  // LOAD & SAVE DATA
  // ═════════════════════════════════════════════════════════════════

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        requestAnimationFrame(() => {
          if (data.notes) setNotes(data.notes)
          if (data.folders) setFolders(data.folders)
          if (data.canvasElements) setCanvasElements(data.canvasElements)
          if (data.viewport) setViewport(data.viewport)
          if (data.gridType) setGridType(data.gridType)
          if (data.theme) setTheme(data.theme)
          setIsLoaded(true)
        })
      } catch (e) {
        console.error('Failed to load data:', e)
        requestAnimationFrame(() => setIsLoaded(true))
      }
    } else {
      requestAnimationFrame(() => setIsLoaded(true))
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    const data = { notes, folders, canvasElements, viewport, gridType, theme }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [notes, folders, canvasElements, viewport, gridType, theme, isLoaded])

  // ═════════════════════════════════════════════════════════════════
  // ELEMENT CREATION
  // ═════════════════════════════════════════════════════════════════

  const createNote = useCallback((x: number, y: number, type: 'TEXT' | 'CANVAS' | 'STICKY' = 'TEXT') => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: type === 'CANVAS' ? 'Neue Canvas' : type === 'STICKY' ? 'Sticky Note' : 'Neue Notiz',
      content: '',
      canvasX: x,
      canvasY: y,
      canvasWidth: type === 'STICKY' ? 200 : type === 'CANVAS' ? 400 : 320,
      canvasHeight: type === 'STICKY' ? 200 : type === 'CANVAS' ? 300 : 400,
      type,
      tags: [],
      color: type === 'STICKY' ? STICKY_COLORS[0] : undefined
    }
    setNotes(prev => [...prev, newNote])
    setSelectedId(newNote.id)
    setSelectedType('note')
    if (type === 'CANVAS') setEditingNote(newNote)
    return newNote
  }, [])

  const createFolder = useCallback((x: number, y: number) => {
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: 'Neuer Ordner',
      color: FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      canvasX: x,
      canvasY: y,
      canvasWidth: 240,
      canvasHeight: 180
    }
    setFolders(prev => [...prev, newFolder])
    setSelectedId(newFolder.id)
    setSelectedType('folder')
    return newFolder
  }, [])

  const createCanvasElement = useCallback((element: Omit<CanvasElement, 'id'>) => {
    const newElement: CanvasElement = {
      ...element,
      id: `element-${Date.now()}`
    }
    setCanvasElements(prev => [...prev, newElement])
    setSelectedId(newElement.id)
    setSelectedType('element')
    return newElement
  }, [])

  const updateNote = useCallback((id: string, changes: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n))
  }, [])

  const updateFolder = useCallback((id: string, changes: Partial<Folder>) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f))
  }, [])

  const updateCanvasElement = useCallback((id: string, changes: Partial<CanvasElement>) => {
    setCanvasElements(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e))
  }, [])

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedId === id) { setSelectedId(null); setSelectedType(null) }
  }, [selectedId])

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id))
    if (selectedId === id) { setSelectedId(null); setSelectedType(null) }
  }, [selectedId])

  const deleteCanvasElement = useCallback((id: string) => {
    setCanvasElements(prev => prev.filter(e => e.id !== id))
    if (selectedId === id) { setSelectedId(null); setSelectedType(null) }
  }, [selectedId])

  // ═════════════════════════════════════════════════════════════════
  // CANVAS INTERACTION
  // ═════════════════════════════════════════════════════════════════

  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (e.clientX - rect.left - viewport.x) / viewport.zoom,
      y: (e.clientY - rect.top - viewport.y) / viewport.zoom
    }
  }, [viewport])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)
    
    // Pan mode
    if (e.button === 1 || (e.button === 0 && activeTool === 'pan')) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y })
      return
    }
    
    // Select mode - deselect
    if (e.button === 0 && activeTool === 'select') {
      setSelectedId(null)
      setSelectedType(null)
      return
    }
    
    // Drawing modes
    if (e.button === 0) {
      const drawingTools: ToolType[] = ['note', 'folder', 'canvas', 'sticky', 'text', 'shape', 'line', 'arrow', 'simblock']
      
      if (drawingTools.includes(activeTool)) {
        setIsDrawing(true)
        setDrawStart(coords)
        
        // Create initial element for shapes/lines/text
        if (activeTool === 'shape') {
          setCurrentElement({
            id: 'temp',
            type: 'shape',
            x: coords.x,
            y: coords.y,
            width: 0,
            height: 0,
            color: selectedColor,
            strokeColor: selectedColor,
            strokeWidth: 2,
            fill: false,
            shapeType
          })
        } else if (activeTool === 'line' || activeTool === 'arrow') {
          setCurrentElement({
            id: 'temp',
            type: activeTool,
            x: coords.x,
            y: coords.y,
            width: 0,
            height: 0,
            endX: coords.x,
            endY: coords.y,
            color: selectedColor,
            strokeColor: selectedColor,
            strokeWidth: 2,
            fill: false
          })
        } else if (activeTool === 'text') {
          setCurrentElement({
            id: 'temp',
            type: 'text',
            x: coords.x,
            y: coords.y,
            width: 200,
            height: 40,
            color: selectedColor,
            strokeColor: selectedColor,
            strokeWidth: 1,
            fill: false,
            text: 'Text'
          })
        } else if (activeTool === 'simblock') {
          setCurrentElement({
            id: 'temp',
            type: 'simblock',
            x: coords.x,
            y: coords.y,
            width: 160,
            height: 80,
            color: SIM_BLOCK_TYPES[0].color,
            strokeColor: '#333',
            strokeWidth: 2,
            fill: true,
            blockType: 'process',
            code: '// Code hier'
          })
        } else if (activeTool === 'note') {
          createNote(coords.x, coords.y, 'TEXT')
        } else if (activeTool === 'folder') {
          createFolder(coords.x, coords.y)
        } else if (activeTool === 'canvas') {
          createNote(coords.x, coords.y, 'CANVAS')
        } else if (activeTool === 'sticky') {
          createNote(coords.x, coords.y, 'STICKY')
        }
      }
    }
  }, [activeTool, viewport, getCanvasCoords, createNote, createFolder, shapeType, selectedColor])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    // Panning
    if (isDragging) {
      setViewport(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }))
      return
    }
    
    // Drawing
    if (isDrawing && currentElement) {
      const coords = getCanvasCoords(e)
      
      if (currentElement.type === 'shape') {
        const width = coords.x - drawStart.x
        const height = coords.y - drawStart.y
        setCurrentElement(prev => prev ? {
          ...prev,
          x: width < 0 ? coords.x : drawStart.x,
          y: height < 0 ? coords.y : drawStart.y,
          width: Math.abs(width),
          height: Math.abs(height)
        } : null)
      } else if (currentElement.type === 'line' || currentElement.type === 'arrow') {
        setCurrentElement(prev => prev ? {
          ...prev,
          endX: coords.x,
          endY: coords.y
        } : null)
      }
    }
  }, [isDragging, dragStart, isDrawing, currentElement, drawStart, getCanvasCoords])

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false)
    
    if (isDrawing && currentElement && currentElement.id === 'temp') {
      // Finalize the element
      const { ...elementData } = currentElement
      createCanvasElement(elementData)
      setCurrentElement(null)
    }
    
    setIsDrawing(false)
    setElementDrag(null)
  }, [isDrawing, currentElement, createCanvasElement])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setViewport(prev => ({
        ...prev,
        zoom: Math.min(Math.max(prev.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.1), 5)
      }))
    }
  }, [])

  // ═════════════════════════════════════════════════════════════════
  // ELEMENT DRAG & DROP
  // ═════════════════════════════════════════════════════════════════

  const handleElementMouseDown = useCallback((e: React.MouseEvent, id: string, type: 'note' | 'folder' | 'element') => {
    e.stopPropagation()
    setSelectedId(id)
    setSelectedType(type)
    
    let element: { canvasX: number; canvasY: number } | undefined
    if (type === 'note') element = notes.find(n => n.id === id)
    else if (type === 'folder') element = folders.find(f => f.id === id)
    else if (type === 'element') element = canvasElements.find(el => el.id === id)
    
    if (element) {
      setElementDrag({
        id,
        type,
        startX: e.clientX,
        startY: e.clientY,
        elementStartX: element.canvasX ?? element.x,
        elementStartY: element.canvasY ?? element.y
      })
    }
  }, [notes, folders, canvasElements])

  useEffect(() => {
    if (!elementDrag) return
    
    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - elementDrag.startX) / viewport.zoom
      const dy = (e.clientY - elementDrag.startY) / viewport.zoom
      
      if (elementDrag.type === 'note') {
        updateNote(elementDrag.id, { canvasX: elementDrag.elementStartX + dx, canvasY: elementDrag.elementStartY + dy })
      } else if (elementDrag.type === 'folder') {
        updateFolder(elementDrag.id, { canvasX: elementDrag.elementStartX + dx, canvasY: elementDrag.elementStartY + dy })
      } else if (elementDrag.type === 'element') {
        updateCanvasElement(elementDrag.id, { x: elementDrag.elementStartX + dx, y: elementDrag.elementStartY + dy })
      }
    }
    
    const handleMouseUp = () => setElementDrag(null)
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [elementDrag, viewport.zoom, updateNote, updateFolder, updateCanvasElement])

  // ═════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═════════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      const key = e.key.toLowerCase()
      
      if ((key === 'delete' || key === 'backspace') && selectedId) {
        e.preventDefault()
        if (selectedType === 'note') deleteNote(selectedId)
        else if (selectedType === 'folder') deleteFolder(selectedId)
        else if (selectedType === 'element') deleteCanvasElement(selectedId)
      }
      else if (key === 'escape') { setSelectedId(null); setSelectedType(null); setEditingNote(null); setEditingElement(null) }
      else if (key === 'v') setActiveTool('select')
      else if (key === 'h') setActiveTool('pan')
      else if (key === 'n') setActiveTool('note')
      else if (key === 'f') setActiveTool('folder')
      else if (key === 'c') setActiveTool('canvas')
      else if (key === 's') setActiveTool('sticky')
      else if (key === 't') setActiveTool('text')
      else if (key === 'r') { setActiveTool('shape'); setShapeType('rectangle') }
      else if (key === 'o') { setActiveTool('shape'); setShapeType('circle') }
      else if (key === 'l') setActiveTool('line')
      else if (key === 'a') setActiveTool('arrow')
      else if (key === 'b') setActiveTool('simblock')
      else if (key === '+' || key === '=') setViewport(prev => ({ ...prev, zoom: prev.zoom * 1.2 }))
      else if (key === '-') setViewport(prev => ({ ...prev, zoom: prev.zoom / 1.2 }))
      else if (key === '0') setViewport({ x: 0, y: 0, zoom: 1 })
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, selectedType, deleteNote, deleteFolder, deleteCanvasElement])

  // ═════════════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═════════════════════════════════════════════════════════════════

  const exportData = useCallback(() => {
    const data = { notes, folders, canvasElements, viewport, gridType, theme, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neural-notebook-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [notes, folders, canvasElements, viewport, gridType, theme])

  const importData = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (data.notes) setNotes(data.notes)
        if (data.folders) setFolders(data.folders)
        if (data.canvasElements) setCanvasElements(data.canvasElements)
        if (data.viewport) setViewport(data.viewport)
        if (data.gridType) setGridType(data.gridType)
        if (data.theme) setTheme(data.theme)
      } catch (err) {
        console.error('Import failed:', err)
      }
    }
    reader.readAsText(file)
  }, [])

  // ═════════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════════

  const openNote = useCallback((note: Note) => {
    setViewport(prev => ({
      ...prev,
      x: -note.canvasX * prev.zoom + 200,
      y: -note.canvasY * prev.zoom + 200
    }))
    setSelectedId(note.id)
    setSelectedType('note')
    if (note.type === 'CANVAS') setEditingNote(note)
  }, [])

  const canvasNotes = notes.filter(n => n.type === 'CANVAS')

  // ═════════════════════════════════════════════════════════════════
  // RENDER ELEMENT
  // ═════════════════════════════════════════════════════════════════

  const renderCanvasElement = useCallback((element: CanvasElement) => {
    const isSelected = selectedId === element.id && selectedType === 'element'
    
    const commonProps = {
      className: `absolute cursor-move ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`,
      style: { left: element.x, top: element.y },
      onMouseDown: (e: React.MouseEvent) => handleElementMouseDown(e, element.id, 'element'),
      onDoubleClick: () => setEditingElement(element)
    }

    if (element.type === 'shape') {
      if (element.shapeType === 'circle') {
        return (
          <div key={element.id} {...commonProps}>
            <div 
              className="rounded-full"
              style={{ 
                width: element.width, 
                height: element.height,
                border: `${element.strokeWidth}px solid ${element.strokeColor}`,
                backgroundColor: element.fill ? element.color : 'transparent'
              }}
            />
            {isSelected && (
              <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
                onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      }
      
      if (element.shapeType === 'triangle') {
        return (
          <div key={element.id} {...commonProps}>
            <svg width={element.width} height={element.height} viewBox={`0 0 ${element.width} ${element.height}`}>
              <polygon 
                points={`${element.width/2},0 ${element.width},${element.height} 0,${element.height}`}
                fill={element.fill ? element.color : 'transparent'}
                stroke={element.strokeColor}
                strokeWidth={element.strokeWidth}
              />
            </svg>
            {isSelected && (
              <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
                onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      }
      
      if (element.shapeType === 'diamond') {
        return (
          <div key={element.id} {...commonProps}>
            <svg width={element.width} height={element.height} viewBox={`0 0 ${element.width} ${element.height}`}>
              <polygon 
                points={`${element.width/2},0 ${element.width},${element.height/2} ${element.width/2},${element.height} 0,${element.height/2}`}
                fill={element.fill ? element.color : 'transparent'}
                stroke={element.strokeColor}
                strokeWidth={element.strokeWidth}
              />
            </svg>
            {isSelected && (
              <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
                onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      }
      
      // Rectangle (default)
      return (
        <div key={element.id} {...commonProps}>
          <div 
            className="rounded"
            style={{ 
              width: element.width, 
              height: element.height,
              border: `${element.strokeWidth}px solid ${element.strokeColor}`,
              backgroundColor: element.fill ? element.color : 'transparent'
            }}
          />
          {isSelected && (
            <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
              onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )
    }
    
    if (element.type === 'line' || element.type === 'arrow') {
      const dx = (element.endX || element.x) - element.x
      const dy = (element.endY || element.y) - element.y
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      
      return (
        <div key={element.id} 
          className={`absolute cursor-move ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
          style={{ left: element.x, top: element.y }}
          onMouseDown={(e) => handleElementMouseDown(e, element.id, 'element')}>
          <svg 
            width={length + 20} 
            height={Math.abs(dy) + 20}
            style={{ overflow: 'visible' }}
          >
            <line
              x1={10}
              y1={10}
              x2={length + 10}
              y2={dy + 10}
              stroke={element.strokeColor}
              strokeWidth={element.strokeWidth}
              markerEnd={element.type === 'arrow' ? 'url(#arrowhead)' : undefined}
            />
            {element.type === 'arrow' && (
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill={element.strokeColor} />
                </marker>
              </defs>
            )}
          </svg>
          {isSelected && (
            <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
              onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )
    }
    
    if (element.type === 'text') {
      return (
        <div key={element.id} {...commonProps}>
          <div 
            className="px-2 py-1 min-w-[50px]"
            style={{ 
              fontSize: element.fontSize || 14,
              color: element.color
            }}
          >
            {element.text || 'Text'}
          </div>
          {isSelected && (
            <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
              onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )
    }
    
    if (element.type === 'simblock') {
      const blockInfo = SIM_BLOCK_TYPES.find(b => b.type === element.blockType) || SIM_BLOCK_TYPES[1]
      
      return (
        <div key={element.id} {...commonProps}>
          <Card 
            className="flex flex-col overflow-hidden shadow-lg"
            style={{ 
              width: element.width, 
              height: element.height,
              borderColor: blockInfo.color,
              borderWidth: 2
            }}
          >
            <div className="px-2 py-1 text-xs font-bold flex items-center gap-1" style={{ backgroundColor: blockInfo.color }}>
              <span>{blockInfo.icon}</span>
              <span className="text-white">{blockInfo.label}</span>
            </div>
            <div className="flex-1 p-2 text-xs font-mono bg-zinc-900 text-zinc-300 overflow-hidden">
              {element.code || '// code'}
            </div>
          </Card>
          {isSelected && (
            <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
              onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )
    }
    
    return null
  }, [selectedId, selectedType, handleElementMouseDown, deleteCanvasElement])

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  if (!isLoaded) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${theme === 'dark' ? 'bg-zinc-950' : 'bg-zinc-100'}`}>
        <div className="text-2xl">🧠 Loading Neural Notebook...</div>
      </div>
    )
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      {/* HEADER */}
      <header className={`h-12 shrink-0 flex items-center justify-between px-4 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border-b`}>
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-xl">🧠</span> Neural Notebook
          </h1>
          <Separator orientation="vertical" className="h-6" />
          
          {/* Tools */}
          <div className="flex items-center gap-1">
            {/* Select & Pan */}
            <Button size="icon" variant={activeTool === 'select' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('select')} className="h-8 w-8" title="Select (V)">
              <MousePointer className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'pan' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('pan')} className="h-8 w-8" title="Pan (H)">
              <Hand className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Notes */}
            <Button size="icon" variant={activeTool === 'note' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('note')} className="h-8 w-8" title="Note (N)">
              <FileText className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'folder' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('folder')} className="h-8 w-8" title="Folder (F)">
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'canvas' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('canvas')} className="h-8 w-8" title="Canvas (C)">
              <Palette className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* Drawing Tools */}
            <Button size="icon" variant={activeTool === 'text' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('text')} className="h-8 w-8" title="Text (T)">
              <Type className="h-4 w-4" />
            </Button>
            
            {/* Shape Selector */}
            <div className="relative">
              <Button size="icon" variant={activeTool === 'shape' ? 'default' : 'ghost'} 
                onClick={() => setActiveTool('shape')} className="h-8 w-8" title="Shape (R/O)">
                {shapeType === 'circle' ? <Circle className="h-4 w-4" /> : 
                 shapeType === 'triangle' ? <Triangle className="h-4 w-4" /> : 
                 shapeType === 'diamond' ? <Square className="h-4 w-4 rotate-45" /> :
                 <Square className="h-4 w-4" />}
              </Button>
              {activeTool === 'shape' && (
                <div className={`absolute top-10 left-0 z-50 flex gap-1 p-1 rounded-md shadow-lg ${theme === 'dark' ? 'bg-zinc-800' : 'bg-white border'}`}>
                  {[
                    { type: 'rectangle' as const, icon: Square },
                    { type: 'circle' as const, icon: Circle },
                    { type: 'triangle' as const, icon: Triangle },
                  ].map(({ type, icon: Icon }) => (
                    <Button key={type} size="icon" variant={shapeType === type ? 'default' : 'ghost'} 
                      onClick={() => setShapeType(type)} className="h-7 w-7">
                      <Icon className="h-3 w-3" />
                    </Button>
                  ))}
                </div>
              )}
            </div>
            
            <Button size="icon" variant={activeTool === 'line' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('line')} className="h-8 w-8" title="Line (L)">
              <Minus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'arrow' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('arrow')} className="h-8 w-8" title="Arrow (A)">
              <Minus className="h-4 w-4 rotate-45" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            {/* SimBlock */}
            <Button size="icon" variant={activeTool === 'simblock' ? 'default' : 'ghost'} 
              onClick={() => setActiveTool('simblock')} className="h-8 w-8" title="Sim Block (B)">
              <Code2 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Color Picker */}
          {(activeTool === 'shape' || activeTool === 'line' || activeTool === 'arrow' || activeTool === 'text') && (
            <div className="flex items-center gap-1 ml-2">
              {SHAPE_COLORS.slice(0, 6).map(color => (
                <button key={color} 
                  className={`w-5 h-5 rounded-full ${selectedColor === color ? 'ring-2 ring-white ring-offset-1' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)} />
              ))}
            </div>
          )}
        </div>

        {/* Center - Zoom */}
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setViewport(prev => ({ ...prev, zoom: prev.zoom / 1.2 }))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-16 text-center">{Math.round(viewport.zoom * 100)}%</span>
          <Button size="icon" variant="ghost" onClick={() => setViewport(prev => ({ ...prev, zoom: prev.zoom * 1.2 }))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}>
            <Maximize className="h-4 w-4" />
          </Button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {/* Grid */}
          <div className={`flex items-center gap-1 rounded-md p-1 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
            {(['dots', 'lines', 'none'] as GridType[]).map(g => (
              <Button key={g} size="icon" variant={gridType === g ? 'secondary' : 'ghost'} 
                onClick={() => setGridType(g)} className="h-6 w-6">
                {g === 'dots' ? <Circle className="h-3 w-3" /> : g === 'lines' ? <Grid3X3 className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </Button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6" />

          <Button size="icon" variant="ghost" onClick={exportData} title="Export">
            <Download className="h-4 w-4" />
          </Button>
          <label title="Import">
            <Button size="icon" variant="ghost" asChild>
              <span><Upload className="h-4 w-4" /></span>
            </Button>
            <input type="file" accept=".json" onChange={importData} className="hidden" />
          </label>

          <Button size="icon" variant="ghost" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* MAIN */}
      <div className="flex-1 relative overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <div className={`absolute left-0 top-0 bottom-0 w-64 z-20 flex flex-col ${theme === 'dark' ? 'bg-zinc-900/95 border-zinc-800' : 'bg-white/95 border-zinc-200'} border-r`}>
            <Tabs defaultValue="canvas" className="flex-1 flex flex-col">
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <TabsList className={theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}>
                  <TabsTrigger value="canvas" className="text-xs">🎨 Canvas</TabsTrigger>
                  <TabsTrigger value="elements" className="text-xs">📐 Elements</TabsTrigger>
                </TabsList>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowSidebar(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <TabsContent value="canvas" className="flex-1 mt-0 overflow-hidden">
                <ScrollArea className="h-full px-3">
                  <div className="py-2">
                    <Button className="w-full mb-4" onClick={() => createNote(
                      (-viewport.x + 400) / viewport.zoom,
                      (-viewport.y + 300) / viewport.zoom,
                      'CANVAS'
                    )}>
                      <Plus className="h-4 w-4 mr-2" /> Neue Canvas
                    </Button>
                    
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-500 mb-2 px-2">Canvas ({canvasNotes.length})</div>
                      {canvasNotes.map(note => (
                        <div key={note.id} 
                          className={`flex items-center gap-2 p-3 rounded-md cursor-pointer transition-colors ${
                            selectedId === note.id ? 'bg-blue-600 text-white' : theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                          }`}
                          onClick={() => openNote(note)}>
                          <Palette className="h-5 w-5 text-blue-400" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate text-sm">{note.title}</div>
                          </div>
                          <Button size="icon" variant="ghost" className={`h-6 w-6 ${selectedId === note.id ? 'text-white' : ''}`}
                            onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="elements" className="flex-1 mt-0 overflow-hidden">
                <ScrollArea className="h-full px-3">
                  <div className="py-2 space-y-2">
                    <div className="text-xs text-zinc-500 px-2">Canvas Elements ({canvasElements.length})</div>
                    
                    {/* Quick Add Buttons */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <Button size="sm" variant="outline" onClick={() => {
                        setActiveTool('simblock')
                        createCanvasElement({
                          type: 'simblock',
                          x: (-viewport.x + 200) / viewport.zoom,
                          y: (-viewport.y + 200) / viewport.zoom,
                          width: 160,
                          height: 80,
                          color: SIM_BLOCK_TYPES[0].color,
                          strokeColor: '#333',
                          strokeWidth: 2,
                          fill: true,
                          blockType: 'input',
                          code: '// Input'
                        })
                      }}>
                        📥 Input
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        createCanvasElement({
                          type: 'simblock',
                          x: (-viewport.x + 200) / viewport.zoom,
                          y: (-viewport.y + 200) / viewport.zoom,
                          width: 160,
                          height: 80,
                          color: SIM_BLOCK_TYPES[1].color,
                          strokeColor: '#333',
                          strokeWidth: 2,
                          fill: true,
                          blockType: 'process',
                          code: '// Process'
                        })
                      }}>
                        ⚙️ Process
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        createCanvasElement({
                          type: 'simblock',
                          x: (-viewport.x + 200) / viewport.zoom,
                          y: (-viewport.y + 200) / viewport.zoom,
                          width: 160,
                          height: 80,
                          color: SIM_BLOCK_TYPES[3].color,
                          strokeColor: '#333',
                          strokeWidth: 2,
                          fill: true,
                          blockType: 'condition',
                          code: '// Condition'
                        })
                      }}>
                        ❓ Condition
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        createCanvasElement({
                          type: 'simblock',
                          x: (-viewport.x + 200) / viewport.zoom,
                          y: (-viewport.y + 200) / viewport.zoom,
                          width: 160,
                          height: 80,
                          color: SIM_BLOCK_TYPES[4].color,
                          strokeColor: '#333',
                          strokeWidth: 2,
                          fill: true,
                          blockType: 'loop',
                          code: '// Loop'
                        })
                      }}>
                        🔄 Loop
                      </Button>
                    </div>
                    
                    {canvasElements.map(element => (
                      <div key={element.id} 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                          selectedId === element.id ? 'bg-blue-600 text-white' : theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                        }`}
                        onClick={() => { setSelectedId(element.id); setSelectedType('element') }}
                        onDoubleClick={() => setEditingElement(element)}>
                        <span className="text-lg">
                          {element.type === 'shape' ? '🔷' : 
                           element.type === 'line' ? '➖' :
                           element.type === 'arrow' ? '➡️' :
                           element.type === 'text' ? '📝' :
                           element.type === 'simblock' ? '⚙️' : '❓'}
                        </span>
                        <span className="text-sm truncate flex-1">
                          {element.type === 'simblock' ? element.blockType : element.type}
                        </span>
                        <Button size="icon" variant="ghost" className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); deleteCanvasElement(element.id) }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Canvas */}
        <div ref={canvasRef}
          className={`absolute inset-0 ${isDragging ? 'cursor-grabbing' : activeTool === 'pan' ? 'cursor-grab' : 'cursor-default'}`}
          onMouseDown={handleCanvasMouseDown} 
          onMouseMove={handleCanvasMouseMove} 
          onMouseUp={handleCanvasMouseUp} 
          onMouseLeave={handleCanvasMouseUp} 
          onWheel={handleWheel}
          style={{ background: theme === 'dark' ? 'linear-gradient(to bottom, #09090b, #18181b)' : 'linear-gradient(to bottom, #f4f4f5, #e4e4e7)' }}>
          
          {/* Grid */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {gridType === 'dots' && (
              <pattern id="dotGrid" width={20} height={20} patternUnits="userSpaceOnUse">
                <circle cx={10} cy={10} r="1" fill={theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
              </pattern>
            )}
            {gridType === 'lines' && (
              <pattern id="lineGrid" width={20} height={20} patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeWidth="1"/>
              </pattern>
            )}
            {gridType !== 'none' && <rect width="100%" height="100%" fill={`url(#${gridType}Grid)`} />}
          </svg>

          {/* Viewport Content */}
          <div className="absolute" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}>
            
            {/* Canvas Elements */}
            {canvasElements.map(renderCanvasElement)}
            
            {/* Current Drawing Element */}
            {currentElement && currentElement.id === 'temp' && (
              <div style={{ opacity: 0.7 }}>
                {renderCanvasElement({ ...currentElement, id: 'drawing' })}
              </div>
            )}

            {/* Folders */}
            {folders.map(folder => (
              <div key={folder.id} 
                className={`absolute cursor-move ${selectedId === folder.id ? 'ring-2 ring-blue-500' : ''}`}
                style={{ left: folder.canvasX, top: folder.canvasY, width: folder.canvasWidth, height: folder.canvasHeight }}
                onMouseDown={(e) => handleElementMouseDown(e, folder.id, 'folder')}>
                <Card className={`w-full h-full overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-zinc-900/90 border-zinc-700' : 'bg-white/90 border-zinc-300'}`}
                  style={{ borderColor: folder.color, borderWidth: 2 }}>
                  <div className="p-3 h-full flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{folder.icon || '📁'}</span>
                        <span className="text-sm font-medium truncate">{folder.name}</span>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id) }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            ))}

            {/* Notes */}
            {notes.map(note => (
              <div key={note.id} 
                className={`absolute cursor-move ${selectedId === note.id ? 'ring-2 ring-green-500' : ''}`}
                style={{ left: note.canvasX, top: note.canvasY, width: note.canvasWidth, height: note.canvasHeight }}
                onMouseDown={(e) => handleElementMouseDown(e, note.id, 'note')}
                onDoubleClick={() => note.type === 'CANVAS' ? openNote(note) : setEditingNote(note)}>
                
                {note.type === 'STICKY' ? (
                  <div className="w-full h-full rounded-lg shadow-lg p-3 flex flex-col" style={{ backgroundColor: note.color || '#fef08a' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm text-zinc-800 truncate">{note.title}</span>
                      <Button size="icon" variant="ghost" className="h-5 w-5 opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}>
                        <X className="h-3 w-3 text-zinc-600" />
                      </Button>
                    </div>
                    <div className="flex-1 text-sm text-zinc-700 whitespace-pre-wrap line-clamp-4">{note.content || '...'}</div>
                  </div>
                ) : note.type === 'CANVAS' ? (
                  <Card className={`w-full h-full overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-zinc-900/90 border-zinc-700' : 'bg-white/90 border-zinc-300'}`}>
                    <div className={`p-2 border-b ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-200 bg-zinc-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Palette className="h-4 w-4 text-blue-500" />
                          <span className="font-medium truncate text-sm">{note.title}</span>
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-60 hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 bg-zinc-100 flex items-center justify-center">
                      <div className="text-zinc-400 text-xs text-center">
                        <Palette className="h-6 w-6 mx-auto mb-1" />
                        Canvas
                      </div>
                    </div>
                  </Card>
                ) : (
                  <Card className={`w-full h-full overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-zinc-900/90 border-zinc-700' : 'bg-white/90 border-zinc-300'}`}>
                    <div className={`p-3 border-b ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-200 bg-zinc-50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{note.title}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-60 hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 p-3 overflow-hidden">
                      <div className={`text-sm whitespace-pre-wrap line-clamp-6 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        {note.content || <span className="italic opacity-60">Leere Notiz...</span>}
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Toggle Sidebar */}
        {!showSidebar && (
          <Button size="icon" variant="outline" className="absolute left-4 top-4 z-10" onClick={() => setShowSidebar(true)}>
            <Grid3X3 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* FOOTER */}
      <footer className={`h-8 shrink-0 flex items-center justify-between px-4 text-xs ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-white border-zinc-200 text-zinc-600'} border-t`}>
        <div className="flex items-center gap-4">
          <span>Position: {Math.round(-viewport.x / viewport.zoom)}, {Math.round(-viewport.y / viewport.zoom)}</span>
          <span>|</span>
          <span>{notes.length} Notes, {folders.length} Folders, {canvasElements.length} Elements</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Tool: {activeTool}</span>
        </div>
      </footer>

      {/* CANVAS EDITOR DIALOG */}
      <Dialog open={!!editingNote && editingNote?.type === 'CANVAS'} onOpenChange={() => setEditingNote(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Canvas: {editingNote?.title}
            </DialogTitle>
          </DialogHeader>
          {editingNote && editingNote.type === 'CANVAS' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Input value={editingNote.title} 
                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                placeholder="Canvas Name..." className="mb-4" />
              <div className="flex-1 border rounded-md overflow-hidden bg-white">
                <TldrawCanvas initialData={editingNote.content} 
                  onChange={(data) => setEditingNote({ ...editingNote, content: data })} />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
                <Button onClick={() => { updateNote(editingNote.id, { title: editingNote.title, content: editingNote.content }); setEditingNote(null) }}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ELEMENT EDITOR DIALOG */}
      <Dialog open={!!editingElement} onOpenChange={() => setEditingElement(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Element</DialogTitle>
          </DialogHeader>
          {editingElement && (
            <div className="space-y-4">
              {editingElement.type === 'text' && (
                <Input value={editingElement.text || ''} 
                  onChange={(e) => setEditingElement({ ...editingElement, text: e.target.value })}
                  placeholder="Text..." />
              )}
              
              {editingElement.type === 'simblock' && (
                <>
                  <div className="flex gap-2">
                    {SIM_BLOCK_TYPES.map(bt => (
                      <Button key={bt.type} size="sm" 
                        variant={editingElement.blockType === bt.type ? 'default' : 'outline'}
                        onClick={() => setEditingElement({ ...editingElement, blockType: bt.type as any, color: bt.color })}>
                        {bt.icon} {bt.label}
                      </Button>
                    ))}
                  </div>
                  <textarea 
                    className="w-full h-32 p-2 rounded-md border font-mono text-sm"
                    value={editingElement.code || ''}
                    onChange={(e) => setEditingElement({ ...editingElement, code: e.target.value })}
                    placeholder="// Code here..."
                  />
                </>
              )}
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingElement(null)}>Cancel</Button>
                <Button onClick={() => { 
                  updateCanvasElement(editingElement.id, editingElement); 
                  setEditingElement(null) 
                }}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TEXT/STICKY EDITOR DIALOG */}
      <Dialog open={!!editingNote && editingNote?.type !== 'CANVAS'} onOpenChange={() => setEditingNote(null)}>
        <DialogContent className="max-w-2xl h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Edit Note
            </DialogTitle>
          </DialogHeader>
          {editingNote && editingNote.type !== 'CANVAS' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Input value={editingNote.title} 
                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                placeholder="Title..." className="mb-4" />
              <textarea 
                className={`flex-1 w-full p-4 rounded-md border resize-none ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-300'}`}
                value={editingNote.content}
                onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                placeholder="Write your note..." />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
                <Button onClick={() => { updateNote(editingNote.id, { title: editingNote.title, content: editingNote.content }); setEditingNote(null) }}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
