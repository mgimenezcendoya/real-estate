/**
 * useSSE — connects to the /admin/inbox/stream SSE endpoint and exposes
 * typed callbacks for each event type.
 *
 * Features:
 * - Authenticates via Authorization: Bearer header (token never in URL)
 * - Reconnects automatically with exponential backoff (1s → 2s → 4s → … → 30s)
 * - On reconnect: calls onReconnect() so the caller can refresh stale state
 * - Exposes connection status: "connecting" | "connected" | "disconnected"
 * - Ignores "ping" events (keepalive only)
 * - Cleans up fetch AbortController on unmount
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

  // Keep latest callbacks in refs so the fetch reader closure never
  // captures stale values (avoids recreating the connection on every render)
  const onMessageRef = useRef(onMessage);
  const onHandoffUpdateRef = useRef(onHandoffUpdate);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onHandoffUpdateRef.current = onHandoffUpdate; }, [onHandoffUpdate]);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

  const retryDelayRef = useRef(1000); // current backoff delay in ms
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstConnection = useRef(true);

  const connect = useCallback(() => {
    // NOTE: sessionStorage clears on tab close. For httpOnly cookie auth (stronger
    // XSS protection), a backend session endpoint would be needed — tracked as future work.
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    const url = `${BASE_URL}/admin/inbox/stream`;

    // AbortController lets us cancel the fetch on cleanup/reconnect
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        setStatus('connected');
        if (!isFirstConnection.current) {
          onReconnectRef.current?.();
        }
        isFirstConnection.current = false;
        retryDelayRef.current = 1000;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // keep incomplete last line

          let eventType = 'message';
          let dataLine = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataLine = line.slice(6).trim();
            } else if (line === '') {
              // Empty line = event boundary
              if (dataLine && eventType !== 'ping') {
                try {
                  const parsed = JSON.parse(dataLine);
                  if (eventType === 'message') {
                    onMessageRef.current?.(parsed);
                  } else if (eventType === 'handoff_update') {
                    onHandoffUpdateRef.current?.(parsed);
                  }
                } catch {
                  // ignore malformed
                }
              }
              eventType = 'message';
              dataLine = '';
            }
          }
        }

        // Stream ended cleanly — reconnect
        throw new Error('SSE stream closed');
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return; // intentional cleanup

        abortRef.current = null;
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
      abortRef.current?.abort();
      abortRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, connect]);

  return { status };
}
