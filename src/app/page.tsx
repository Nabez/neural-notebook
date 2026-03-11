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
  Square, Triangle, Minus, Link2, Code2, Type,
  Undo2, Redo2, Copy, Clipboard, Lock, Unlock, RotateCcw
} from 'lucide-react'
import dynamic from 'next/dynamic'

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
  rotation?: number
  locked?: boolean
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
  rotation?: number
  locked?: boolean
  parentId?: string
}

interface CanvasElement {
  id: string
  type: 'shape' | 'line' | 'arrow' | 'text' | 'simblock'
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  locked?: boolean
  endX?: number
  endY?: number
  color: string
  strokeColor: string
  strokeWidth: number
  fill: boolean
  shapeType?: 'rectangle' | 'circle' | 'triangle' | 'diamond'
  text?: string
  fontSize?: number
  blockType?: 'input' | 'process' | 'output' | 'condition' | 'loop'
  code?: string
  // Ports for SimBlock
  ports?: { id: string; type: 'input' | 'output'; x: number; y: number }[]
}

interface Connection {
  id: string
  fromId: string
  fromPort?: string
  fromAnchor: 'top' | 'right' | 'bottom' | 'left'
  toId: string
  toPort?: string
  toAnchor: 'top' | 'right' | 'bottom' | 'left'
  color: string
  strokeWidth: number
  label?: string
  animated?: boolean
}

// History for Undo/Redo
interface HistoryState {
  notes: Note[]
  folders: Folder[]
  canvasElements: CanvasElement[]
  connections: Connection[]
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

const HANDLE_SIZE = 8
const ROTATE_HANDLE_OFFSET = 20

// ═════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════

function getAnchorPosition(
  element: { x: number; y: number; width: number; height: number },
  anchor: 'top' | 'right' | 'bottom' | 'left'
): { x: number; y: number } {
  const cx = element.x + element.width / 2
  const cy = element.y + element.height / 2
  switch (anchor) {
    case 'top': return { x: cx, y: element.y }
    case 'right': return { x: element.x + element.width, y: cy }
    case 'bottom': return { x: cx, y: element.y + element.height }
    case 'left': return { x: element.x, y: cy }
  }
}

function getBestAnchor(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number }
): { fromAnchor: 'top' | 'right' | 'bottom' | 'left'; toAnchor: 'top' | 'right' | 'bottom' | 'left' } {
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  const toCx = to.x + to.width / 2
  const toCy = to.y + to.height / 2
  
  const dx = toCx - fromCx
  const dy = toCy - fromCy
  
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 
      ? { fromAnchor: 'right', toAnchor: 'left' }
      : { fromAnchor: 'left', toAnchor: 'right' }
  } else {
    return dy > 0 
      ? { fromAnchor: 'bottom', toAnchor: 'top' }
      : { fromAnchor: 'top', toAnchor: 'bottom' }
  }
}

