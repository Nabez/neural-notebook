'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { 
  Tldraw,
  useEditor,
  Editor,
  createTLStore,
  defaultShapeUtils,
  defaultBindingUtils,
  TLStore,
  TLRecord,
  TLAnyShapeUtil,
  TLAssetStore,
  uniqueId,
} from 'tldraw'
import 'tldraw/tldraw.css'

// ═════════════════════════════════════════════════════════════════
// TLDRAW CANVAS - In-Memory Only (No IndexedDB)
// ═════════════════════════════════════════════════════════════════

// Custom asset store that doesn't use IndexedDB
const createNoOpAssetStore = (): TLAssetStore => ({
  // Don't persist assets to IndexedDB
  upload: async () => {
    // Return empty URL - we don't persist assets
    return ''
  },
  resolve: async () => {
    // Return empty - no asset resolution
    return ''
  },
})

interface TldrawCanvasProps {
  initialData?: string
  onChange?: (snapshot: string) => void
  onSave?: (snapshot: string) => void
  readOnly?: boolean
}

// Editor controller component
function EditorController({
  initialData,
  onChange,
  onSave,
  readOnly,
}: TldrawCanvasProps) {
  const editor = useEditor()
  const loadedRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load initial data once
  useEffect(() => {
    if (!editor || !initialData || loadedRef.current) return
    loadedRef.current = true

    try {
      const data = JSON.parse(initialData)
      if (data?.records && Array.isArray(data.records)) {
        // Load records into store
        const records = data.records as TLRecord[]
        editor.store.put(records)
      }
    } catch (e) {
      console.log('Could not load canvas data:', e)
    }
  }, [editor, initialData])

  // Set read-only mode
  useEffect(() => {
    if (!editor) return
    editor.updateInstanceState({ isReadonly: readOnly ?? false })
  }, [editor, readOnly])

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!editor || !onChange) return

    const handleChange = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const records = editor.store.allRecords()
          const snapshot = { records }
          onChange(JSON.stringify(snapshot))
        } catch (e) {
          console.log('Could not save:', e)
        }
      }, 1500)
    }

    const unsubscribe = editor.store.listen(handleChange)
    return () => {
      unsubscribe()
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [editor, onChange])

  // Manual save handler
  const handleManualSave = useCallback(() => {
    if (!editor || !onSave) return
    try {
      const records = editor.store.allRecords()
      const snapshot = { records }
      onSave(JSON.stringify(snapshot))
    } catch (e) {
      console.log('Could not save:', e)
    }
  }, [editor, onSave])

  if (!onSave || readOnly) return null

  return (
    <button
      onClick={handleManualSave}
      className="absolute top-4 right-4 z-[999] px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium shadow-lg print:hidden"
    >
      💾 Speichern
    </button>
  )
}

export function TldrawCanvas({
  initialData,
  onChange,
  onSave,
  readOnly = false,
}: TldrawCanvasProps) {
  const [mounted, setMounted] = useState(false)
  
  // Create store once, outside of render
  const store = useMemo<TLStore>(() => {
    return createTLStore({
      shapeUtils: defaultShapeUtils as TLAnyShapeUtil[],
      bindingUtils: defaultBindingUtils,
    })
  }, [])

  // Defer mounting to avoid hydration issues
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Server-side placeholder
  if (!mounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-zinc-500 dark:text-zinc-400">Lade Canvas...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <Tldraw
        // Provide our own store to completely bypass IndexedDB
        store={store}
        hideUi={readOnly}
        components={{
          SharePanel: () => null,
          HelpMenu: () => null,
          ContextMenu: () => null,
          ActionsMenu: () => null,
          QuickActions: () => null,
        }}
        // Custom asset store - no IndexedDB
        assets={createNoOpAssetStore()}
      >
        <EditorController
          initialData={initialData}
          onChange={onChange}
          onSave={onSave}
          readOnly={readOnly}
        />
      </Tldraw>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// CANVAS PREVIEW
// ═════════════════════════════════════════════════════════════════

export function CanvasPreview({
  data,
  width = 280,
  height = 200,
}: {
  data: string
  width?: number
  height?: number
}) {
  return (
    <div
      className="bg-zinc-100 dark:bg-zinc-800 rounded-md flex items-center justify-center border border-zinc-200 dark:border-zinc-700"
      style={{ width, height }}
    >
      <div className="text-zinc-400 dark:text-zinc-500 text-xs text-center">
        <div className="text-2xl mb-1">🎨</div>
        <div>Canvas-Vorschau</div>
      </div>
    </div>
  )
}
