'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Conversation, Lead } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function isSameDay(a?: string, b?: string) {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function parseLine(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

function renderMarkdown(content: string, isOutgoing: boolean): React.ReactNode {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    result.push(
      <ul key={key++} className="my-1.5 space-y-0.5">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 items-start text-sm leading-relaxed">
            <span className={cn('flex-shrink-0 select-none mt-px', isOutgoing ? 'text-indigo-200' : 'text-border')}>—</span>
            <span>{parseLine(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      listItems.push(line.slice(2));
    } else {
      flushList();
      if (line.trim() === '') {
        result.push(<div key={key++} className="h-1.5" />);
      } else {
        result.push(
          <p key={key++} className="text-sm leading-relaxed">{parseLine(line)}</p>
        );
      }
    }
  });
  flushList();
  return <div className="space-y-0">{result}</div>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MessageBubbleProps {
  msg: Conversation;
  idx: number;
  prevMsg: Conversation | undefined;
  selectedLead: Lead | undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MessageBubble({ msg, idx, prevMsg, selectedLead }: MessageBubbleProps) {
  const isLead     = msg.role === 'user';
  const isAI       = msg.role === 'assistant' && (msg.sender_type === 'ai' || msg.sender_type === 'agent');
  const isHuman    = msg.role === 'assistant' && msg.sender_type === 'human';
  const isOutgoing = !isLead;

  const sameAsPrev   = !!prevMsg && prevMsg.role === msg.role && prevMsg.sender_type === msg.sender_type;
  const showDateSep  = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
  const showTail     = !sameAsPrev;

  const bubbleBg = isLead     ? '#ffffff'
    : isAI       ? '#eef1ff'   // indigo-50: brand AI
    : isHuman    ? '#f0fdf4'   // green-50: human/handoff
    : '#f8f8f8';

  const senderName = isLead
    ? (selectedLead?.name || 'Usuario')
    : isAI       ? 'Realia AI'
    : isHuman    ? 'Soporte (Panel)'
    : 'Sistema';

  const senderColor = isLead     ? '#4b5563'
    : isAI       ? '#4338ca'
    : isHuman    ? '#15803d'
    : '#6b7280';

  return (
    <React.Fragment key={idx}>
      {showDateSep && (
        <div className="flex items-center justify-center my-4">
          <span className="bg-background/80 text-muted-foreground text-xs font-medium px-4 py-1 rounded-full shadow-sm border border-border/60">
            {formatDateLabel(msg.created_at)}
          </span>
        </div>
      )}

      <div className={cn(
        'flex w-full',
        isOutgoing ? 'justify-end' : 'justify-start',
        sameAsPrev ? 'mt-[2px]' : 'mt-3',
      )}>
        {/* Bubble wrapper — max 65% width */}
        <div style={{ maxWidth: '65%', minWidth: 0 }}>

          {/* Sender label above bubble (only first in group, incoming) */}
          {!sameAsPrev && !isOutgoing && (
            <div className="text-xs font-semibold mb-0.5 px-[13px] flex items-center gap-1.5" style={{ color: senderColor }}>
              {senderName}
              {isAI && (
                <span className="text-[9px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide">
                  AI
                </span>
              )}
            </div>
          )}
          {!sameAsPrev && isOutgoing && (
            <div className="text-xs font-semibold mb-0.5 px-[13px] text-right flex items-center justify-end gap-1.5" style={{ color: senderColor }}>
              {isAI && (
                <span className="text-[9px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide">
                  AI
                </span>
              )}
              {senderName}
            </div>
          )}

          {/* The bubble itself */}
          <div
            className="relative"
            style={{
              backgroundColor: bubbleBg,
              borderRadius: showTail
                ? (isOutgoing ? '12px 2px 12px 12px' : '2px 12px 12px 12px')
                : '12px',
              padding: '7px 12px 5px',
              boxShadow: isLead
                ? '0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)'
                : '0 1px 2px rgba(79,70,229,0.08)',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {/* Message content */}
            <div className="text-[13.5px] leading-[1.5] text-foreground">
              {isAI || isHuman
                ? renderMarkdown(msg.content, isOutgoing)
                : <span>{msg.content}</span>
              }
            </div>

            {/* Media attachment */}
            {msg.media_type && (
              <div className="mt-1.5 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/8">
                <FileText size={13} className="text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-foreground/70 uppercase tracking-wide">{msg.media_type}</span>
              </div>
            )}

            {/* Timestamp row — inline at bottom right */}
            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-[1px]">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {formatTime(msg.created_at)}
              </span>
              {isHuman && (
                <svg viewBox="0 0 16 11" width="16" height="11" className="flex-shrink-0">
                  <path d="M11.071.653a.45.45 0 0 0-.631 0L5.767 5.33l-1.2-1.2a.45.45 0 1 0-.636.636l1.519 1.519a.45.45 0 0 0 .636 0l4.985-4.996a.45.45 0 0 0 0-.636z" fill="#53bdeb"/>
                  <path d="M14.071.653a.45.45 0 0 0-.631 0L8.767 5.33" stroke="#53bdeb" strokeWidth="0.9" fill="none"/>
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
