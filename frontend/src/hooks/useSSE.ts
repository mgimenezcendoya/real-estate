/**
 * useSSE — connects to the /admin/inbox/stream SSE endpoint and exposes
 * typed callbacks for each event type.
 *
 * Features:
 * - Authenticates via ?token= query param (EventSource doesn't support headers)
 * - Reconnects automatically with exponential backoff (1s → 2s → 4s → … → 30s)
 * - On reconnect: calls onReconnect() so the caller can refresh stale state
 * - Exposes connection status: "connecting" | "connected" | "disconnected"
 * - Ignores "ping" events (keepalive only)
 * - Cleans up EventSource on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const AUTH_TOKEN_KEY = 'realia_token';

export type SSEStatus = 'connecting' | 'connected' | 'disconnected';

export interface SSEMessageEvent {
  lead_id: string;
  phone?: string;
  content: string;
  sender_type: 'lead' | 'agent' | 'human';
  timestamp: string | null;
  handoff_active: boolean;
}

export interface SSEHandoffUpdateEvent {
  lead_id: string;
  handoff_active: boolean;
  taken_by: string | null;
  lead_name?: string;
  lead_phone?: string;
  project_name?: string;
  trigger?: string;
}

interface UseSSEOptions {
  onMessage?: (data: SSEMessageEvent) => void;
  onHandoffUpdate?: (data: SSEHandoffUpdateEvent) => void;
  /** Called after a reconnect so the caller can reload any data missed during the gap */
  onReconnect?: () => void;
  enabled?: boolean;
}

export function useSSE({ onMessage, onHandoffUpdate, onReconnect, enabled = true }: UseSSEOptions) {
  const [status, setStatus] = useState<SSEStatus>('connecting');

  // Keep latest callbacks in refs so the EventSource listener closure never
  // captures stale values (avoids recreating the EventSource on every render)
  const onMessageRef = useRef(onMessage);
  const onHandoffUpdateRef = useRef(onHandoffUpdate);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onHandoffUpdateRef.current = onHandoffUpdate; }, [onHandoffUpdate]);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

  const retryDelayRef = useRef(1000); // current backoff delay in ms
  const esRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstConnection = useRef(true);

  const connect = useCallback(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    const url = `${BASE_URL}/admin/inbox/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('open', () => {
      setStatus('connected');
      if (!isFirstConnection.current) {
        // Notify caller to refresh data that may have been missed during the gap
        onReconnectRef.current?.();
      }
      isFirstConnection.current = false;
      retryDelayRef.current = 1000; // reset backoff on successful connection
    });

    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEMessageEvent;
        onMessageRef.current?.(data);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('handoff_update', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEHandoffUpdateEvent;
        onHandoffUpdateRef.current?.(data);
      } catch {
        // ignore malformed events
      }
    });

    // "ping" events are intentionally not handled — they are keepalive only

    es.addEventListener('error', () => {
      es.close();
      esRef.current = null;
      setStatus('disconnected');

      // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30_000);
      timeoutRef.current = setTimeout(connect, delay);
    });
  }, []); // stable — only runs once, callbacks are accessed via refs

  useEffect(() => {
    if (!enabled) return;

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, connect]);

  return { status };
}
