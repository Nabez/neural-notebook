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
  Sun, Moon, ChevronRight, ChevronDown,
  StickyNote, Plus, Palette, Trash2, Download, Upload
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

type GridType = 'dots' | 'lines' | 'none'
type ToolType = 'select' | 'pan' | 'note' | 'folder' | 'canvas' | 'sticky'

const STORAGE_KEY = 'neural-notebook-data'
const STICKY_COLORS = ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa', '#e9d5ff']
const FOLDER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'note' | 'folder' | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  
  // UI State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  
  // Element drag
  const [elementDrag, setElementDrag] = useState<{
    id: string
    type: 'note' | 'folder'
    startX: number
    startY: number
    elementStartX: number
    elementStartY: number
  } | null>(null)

  // ═════════════════════════════════════════════════════════════════
  // LOAD & SAVE DATA
  // ═════════════════════════════════════════════════════════════════

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        // Use requestAnimationFrame to avoid cascading renders
        requestAnimationFrame(() => {
          if (data.notes) setNotes(data.notes)
          if (data.folders) setFolders(data.folders)
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

  // Save to localStorage
  useEffect(() => {
    if (!isLoaded) return
    const data = { notes, folders, viewport, gridType, theme }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [notes, folders, viewport, gridType, theme, isLoaded])

  // ═════════════════════════════════════════════════════════════════
  // NOTE OPERATIONS
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

  const updateNote = useCallback((id: string, changes: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n))
  }, [])

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedId === id) { setSelectedId(null); setSelectedType(null) }
  }, [selectedId])

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

  const updateFolder = useCallback((id: string, changes: Partial<Folder>) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f))
  }, [])

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id))
    if (selectedId === id) { setSelectedId(null); setSelectedType(null) }
  }, [selectedId])

  // ═════════════════════════════════════════════════════════════════
  // CANVAS NAVIGATION
  // ═════════════════════════════════════════════════════════════════

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && activeTool === 'pan')) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y })
    } else if (e.button === 0 && activeTool === 'select') {
      setSelectedId(null)
      setSelectedType(null)
    } else if (e.button === 0) {
      const canvasRect = canvasRef.current?.getBoundingClientRect()
      if (canvasRect) {
        const x = (e.clientX - canvasRect.left - viewport.x) / viewport.zoom
        const y = (e.clientY - canvasRect.top - viewport.y) / viewport.zoom
        if (activeTool === 'note') createNote(x, y, 'TEXT')
        else if (activeTool === 'folder') createFolder(x, y)
        else if (activeTool === 'canvas') createNote(x, y, 'CANVAS')
        else if (activeTool === 'sticky') createNote(x, y, 'STICKY')
      }
    }
  }, [activeTool, viewport, createNote, createFolder])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setViewport(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }))
    }
  }, [isDragging, dragStart])

  const handleCanvasMouseUp = useCallback(() => setIsDragging(false), [])

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

  const handleElementMouseDown = useCallback((e: React.MouseEvent, id: string, type: 'note' | 'folder') => {
    e.stopPropagation()
    setSelectedId(id)
    setSelectedType(type)
    
    const element = type === 'note' ? notes.find(n => n.id === id) : folders.find(f => f.id === id)
    if (element) {
      setElementDrag({
        id,
        type,
        startX: e.clientX,
        startY: e.clientY,
        elementStartX: element.canvasX,
        elementStartY: element.canvasY
      })
    }
  }, [notes, folders])

  useEffect(() => {
    if (!elementDrag) return
    
    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - elementDrag.startX) / viewport.zoom
      const dy = (e.clientY - elementDrag.startY) / viewport.zoom
      
      if (elementDrag.type === 'note') {
        updateNote(elementDrag.id, { canvasX: elementDrag.elementStartX + dx, canvasY: elementDrag.elementStartY + dy })
      } else {
        updateFolder(elementDrag.id, { canvasX: elementDrag.elementStartX + dx, canvasY: elementDrag.elementStartY + dy })
      }
    }
    
    const handleMouseUp = () => setElementDrag(null)
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [elementDrag, viewport.zoom, updateNote, updateFolder])

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
      }
      else if (key === 'escape') { setSelectedId(null); setSelectedType(null); setEditingNote(null) }
      else if (key === 'v') setActiveTool('select')
      else if (key === 'h') setActiveTool('pan')
      else if (key === 'n') setActiveTool('note')
      else if (key === 'f') setActiveTool('folder')
      else if (key === 'c') setActiveTool('canvas')
      else if (key === 's') setActiveTool('sticky')
      else if (key === '+' || key === '=') setViewport(prev => ({ ...prev, zoom: prev.zoom * 1.2 }))
      else if (key === '-') setViewport(prev => ({ ...prev, zoom: prev.zoom / 1.2 }))
      else if (key === '0') setViewport({ x: 0, y: 0, zoom: 1 })
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, selectedType, deleteNote, deleteFolder])

  // ═════════════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═════════════════════════════════════════════════════════════════

  const exportData = useCallback(() => {
    const data = { notes, folders, viewport, gridType, theme, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neural-notebook-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [notes, folders, viewport, gridType, theme])

  const importData = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (data.notes) setNotes(data.notes)
        if (data.folders) setFolders(data.folders)
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
  const textNotes = notes.filter(n => n.type === 'TEXT')
  const stickyNotes = notes.filter(n => n.type === 'STICKY')

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
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <span className="text-xl">🧠</span> Neural Notebook
          </h1>
          <Separator orientation="vertical" className="h-6" />
          
          {/* Tools */}
          <div className="flex items-center gap-1">
            {[
              { tool: 'select' as ToolType, icon: MousePointer, label: 'Select (V)' },
              { tool: 'pan' as ToolType, icon: Hand, label: 'Pan (H)' },
              { tool: 'note' as ToolType, icon: FileText, label: 'Note (N)' },
              { tool: 'folder' as ToolType, icon: FolderPlus, label: 'Folder (F)' },
              { tool: 'canvas' as ToolType, icon: Palette, label: 'Canvas (C)' },
              { tool: 'sticky' as ToolType, icon: StickyNote, label: 'Sticky (S)' },
            ].map(({ tool, icon: Icon, label }) => (
              <Button key={tool} size="icon" variant={activeTool === tool ? 'default' : 'ghost'} 
                onClick={() => setActiveTool(tool)} className="h-8 w-8" title={label}>
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
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

          {/* Export/Import */}
          <Button size="icon" variant="ghost" onClick={exportData} title="Export">
            <Download className="h-4 w-4" />
          </Button>
          <label title="Import">
            <Button size="icon" variant="ghost" asChild>
              <span><Upload className="h-4 w-4" /></span>
            </Button>
            <input type="file" accept=".json" onChange={importData} className="hidden" />
          </label>

          {/* Theme */}
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
                  <TabsTrigger value="notes" className="text-xs">📝 Notes</TabsTrigger>
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
              
              <TabsContent value="notes" className="flex-1 mt-0 overflow-hidden">
                <ScrollArea className="h-full px-3">
                  <div className="py-2 space-y-1">
                    <div className="text-xs text-zinc-500 mb-2 px-2">Text Notes ({textNotes.length})</div>
                    {textNotes.map(note => (
                      <div key={note.id} 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                        onClick={() => { openNote(note); setEditingNote(note) }}>
                        <FileText className="h-4 w-4" />
                        <span className="text-sm truncate">{note.title}</span>
                      </div>
                    ))}
                    
                    <div className="text-xs text-zinc-500 mt-4 mb-2 px-2">Sticky Notes ({stickyNotes.length})</div>
                    {stickyNotes.map(note => (
                      <div key={note.id} 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                        onClick={() => { openNote(note); setEditingNote(note) }}>
                        <StickyNote className="h-4 w-4" style={{ color: note.color }} />
                        <span className="text-sm truncate">{note.title}</span>
                      </div>
                    ))}
                    
                    <div className="text-xs text-zinc-500 mt-4 mb-2 px-2">Folders ({folders.length})</div>
                    {folders.map(folder => (
                      <div key={folder.id} 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                        onClick={() => setViewport(prev => ({ ...prev, x: -folder.canvasX * prev.zoom + 200, y: -folder.canvasY * prev.zoom + 200 }))}>
                        <span style={{ color: folder.color }}>📁</span>
                        <span className="text-sm truncate">{folder.name}</span>
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
            
            {/* Folders */}
            {folders.map(folder => (
              <div key={folder.id} 
                className={`absolute cursor-move ${selectedId === folder.id ? 'ring-2 ring-blue-500' : ''}`}
                style={{ left: folder.canvasX, top: folder.canvasY, width: folder.canvasWidth, height: folder.canvasHeight }}
                onMouseDown={(e) => handleElementMouseDown(e, folder.id, 'folder')}
                onDoubleClick={() => setViewport(prev => ({ ...prev, x: -folder.canvasX * prev.zoom + 200, y: -folder.canvasY * prev.zoom + 200 }))}>
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
                    <div className={`flex-1 rounded-md p-2 mt-2 ${theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-100'}`}>
                      <div className="text-xs text-zinc-500">{notes.filter(n => n.folderId === folder.id).length} Notizen</div>
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
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); openNote(note) }}>
                            Öffnen
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 opacity-60 hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-zinc-100 flex items-center justify-center">
                      <div className="text-zinc-400 text-xs text-center">
                        <Palette className="h-6 w-6 mx-auto mb-1" />
                        Canvas
                        <br />
                        <span className="text-blue-500">Klicken zum Öffnen</span>
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
          <span>{notes.length} Notes, {folders.length} Folders</span>
        </div>
        <div className="text-zinc-400">
          Saved locally • Export to backup
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

      {/* TEXT/STICKY EDITOR DIALOG */}
      <Dialog open={!!editingNote && editingNote?.type !== 'CANVAS'} onOpenChange={() => setEditingNote(null)}>
        <DialogContent className="max-w-2xl h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingNote?.type === 'STICKY' ? <><StickyNote className="h-4 w-4" />Sticky Note</> : <><FileText className="h-4 w-4" />Edit Note</>}
            </DialogTitle>
          </DialogHeader>
          {editingNote && editingNote.type !== 'CANVAS' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-2 mb-4">
                <Input value={editingNote.title} 
                  onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                  placeholder="Title..." className="flex-1" />
                {editingNote.type === 'STICKY' && (
                  <div className="flex gap-1">
                    {STICKY_COLORS.map(c => (
                      <button key={c} 
                        className={`w-8 h-8 rounded-md ${editingNote.color === c ? 'ring-2 ring-blue-500' : ''}`}
                        style={{ backgroundColor: c }} 
                        onClick={() => setEditingNote({ ...editingNote, color: c })} />
                    ))}
                  </div>
                )}
              </div>
              <textarea 
                className={`flex-1 w-full p-4 rounded-md border resize-none ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-300'}`}
                value={editingNote.content}
                onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                placeholder="Write your note..." />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
                <Button onClick={() => { updateNote(editingNote.id, { title: editingNote.title, content: editingNote.content, color: editingNote.color }); setEditingNote(null) }}>
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