function rotatePoint(px: number, py: number, cx: number, cy: number, angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const nx = cos * (px - cx) - sin * (py - cy) + cx
  const ny = sin * (px - cx) + cos * (py - cy) + cy
  return { x: nx, y: ny }
}

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
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedType, setSelectedType] = useState<'note' | 'folder' | 'element' | 'connection' | null>(null)
  
  // Multi-select
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  
  // Resize/Rotate
  const [resizing, setResizing] = useState<{ id: string; handle: string; startX: number; startY: number; startBounds: any } | null>(null)
  const [rotating, setRotating] = useState<{ id: string; startAngle: number; startRotation: number; cx: number; cy: number } | null>(null)
  
  // History (Undo/Redo)
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedo = useRef(false)
  
  // Clipboard
  const [clipboard, setClipboard] = useState<{ elements: CanvasElement[]; notes: Note[] } | null>(null)
  
  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })
  const [currentElement, setCurrentElement] = useState<CanvasElement | null>(null)
  const [shapeType, setShapeType] = useState<'rectangle' | 'circle' | 'triangle' | 'diamond'>('rectangle')
  const [selectedColor, setSelectedColor] = useState(SHAPE_COLORS[0])
  
  // Connect State
  const [connectStart, setConnectStart] = useState<{ id: string; type: 'element' | 'note' | 'folder'; port?: string } | null>(null)
  const [connectEnd, setConnectEnd] = useState<{ x: number; y: number } | null>(null)
  
  // UI State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [editingElement, setEditingElement] = useState<CanvasElement | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  
  // Element drag
  const [elementDrag, setElementDrag] = useState<{
    ids: string[]
    type: 'note' | 'folder' | 'element'
    startX: number
    startY: number
    startPositions: Map<string, { x: number; y: number }>
  } | null>(null)

  // ═════════════════════════════════════════════════════════════════
  // HISTORY MANAGEMENT
  // ═════════════════════════════════════════════════════════════════

  const saveToHistory = useCallback(() => {
    if (isUndoRedo.current) return
    
    const state: HistoryState = {
      notes: JSON.parse(JSON.stringify(notes)),
      folders: JSON.parse(JSON.stringify(folders)),
      canvasElements: JSON.parse(JSON.stringify(canvasElements)),
      connections: JSON.parse(JSON.stringify(connections))
    }
    
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(state)
      if (newHistory.length > 50) newHistory.shift()
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
  }, [notes, folders, canvasElements, connections, historyIndex])

  const undo = useCallback(() => {
    if (historyIndex <= 0) return
    isUndoRedo.current = true
    const prevState = history[historyIndex - 1]
    setNotes(prevState.notes)
    setFolders(prevState.folders)
    setCanvasElements(prevState.canvasElements)
    setConnections(prevState.connections)
    setHistoryIndex(prev => prev - 1)
    setSelectedIds(new Set())
    requestAnimationFrame(() => { isUndoRedo.current = false })
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    isUndoRedo.current = true
    const nextState = history[historyIndex + 1]
    setNotes(nextState.notes)
    setFolders(nextState.folders)
    setCanvasElements(nextState.canvasElements)
    setConnections(nextState.connections)
    setHistoryIndex(prev => prev + 1)
    setSelectedIds(new Set())
    requestAnimationFrame(() => { isUndoRedo.current = false })
  }, [history, historyIndex])

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
          if (data.connections) setConnections(data.connections)
          if (data.viewport) setViewport(data.viewport)
          if (data.gridType) setGridType(data.gridType)
          if (data.theme) setTheme(data.theme)
          setIsLoaded(true)
          // Initialize history
          setHistory([{
            notes: data.notes || [],
            folders: data.folders || [],
            canvasElements: data.canvasElements || [],
            connections: data.connections || []
          }])
          setHistoryIndex(0)
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
    const data = { notes, folders, canvasElements, connections, viewport, gridType, theme }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [notes, folders, canvasElements, connections, viewport, gridType, theme, isLoaded])

  // Save to history on changes
  useEffect(() => {
    if (!isLoaded || isUndoRedo.current) return
    const timeout = setTimeout(saveToHistory, 500)
    return () => clearTimeout(timeout)
  }, [notes, folders, canvasElements, connections, isLoaded, saveToHistory])

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
      rotation: 0,
      locked: false,
      type,
      tags: [],
      color: type === 'STICKY' ? STICKY_COLORS[0] : undefined
    }
    setNotes(prev => [...prev, newNote])
    setSelectedIds(new Set([newNote.id]))
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
      canvasHeight: 180,
      rotation: 0,
      locked: false
    }
    setFolders(prev => [...prev, newFolder])
    setSelectedIds(new Set([newFolder.id]))
    setSelectedType('folder')
    return newFolder
  }, [])

  const createCanvasElement = useCallback((element: Omit<CanvasElement, 'id'>) => {
    const newElement: CanvasElement = {
      ...element,
      id: `element-${Date.now()}`,
      rotation: element.rotation ?? 0,
      locked: element.locked ?? false
    }
    
    // Add ports for simblocks
    if (newElement.type === 'simblock') {
      newElement.ports = [
        { id: `${newElement.id}-in1`, type: 'input', x: 0, y: 30 },
        { id: `${newElement.id}-in2`, type: 'input', x: 0, y: 50 },
        { id: `${newElement.id}-out1`, type: 'output', x: 160, y: 40 },
      ]
    }
    
    setCanvasElements(prev => [...prev, newElement])
    setSelectedIds(new Set([newElement.id]))
    setSelectedType('element')
    return newElement
  }, [])

  const createConnection = useCallback((
    fromId: string,
    toId: string,
    fromPort?: string,
    toPort?: string
  ) => {
    const fromElement = canvasElements.find(e => e.id === fromId) || 
                        notes.find(n => n.id === fromId && { x: n.canvasX, y: n.canvasY, width: n.canvasWidth, height: n.canvasHeight })
    const toElement = canvasElements.find(e => e.id === toId) ||
                      notes.find(n => n.id === toId && { x: n.canvasX, y: n.canvasY, width: n.canvasWidth, height: n.canvasHeight })
    
    if (!fromElement || !toElement) return null
    
    const from = 'x' in fromElement ? fromElement : { x: fromElement.canvasX, y: fromElement.canvasY, width: fromElement.canvasWidth, height: fromElement.canvasHeight }
    const to = 'x' in toElement ? toElement : { x: toElement.canvasX, y: toElement.canvasY, width: toElement.canvasWidth, height: toElement.canvasHeight }
    
    const bestAnchors = getBestAnchor(from, to)
    
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromId,
      fromPort,
      fromAnchor: bestAnchors.fromAnchor,
      toId,
      toPort,
      toAnchor: bestAnchors.toAnchor,
      color: '#6b7280',
      strokeWidth: 2,
      animated: true
    }
    setConnections(prev => [...prev, newConnection])
    return newConnection
  }, [canvasElements, notes])

  // ═════════════════════════════════════════════════════════════════
  // UPDATE OPERATIONS
  // ═════════════════════════════════════════════════════════════════

  const updateNote = useCallback((id: string, changes: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n))
  }, [])

  const updateFolder = useCallback((id: string, changes: Partial<Folder>) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f))
  }, [])

  const updateCanvasElement = useCallback((id: string, changes: Partial<CanvasElement>) => {
    setCanvasElements(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e))
  }, [])

  const updateSelectedElements = useCallback((changes: Partial<CanvasElement>) => {
    setCanvasElements(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, ...changes } : e))
  }, [selectedIds])

  // ═════════════════════════════════════════════════════════════════
  // DELETE OPERATIONS
  // ═════════════════════════════════════════════════════════════════

  const deleteSelected = useCallback(() => {
    selectedIds.forEach(id => {
      setNotes(prev => prev.filter(n => n.id !== id))
      setFolders(prev => prev.filter(f => f.id !== id))
      setCanvasElements(prev => prev.filter(e => e.id !== id))
      setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id))
    })
    setSelectedIds(new Set())
    setSelectedType(null)
  }, [selectedIds])

  // ═════════════════════════════════════════════════════════════════
  // CLIPBOARD OPERATIONS
  // ═════════════════════════════════════════════════════════════════

  const copySelected = useCallback(() => {
    const elements = canvasElements.filter(e => selectedIds.has(e.id))
    const selectedNotes = notes.filter(n => selectedIds.has(n.id))
    setClipboard({ elements, notes: selectedNotes })
  }, [canvasElements, notes, selectedIds])

  const pasteClipboard = useCallback(() => {
    if (!clipboard) return
    
    const offset = 20
    const newElements = clipboard.elements.map(e => ({
      ...e,
      id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x: e.x + offset,
      y: e.y + offset
    }))
    
    const newNotes = clipboard.notes.map(n => ({
      ...n,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      canvasX: n.canvasX + offset,
      canvasY: n.canvasY + offset
    }))
    
    setCanvasElements(prev => [...prev, ...newElements])
    setNotes(prev => [...prev, ...newNotes])
    setSelectedIds(new Set([...newElements.map(e => e.id), ...newNotes.map(n => n.id)]))
  }, [clipboard])

  const duplicateSelected = useCallback(() => {
    copySelected()
    setTimeout(() => pasteClipboard(), 0)
  }, [copySelected, pasteClipboard])

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
    
    // Select mode - start selection box or deselect
    if (e.button === 0 && activeTool === 'select') {
      if (!e.shiftKey) {
        setSelectedIds(new Set())
        setSelectedType(null)
      }
      setSelectionBox({ startX: coords.x, startY: coords.y, endX: coords.x, endY: coords.y })
      setConnectStart(null)
      return
    }
    
    // Connect mode
    if (e.button === 0 && activeTool === 'connect') {
      return
    }
    
    // Drawing modes
    if (e.button === 0) {
      const drawingTools: ToolType[] = ['note', 'folder', 'canvas', 'sticky', 'text', 'shape', 'line', 'arrow', 'simblock']
      
      if (drawingTools.includes(activeTool)) {
        setIsDrawing(true)
        setDrawStart(coords)
        
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
    const coords = getCanvasCoords(e)
    
    // Panning
    if (isDragging) {
      setViewport(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }))
      return
    }
    
    // Selection box
    if (selectionBox && activeTool === 'select') {
      setSelectionBox(prev => prev ? { ...prev, endX: coords.x, endY: coords.y } : null)
      return
    }
    
    // Connect mode - update temp line
    if (activeTool === 'connect' && connectStart) {
      setConnectEnd(coords)
      return
    }
    
    // Resizing
    if (resizing) {
      const dx = (e.clientX - resizing.startX) / viewport.zoom
      const dy = (e.clientY - resizing.startY) / viewport.zoom
      
      const element = canvasElements.find(el => el.id === resizing.id)
      if (!element) return
      
      let newBounds = { ...resizing.startBounds }
      
      switch (resizing.handle) {
        case 'se':
          newBounds.width = Math.max(20, resizing.startBounds.width + dx)
          newBounds.height = Math.max(20, resizing.startBounds.height + dy)
          break
        case 'sw':
          newBounds.x = resizing.startBounds.x + dx
          newBounds.width = Math.max(20, resizing.startBounds.width - dx)
          newBounds.height = Math.max(20, resizing.startBounds.height + dy)
          break
        case 'ne':
          newBounds.y = resizing.startBounds.y + dy
          newBounds.width = Math.max(20, resizing.startBounds.width + dx)
          newBounds.height = Math.max(20, resizing.startBounds.height - dy)
          break
        case 'nw':
          newBounds.x = resizing.startBounds.x + dx
          newBounds.y = resizing.startBounds.y + dy
          newBounds.width = Math.max(20, resizing.startBounds.width - dx)
          newBounds.height = Math.max(20, resizing.startBounds.height - dy)
          break
      }
      
      updateCanvasElement(resizing.id, newBounds)
      return
    }
    
    // Rotating
    if (rotating) {
      const element = canvasElements.find(el => el.id === rotating.id)
      if (!element) return
      
      const angle = Math.atan2(coords.y - rotating.cy, coords.x - rotating.cx)
      const newRotation = rotating.startRotation + ((angle - rotating.startAngle) * 180) / Math.PI
      updateCanvasElement(rotating.id, { rotation: newRotation })
      return
    }
    
    // Element dragging
    if (elementDrag) {
      const dx = (e.clientX - elementDrag.startX) / viewport.zoom
      const dy = (e.clientY - elementDrag.startY) / viewport.zoom
      
      elementDrag.ids.forEach(id => {
        const startPos = elementDrag.startPositions.get(id)
        if (!startPos) return
        
        if (elementDrag.type === 'element') {
          updateCanvasElement(id, { x: startPos.x + dx, y: startPos.y + dy })
        } else if (elementDrag.type === 'note') {
          updateNote(id, { canvasX: startPos.x + dx, canvasY: startPos.y + dy })
        } else if (elementDrag.type === 'folder') {
          updateFolder(id, { canvasX: startPos.x + dx, canvasY: startPos.y + dy })
        }
      })
      return
    }
    
    // Drawing
    if (isDrawing && currentElement) {
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
  }, [isDragging, dragStart, selectionBox, activeTool, connectStart, isDrawing, currentElement, drawStart, getCanvasCoords, resizing, rotating, elementDrag, viewport.zoom, canvasElements, updateCanvasElement, updateNote, updateFolder])

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false)
    
    // Selection box complete
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX)
      const maxX = Math.max(selectionBox.startX, selectionBox.endX)
      const minY = Math.min(selectionBox.startY, selectionBox.endY)
      const maxY = Math.max(selectionBox.startY, selectionBox.endY)
      
      const selectedInBox = canvasElements.filter(e => 
        e.x >= minX && e.x + e.width <= maxX &&
        e.y >= minY && e.y + e.height <= maxY
      )
      
      if (selectedInBox.length > 0) {
        setSelectedIds(new Set(selectedInBox.map(e => e.id)))
        setSelectedType('element')
      }
      
      setSelectionBox(null)
      return
    }
    
    // Finish drawing
    if (isDrawing && currentElement && currentElement.id === 'temp') {
      const { ...elementData } = currentElement
      createCanvasElement(elementData)
      setCurrentElement(null)
    }
    
    setIsDrawing(false)
    setElementDrag(null)
    setResizing(null)
    setRotating(null)
    setConnectStart(null)
    setConnectEnd(null)
  }, [selectionBox, isDrawing, currentElement, createCanvasElement, canvasElements])

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
  // ELEMENT INTERACTION
  // ═════════════════════════════════════════════════════════════════

  const handleElementMouseDown = useCallback((e: React.MouseEvent, id: string, type: 'note' | 'folder' | 'element', portId?: string) => {
    e.stopPropagation()
    
    // Check if locked
    if (type === 'element') {
      const el = canvasElements.find(e => e.id === id)
      if (el?.locked) return
    }
    
    // Connect mode with ports
    if (activeTool === 'connect') {
      if (portId) {
        // Clicked on a port
        if (!connectStart) {
          setConnectStart({ id, type, port: portId })
        } else {
          if (connectStart.id !== id) {
            createConnection(connectStart.id, id, connectStart.port, portId)
          }
          setConnectStart(null)
          setConnectEnd(null)
        }
      } else {
        // Clicked on element body
        if (!connectStart) {
          setConnectStart({ id, type })
        } else {
          if (connectStart.id !== id) {
            createConnection(connectStart.id, id, connectStart.port)
          }
          setConnectStart(null)
          setConnectEnd(null)
        }
      }
      return
    }
    
    // Select element
    if (e.shiftKey) {
      // Multi-select
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
      setSelectedType(type)
    } else {
      if (!selectedIds.has(id)) {
        setSelectedIds(new Set([id]))
        setSelectedType(type)
      }
    }
    
    // Start drag
    let positions = new Map<string, { x: number; y: number }>()
    
    if (type === 'element') {
      selectedIds.forEach(selId => {
        const el = canvasElements.find(e => e.id === selId)
        if (el) positions.set(selId, { x: el.x, y: el.y })
      })
      if (!selectedIds.has(id)) {
        const el = canvasElements.find(e => e.id === id)
        if (el) positions.set(id, { x: el.x, y: el.y })
      }
    } else if (type === 'note') {
      selectedIds.forEach(selId => {
        const n = notes.find(n => n.id === selId)
        if (n) positions.set(selId, { x: n.canvasX, y: n.canvasY })
      })
      if (!selectedIds.has(id)) {
        const n = notes.find(n => n.id === id)
        if (n) positions.set(id, { x: n.canvasX, y: n.canvasY })
      }
    }
    
    setElementDrag({
      ids: selectedIds.has(id) ? Array.from(selectedIds) : [id],
      type,
      startX: e.clientX,
      startY: e.clientY,
      startPositions: positions
    })
  }, [activeTool, connectStart, canvasElements, notes, selectedIds, createConnection])

  // Handle resize/rotate
  const handleResizeStart = useCallback((e: React.MouseEvent, id: string, handle: string) => {
    e.stopPropagation()
    const element = canvasElements.find(el => el.id === id)
    if (!element || element.locked) return
    
    setResizing({
      id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { x: element.x, y: element.y, width: element.width, height: element.height }
    })
  }, [canvasElements])

  const handleRotateStart = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const element = canvasElements.find(el => el.id === id)
    if (!element || element.locked) return
    
    const coords = getCanvasCoords(e)
    const cx = element.x + element.width / 2
    const cy = element.y + element.height / 2
    const startAngle = Math.atan2(coords.y - cy, coords.x - cx)
    
    setRotating({
      id,
      startAngle,
      startRotation: element.rotation || 0,
      cx,
      cy
    })
  }, [canvasElements, getCanvasCoords])

  // Toggle lock
  const toggleLock = useCallback((id: string) => {
    const element = canvasElements.find(e => e.id === id)
    if (element) {
      updateCanvasElement(id, { locked: !element.locked })
    }
  }, [canvasElements, updateCanvasElement])

  // ═════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═════════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      const key = e.key.toLowerCase()
      
      // Delete
      if ((key === 'delete' || key === 'backspace') && selectedIds.size > 0) {
        e.preventDefault()
        deleteSelected()
      }
      // Escape
      else if (key === 'escape') { 
        setSelectedIds(new Set())
        setSelectedType(null)
        setEditingNote(null)
        setEditingElement(null)
        setConnectStart(null)
        setConnectEnd(null)
      }
      // Undo/Redo
      else if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      else if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault()
        redo()
      }
      // Copy/Paste/Duplicate
      else if ((e.metaKey || e.ctrlKey) && key === 'c') {
        e.preventDefault()
        copySelected()
      }
      else if ((e.metaKey || e.ctrlKey) && key === 'v') {
        e.preventDefault()
        pasteClipboard()
      }
      else if ((e.metaKey || e.ctrlKey) && key === 'd') {
        e.preventDefault()
        duplicateSelected()
      }
      // Tools
      else if (key === 'v') setActiveTool('select')
      else if (key === 'h') setActiveTool('pan')
      else if (key === 'n') setActiveTool('note')
      else if (key === 'f') setActiveTool('folder')
      else if (key === 'c' && !e.metaKey && !e.ctrlKey) setActiveTool('canvas')
      else if (key === 's') setActiveTool('sticky')
      else if (key === 't') setActiveTool('text')
      else if (key === 'r') { setActiveTool('shape'); setShapeType('rectangle') }
      else if (key === 'o') { setActiveTool('shape'); setShapeType('circle') }
      else if (key === 'l') setActiveTool('line')
      else if (key === 'a' && !e.metaKey && !e.ctrlKey) setActiveTool('arrow')
      else if (key === 'b') setActiveTool('simblock')
      else if (key === 'k') setActiveTool('connect')
      // Zoom
      else if (key === '+' || key === '=') setViewport(prev => ({ ...prev, zoom: prev.zoom * 1.2 }))
      else if (key === '-') setViewport(prev => ({ ...prev, zoom: prev.zoom / 1.2 }))
      else if (key === '0') setViewport({ x: 0, y: 0, zoom: 1 })
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, selectedType, deleteSelected, undo, redo, copySelected, pasteClipboard, duplicateSelected])

  // ═════════════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═════════════════════════════════════════════════════════════════

  const exportData = useCallback(() => {
    const data = { notes, folders, canvasElements, connections, viewport, gridType, theme, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neural-notebook-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [notes, folders, canvasElements, connections, viewport, gridType, theme])

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
        if (data.connections) setConnections(data.connections)
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
    setSelectedIds(new Set([note.id]))
    setSelectedType('note')
    if (note.type === 'CANVAS') setEditingNote(note)
  }, [])

  const canvasNotes = notes.filter(n => n.type === 'CANVAS')

  const getElementBounds = useCallback((id: string): { x: number; y: number; width: number; height: number } | null => {
    const element = canvasElements.find(e => e.id === id)
    if (element) return { x: element.x, y: element.y, width: element.width, height: element.height }
    
    const note = notes.find(n => n.id === id)
    if (note) return { x: note.canvasX, y: note.canvasY, width: note.canvasWidth, height: note.canvasHeight }
    
    const folder = folders.find(f => f.id === id)
    if (folder) return { x: folder.canvasX, y: folder.canvasY, width: folder.canvasWidth, height: folder.canvasHeight }
    
    return null
  }, [canvasElements, notes, folders])

  // ═════════════════════════════════════════════════════════════════
  // RENDER ELEMENT WITH HANDLES
  // ═════════════════════════════════════════════════════════════════

  const renderCanvasElement = useCallback((element: CanvasElement) => {
    const isSelected = selectedIds.has(element.id) && selectedType === 'element'
    const showHandles = isSelected && activeTool === 'select' && !element.locked
    
    const rotation = element.rotation || 0
    const cx = element.x + element.width / 2
    const cy = element.y + element.height / 2
    
    const commonProps = {
      className: `absolute cursor-move ${isSelected ? 'ring-2 ring-blue-500' : ''} ${element.locked ? 'opacity-70' : ''}`,
      style: { 
        left: element.x, 
        top: element.y,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center'
      },
      onMouseDown: (e: React.MouseEvent) => handleElementMouseDown(e, element.id, 'element'),
      onDoubleClick: () => !element.locked && setEditingElement(element)
    }

    // Port rendering for SimBlocks
    const renderPorts = () => {
      if (element.type !== 'simblock' || !element.ports) return null
      
      return element.ports.map(port => (
        <div
          key={port.id}
          className={`absolute w-4 h-4 rounded-full cursor-crosshair transform -translate-x-1/2 -translate-y-1/2 transition-all ${
            port.type === 'input' ? 'bg-green-500 border-2 border-green-300' : 'bg-orange-500 border-2 border-orange-300'
          } hover:scale-125 z-10`}
          style={{ left: port.x, top: port.y }}
          onMouseDown={(e) => handleElementMouseDown(e, element.id, 'element', port.id)}
          title={port.type === 'input' ? 'Input Port' : 'Output Port'}
        >
          <div className="absolute inset-0 rounded-full bg-white opacity-50 animate-ping" />
        </div>
      ))
    }

    // Resize handles
    const renderHandles = () => {
      if (!showHandles) return null
      
      const handles = [
        { pos: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
        { pos: 'ne', x: element.width, y: 0, cursor: 'nesw-resize' },
        { pos: 'sw', x: 0, y: element.height, cursor: 'nesw-resize' },
        { pos: 'se', x: element.width, y: element.height, cursor: 'nwse-resize' },
      ]
      
      return (
        <>
          {/* Resize handles */}
          {handles.map(h => (
            <div
              key={h.pos}
              className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500 rounded-sm cursor-pointer hover:bg-blue-100"
              style={{ left: h.x - HANDLE_SIZE/2, top: h.y - HANDLE_SIZE/2, cursor: h.cursor }}
              onMouseDown={(e) => handleResizeStart(e, element.id, h.pos)}
            />
          ))}
          
          {/* Rotate handle */}
          <div
            className="absolute w-4 h-4 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-400"
            style={{ 
              left: element.width / 2 - 8, 
              top: -ROTATE_HANDLE_OFFSET - 8,
              cursor: 'grab'
            }}
            onMouseDown={(e) => handleRotateStart(e, element.id)}
          >
            <RotateCcw className="w-3 h-3 text-white m-0.5" />
          </div>
          <div 
            className="absolute w-px h-5 bg-blue-500"
            style={{ left: element.width / 2, top: -ROTATE_HANDLE_OFFSET + 8 }}
          />
        </>
      )
    }

    if (element.type === 'shape') {
      const shapeContent = element.shapeType === 'circle' ? (
        <div 
          className="rounded-full"
          style={{ 
            width: element.width, 
            height: element.height,
            border: `${element.strokeWidth}px solid ${element.strokeColor}`,
            backgroundColor: element.fill ? element.color : 'transparent'
          }}
        />
      ) : element.shapeType === 'triangle' ? (
        <svg width={element.width} height={element.height} viewBox={`0 0 ${element.width} ${element.height}`}>
          <polygon 
            points={`${element.width/2},0 ${element.width},${element.height} 0,${element.height}`}
            fill={element.fill ? element.color : 'transparent'}
            stroke={element.strokeColor}
            strokeWidth={element.strokeWidth}
          />
        </svg>
      ) : element.shapeType === 'diamond' ? (
        <svg width={element.width} height={element.height} viewBox={`0 0 ${element.width} ${element.height}`}>
          <polygon 
            points={`${element.width/2},0 ${element.width},${element.height/2} ${element.width/2},${element.height} 0,${element.height/2}`}
            fill={element.fill ? element.color : 'transparent'}
            stroke={element.strokeColor}
            strokeWidth={element.strokeWidth}
          />
        </svg>
      ) : (
        <div 
          className="rounded"
          style={{ 
            width: element.width, 
            height: element.height,
            border: `${element.strokeWidth}px solid ${element.strokeColor}`,
            backgroundColor: element.fill ? element.color : 'transparent'
          }}
        />
      )
      
      return (
        <div key={element.id} {...commonProps}>
          {shapeContent}
          {renderHandles()}
          {isSelected && !element.locked && (
            <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
              onClick={(e) => { e.stopPropagation(); deleteSelected() }}>
              <X className="h-3 w-3" />
            </Button>
          )}
          {element.locked && (
            <Lock className="absolute top-1 left-1 h-4 w-4 text-zinc-400" />
          )}
        </div>
      )
    }
    
    if (element.type === 'line' || element.type === 'arrow') {
      const dx = (element.endX || element.x) - element.x
      const dy = (element.endY || element.y) - element.y
      
      return (
        <div key={element.id} 
          className={`absolute cursor-move ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
          style={{ left: element.x, top: element.y }}
          onMouseDown={(e) => handleElementMouseDown(e, element.id, 'element')}>
          <svg width={Math.abs(dx) + 20} height={Math.abs(dy) + 20} style={{ overflow: 'visible' }}>
            <line
              x1={0}
              y1={0}
              x2={dx}
              y2={dy}
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
              onClick={(e) => { e.stopPropagation(); deleteSelected() }}>
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
            className="px-2 py-1 min-w-[50px] bg-zinc-900/80 rounded"
            style={{ fontSize: element.fontSize || 14, color: element.color }}
          >
            {element.text || 'Text'}
          </div>
          {renderHandles()}
          {isSelected && !element.locked && (
            <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
              onClick={(e) => { e.stopPropagation(); deleteSelected() }}>
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
            style={{ width: element.width, height: element.height, borderColor: blockInfo.color, borderWidth: 2 }}
          >
            <div className="px-2 py-1 text-xs font-bold flex items-center gap-1" style={{ backgroundColor: blockInfo.color }}>
              <span>{blockInfo.icon}</span>
              <span className="text-white">{blockInfo.label}</span>
              {element.locked && <Lock className="h-3 w-3 ml-auto text-white/70" />}
            </div>
            <div className="flex-1 p-2 text-xs font-mono bg-zinc-900 text-zinc-300 overflow-hidden">
              {element.code || '// code'}
            </div>
          </Card>
          {renderPorts()}
          {renderHandles()}
          {isSelected && !element.locked && (
            <>
              <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full"
                onClick={(e) => { e.stopPropagation(); deleteSelected() }}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="absolute -top-2 -right-8 h-5 w-5 bg-zinc-600 text-white rounded-full"
                onClick={(e) => { e.stopPropagation(); toggleLock(element.id) }}>
                {element.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              </Button>
            </>
          )}
        </div>
      )
    }
    
    return null
  }, [selectedIds, selectedType, handleElementMouseDown, handleResizeStart, handleRotateStart, activeTool, deleteSelected, toggleLock])

  // ═════════════════════════════════════════════════════════════════
  // RENDER CONNECTIONS
  // ═════════════════════════════════════════════════════════════════

  const renderConnections = useCallback(() => {
    return connections.map(conn => {
      const fromBounds = getElementBounds(conn.fromId)
      const toBounds = getElementBounds(conn.toId)
      
      if (!fromBounds || !toBounds) return null
      
      const from = getAnchorPosition(fromBounds, conn.fromAnchor)
      const to = getAnchorPosition(toBounds, conn.toAnchor)
      
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const offset = Math.min(dist / 3, 50)
      
      let cp1x = from.x, cp1y = from.y
      let cp2x = to.x, cp2y = to.y
      
      if (conn.fromAnchor === 'right') cp1x += offset
      else if (conn.fromAnchor === 'left') cp1x -= offset
      else if (conn.fromAnchor === 'bottom') cp1y += offset
      else if (conn.fromAnchor === 'top') cp1y -= offset
      
      if (conn.toAnchor === 'right') cp2x += offset
      else if (conn.toAnchor === 'left') cp2x -= offset
      else if (conn.toAnchor === 'bottom') cp2y += offset
      else if (conn.toAnchor === 'top') cp2y -= offset
      
      const isSelected = selectedIds.has(conn.id)
      
      return (
        <g key={conn.id} className="cursor-pointer" onClick={() => { setSelectedIds(new Set([conn.id])); setSelectedType('connection') }}>
          <path d={`M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`} fill="none" stroke="transparent" strokeWidth={20} />
          <path
            d={`M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`}
            fill="none"
            stroke={isSelected ? '#3b82f6' : conn.color}
            strokeWidth={conn.strokeWidth}
            strokeDasharray={conn.animated ? '5,5' : undefined}
            markerEnd="url(#conn-arrow)"
          />
          <defs>
            <marker id="conn-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={isSelected ? '#3b82f6' : conn.color} />
            </marker>
          </defs>
        </g>
      )
    })
  }, [connections, selectedIds, getElementBounds])

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
          
          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Tools */}
          <div className="flex items-center gap-1">
            <Button size="icon" variant={activeTool === 'select' ? 'default' : 'ghost'} onClick={() => setActiveTool('select')} title="Select (V)">
              <MousePointer className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'pan' ? 'default' : 'ghost'} onClick={() => setActiveTool('pan')} title="Pan (H)">
              <Hand className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            <Button size="icon" variant={activeTool === 'note' ? 'default' : 'ghost'} onClick={() => setActiveTool('note')} title="Note (N)">
              <FileText className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'folder' ? 'default' : 'ghost'} onClick={() => setActiveTool('folder')} title="Folder (F)">
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'canvas' ? 'default' : 'ghost'} onClick={() => setActiveTool('canvas')} title="Canvas (C)">
              <Palette className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            <Button size="icon" variant={activeTool === 'text' ? 'default' : 'ghost'} onClick={() => setActiveTool('text')} title="Text (T)">
              <Type className="h-4 w-4" />
            </Button>
            
            <div className="relative">
              <Button size="icon" variant={activeTool === 'shape' ? 'default' : 'ghost'} onClick={() => setActiveTool('shape')} title="Shape (R/O)">
                {shapeType === 'circle' ? <Circle className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </Button>
              {activeTool === 'shape' && (
                <div className={`absolute top-10 left-0 z-50 flex gap-1 p-1 rounded-md shadow-lg ${theme === 'dark' ? 'bg-zinc-800' : 'bg-white border'}`}>
                  {[
                    { type: 'rectangle' as const, icon: Square },
                    { type: 'circle' as const, icon: Circle },
                    { type: 'triangle' as const, icon: Triangle },
                  ].map(({ type, icon: Icon }) => (
                    <Button key={type} size="icon" variant={shapeType === type ? 'default' : 'ghost'} onClick={() => setShapeType(type)} className="h-7 w-7">
                      <Icon className="h-3 w-3" />
                    </Button>
                  ))}
                </div>
              )}
            </div>
            
            <Button size="icon" variant={activeTool === 'line' ? 'default' : 'ghost'} onClick={() => setActiveTool('line')} title="Line (L)">
              <Minus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'arrow' ? 'default' : 'ghost'} onClick={() => setActiveTool('arrow')} title="Arrow (A)">
              <Minus className="h-4 w-4 rotate-45" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-1" />
            
            <Button size="icon" variant={activeTool === 'connect' ? 'default' : 'ghost'} onClick={() => setActiveTool('connect')} title="Connect (K)">
              <Link2 className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={activeTool === 'simblock' ? 'default' : 'ghost'} onClick={() => setActiveTool('simblock')} title="Sim Block (B)">
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
          {/* Clipboard */}
          <Button size="icon" variant="ghost" onClick={copySelected} disabled={selectedIds.size === 0} title="Copy (Ctrl+C)">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={pasteClipboard} disabled={!clipboard} title="Paste (Ctrl+V)">
            <Clipboard className="h-4 w-4" />
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <div className={`flex items-center gap-1 rounded-md p-1 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
            {(['dots', 'lines', 'none'] as GridType[]).map(g => (
              <Button key={g} size="icon" variant={gridType === g ? 'secondary' : 'ghost'} onClick={() => setGridType(g)} className="h-6 w-6">
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
            <Tabs defaultValue="elements" className="flex-1 flex flex-col">
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <TabsList className={theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}>
                  <TabsTrigger value="elements" className="text-xs">📐 Elements</TabsTrigger>
                  <TabsTrigger value="canvas" className="text-xs">🎨 Canvas</TabsTrigger>
                </TabsList>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowSidebar(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <TabsContent value="elements" className="flex-1 mt-0 overflow-hidden">
                <ScrollArea className="h-full px-3">
                  <div className="py-2 space-y-2">
                    <div className="text-xs text-zinc-500 px-2">Quick Add SimBlocks</div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {SIM_BLOCK_TYPES.map(bt => (
                        <Button key={bt.type} size="sm" variant="outline" onClick={() => {
                          createCanvasElement({
                            type: 'simblock',
                            x: (-viewport.x + 200) / viewport.zoom,
                            y: (-viewport.y + 200) / viewport.zoom,
                            width: 160,
                            height: 80,
                            color: bt.color,
                            strokeColor: '#333',
                            strokeWidth: 2,
                            fill: true,
                            blockType: bt.type as any,
                            code: `// ${bt.label}`
                          })
                        }}>
                          {bt.icon} {bt.label}
                        </Button>
                      ))}
                    </div>
                    
                    <div className="text-xs text-zinc-500 px-2">Selected ({selectedIds.size})</div>
                    
                    {selectedIds.size > 0 && (
                      <div className="flex gap-2 mb-2">
                        <Button size="sm" variant="outline" onClick={duplicateSelected}>
                          <Copy className="h-3 w-3 mr-1" /> Duplicate
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteSelected}>
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    )}
                    
                    <div className="text-xs text-zinc-500 px-2">Canvas Elements ({canvasElements.length})</div>
                    
                    {canvasElements.map(element => (
                      <div key={element.id} 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                          selectedIds.has(element.id) ? 'bg-blue-600 text-white' : theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                        }`}
                        onClick={(e) => {
                          if (e.shiftKey) {
                            setSelectedIds(prev => {
                              const next = new Set(prev)
                              if (next.has(element.id)) next.delete(element.id)
                              else next.add(element.id)
                              return next
                            })
                          } else {
                            setSelectedIds(new Set([element.id]))
                          }
                          setSelectedType('element')
                        }}
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
                        {element.locked && <Lock className="h-3 w-3 opacity-60" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
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
                            selectedIds.has(note.id) ? 'bg-blue-600 text-white' : theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                          }`}
                          onClick={() => openNote(note)}>
                          <Palette className="h-5 w-5 text-blue-400" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate text-sm">{note.title}</div>
                          </div>
                          <Button size="icon" variant="ghost" className={`h-6 w-6 ${selectedIds.has(note.id) ? 'text-white' : ''}`}
                            onClick={(e) => { e.stopPropagation(); setNotes(prev => prev.filter(n => n.id !== note.id)) }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Canvas */}
        <div ref={canvasRef}
          className={`absolute inset-0 ${isDragging ? 'cursor-grabbing' : activeTool === 'pan' ? 'cursor-grab' : activeTool === 'connect' ? 'cursor-crosshair' : 'cursor-default'}`}
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
            
            {/* Connections SVG Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
              {renderConnections()}
              {connectStart && connectEnd && (
                <line x1={getElementBounds(connectStart.id)?.x || 0} y1={getElementBounds(connectStart.id)?.y || 0} x2={connectEnd.x} y2={connectEnd.y} stroke="#3b82f6" strokeWidth={2} strokeDasharray="5,5" />
              )}
            </svg>
            
            {/* Selection Box */}
            {selectionBox && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.endX),
                  top: Math.min(selectionBox.startY, selectionBox.endY),
                  width: Math.abs(selectionBox.endX - selectionBox.startX),
                  height: Math.abs(selectionBox.endY - selectionBox.startY)
                }}
              />
            )}
            
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
                className={`absolute cursor-move ${selectedIds.has(folder.id) ? 'ring-2 ring-blue-500' : ''}`}
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
                        onClick={(e) => { e.stopPropagation(); setFolders(prev => prev.filter(f => f.id !== folder.id)) }}>
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
                className={`absolute cursor-move ${selectedIds.has(note.id) ? 'ring-2 ring-green-500' : ''}`}
                style={{ left: note.canvasX, top: note.canvasY, width: note.canvasWidth, height: note.canvasHeight }}
                onMouseDown={(e) => handleElementMouseDown(e, note.id, 'note')}
                onDoubleClick={() => note.type === 'CANVAS' ? openNote(note) : setEditingNote(note)}>
                
                {note.type === 'STICKY' ? (
                  <div className="w-full h-full rounded-lg shadow-lg p-3 flex flex-col" style={{ backgroundColor: note.color || '#fef08a' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm text-zinc-800 truncate">{note.title}</span>
                      <Button size="icon" variant="ghost" className="h-5 w-5 opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setNotes(prev => prev.filter(n => n.id !== note.id)) }}>
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
                          onClick={(e) => { e.stopPropagation(); setNotes(prev => prev.filter(n => n.id !== note.id)) }}>
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
                          onClick={(e) => { e.stopPropagation(); setNotes(prev => prev.filter(n => n.id !== note.id)) }}>
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
        
        {/* Connect Mode Indicator */}
        {activeTool === 'connect' && (
          <div className={`absolute bottom-16 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full ${theme === 'dark' ? 'bg-blue-600' : 'bg-blue-500'} text-white text-sm`}>
            {connectStart ? '🔴 Click another element or port to connect' : '🔵 Click an element or port to start connection'}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className={`h-8 shrink-0 flex items-center justify-between px-4 text-xs ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-white border-zinc-200 text-zinc-600'} border-t`}>
        <div className="flex items-center gap-4">
          <span>Position: {Math.round(-viewport.x / viewport.zoom)}, {Math.round(-viewport.y / viewport.zoom)}</span>
          <span>|</span>
          <span>{notes.length} Notes, {folders.length} Folders, {canvasElements.length} Elements, {connections.length} Connections</span>
          <span>|</span>
          <span>Selected: {selectedIds.size}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Tool: {activeTool}</span>
          <span className="text-zinc-400">|</span>
          <span className="text-zinc-400">History: {historyIndex + 1}/{history.length}</span>
        </div>
      </footer>

      {/* DIALOGS */}
      <Dialog open={!!editingNote && editingNote?.type === 'CANVAS'} onOpenChange={() => setEditingNote(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Canvas: {editingNote?.title}</DialogTitle>
          </DialogHeader>
          {editingNote && editingNote.type === 'CANVAS' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Input value={editingNote.title} onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })} className="mb-4" />
              <div className="flex-1 border rounded-md overflow-hidden bg-white">
                <TldrawCanvas initialData={editingNote.content} onChange={(data) => setEditingNote({ ...editingNote, content: data })} />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
                <Button onClick={() => { updateNote(editingNote.id, { title: editingNote.title, content: editingNote.content }); setEditingNote(null) }}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingElement} onOpenChange={() => setEditingElement(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Element</DialogTitle></DialogHeader>
          {editingElement && (
            <div className="space-y-4">
              {editingElement.type === 'text' && (
                <Input value={editingElement.text || ''} onChange={(e) => setEditingElement({ ...editingElement, text: e.target.value })} />
              )}
              {editingElement.type === 'simblock' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {SIM_BLOCK_TYPES.map(bt => (
                      <Button key={bt.type} size="sm" variant={editingElement.blockType === bt.type ? 'default' : 'outline'}
                        onClick={() => setEditingElement({ ...editingElement, blockType: bt.type as any, color: bt.color })}>
                        {bt.icon} {bt.label}
                      </Button>
                    ))}
                  </div>
                  <textarea className="w-full h-32 p-2 rounded-md border font-mono text-sm bg-zinc-900 text-zinc-100"
                    value={editingElement.code || ''} onChange={(e) => setEditingElement({ ...editingElement, code: e.target.value })} />
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingElement(null)}>Cancel</Button>
                <Button onClick={() => { updateCanvasElement(editingElement.id, editingElement); setEditingElement(null) }}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingNote && editingNote?.type !== 'CANVAS'} onOpenChange={() => setEditingNote(null)}>
        <DialogContent className="max-w-2xl h-[70vh] flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Edit Note</DialogTitle></DialogHeader>
          {editingNote && editingNote.type !== 'CANVAS' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Input value={editingNote.title} onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })} className="mb-4" />
              <textarea className={`flex-1 w-full p-4 rounded-md border resize-none ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-300'}`}
                value={editingNote.content} onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })} />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
                <Button onClick={() => { updateNote(editingNote.id, { title: editingNote.title, content: editingNote.content }); setEditingNote(null) }}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
