// ═════════════════════════════════════════════════════════════════
// REAL-TIME HOOK - Ably for Vercel Serverless
// ═════════════════════════════════════════════════════════════════

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Ably from 'ably'

interface RealtimeMessage {
  type: string
  payload: any
  clientId: string
  timestamp: number
}

interface RemoteCursor {
  clientId: string
  cursorX: number
  cursorY: number
  viewportZoom: number
  viewportX: number
  viewportY: number
}

export function useRealtime(workspaceId: string = 'default-workspace') {
  const [connected, setConnected] = useState(false)
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map())
  const [onlineUsers, setOnlineUsers] = useState(1)
  
  const channelRef = useRef<Ably.Types.RealtimeChannelPromise | null>(null)
  const clientRef = useRef<Ably.Types.RealtimePromise | null>(null)
  const clientId = useRef(`client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  const cursorTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Initialize Ably
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ABLY_KEY
    
    // If no Ably key, skip real-time (works offline)
    if (!apiKey) {
      console.log('No Ably key - running in offline mode')
      return
    }

    const client = new Ably.Realtime.Promise({ 
      key: apiKey,
      clientId: clientId.current,
    })
    
    client.connection.on('connected', () => {
      setConnected(true)
    })
    
    client.connection.on('disconnected', () => {
      setConnected(false)
    })
    
    client.connection.on('failed', () => {
      console.error('Ably connection failed')
      setConnected(false)
    })
    
    clientRef.current = client
    
    // Join workspace channel
    const channel = client.channels.get(`workspace:${workspaceId}`)
    channelRef.current = channel
    
    // Subscribe to events
    channel.subscribe('cursor-update', (message) => {
      const data = message.data as RemoteCursor
      if (data.clientId !== clientId.current) {
        setRemoteCursors(prev => {
          const m = new Map(prev)
          m.set(data.clientId, data)
          return m
        })
        
        // Auto-remove cursor after 5 seconds of inactivity
        const existing = cursorTimeoutRef.current.get(data.clientId)
        if (existing) clearTimeout(existing)
        cursorTimeoutRef.current.set(data.clientId, setTimeout(() => {
          setRemoteCursors(prev => {
            const m = new Map(prev)
            m.delete(data.clientId)
            return m
          })
        }, 5000))
      }
    })
    
    channel.subscribe('note-update', (message) => {
      // Will be handled by the component
    })
    
    channel.presence.enter({ clientId: clientId.current })
    
    // Get current presence
    channel.presence.get().then((members) => {
      setOnlineUsers(members.length)
    })
    
    channel.presence.subscribe('enter', () => {
      setOnlineUsers(prev => prev + 1)
    })
    
    channel.presence.subscribe('leave', (member) => {
      setOnlineUsers(prev => Math.max(1, prev - 1))
      setRemoteCursors(prev => {
        const m = new Map(prev)
        m.delete(member.clientId as string)
        return m
      })
    })
    
    return () => {
      channel.presence.leave()
      channel.unsubscribe()
      client.close()
    }
  }, [workspaceId])

  // Publish cursor update
  const publishCursor = useCallback((data: Omit<RemoteCursor, 'clientId'>) => {
    if (!channelRef.current || !connected) return
    
    channelRef.current.publish('cursor-update', {
      ...data,
      clientId: clientId.current,
    })
  }, [connected])

  // Publish note update
  const publishNoteUpdate = useCallback((noteId: string, changes: any) => {
    if (!channelRef.current || !connected) return
    
    channelRef.current.publish('note-update', {
      noteId,
      changes,
      clientId: clientId.current,
      timestamp: Date.now(),
    })
  }, [connected])

  // Subscribe to note updates
  const subscribeToNotes = useCallback((callback: (data: any) => void) => {
    if (!channelRef.current) return () => {}
    
    const handler = (message: Ably.Types.Message) => {
      callback(message.data)
    }
    
    channelRef.current.subscribe('note-update', handler)
    return () => {
      channelRef.current?.unsubscribe('note-update', handler)
    }
  }, [])

  return {
    connected,
    clientId: clientId.current,
    remoteCursors,
    onlineUsers,
    publishCursor,
    publishNoteUpdate,
    subscribeToNotes,
  }
}
