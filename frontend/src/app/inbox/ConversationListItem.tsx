'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Lead } from '@/lib/api';
import { SCORE_CONFIG } from './scoreConfig';

// ── Types ────────────────────────────────────────────────────────────────────

export type LeadGroup = {
  phone: string;
  mainLead: Lead;
  allLeadIds: string[];
  lastMessage?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

function formatSidebarTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ConversationListItemProps {
  group: LeadGroup;
  isActive: boolean;
  onClick: (group: LeadGroup) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConversationListItem({ group, isActive, onClick }: ConversationListItemProps) {
  const { mainLead } = group;
  const score = mainLead.score ?? null;
  const timeLabel = formatSidebarTime(mainLead.last_contact || mainLead.created_at);

  const scoreConf = score && score in SCORE_CONFIG ? SCORE_CONFIG[score as keyof typeof SCORE_CONFIG] : null;

  // avatarGradient provides the from/to stops; JSX applies 'bg-gradient-to-br' as base class
  const avatarGradient = scoreConf
    ? scoreConf.avatarBg.replace('bg-gradient-to-br ', '')
    : isActive
      ? 'from-primary to-primary/80'
      : 'from-muted-foreground to-muted-foreground/70';

  const scoreDotColor = scoreConf ? scoreConf.dot : '';

  return (
    <button
      key={group.phone}
      onClick={() => onClick(group)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all relative group',
        isActive
          ? 'bg-primary/8'
          : 'hover:bg-secondary/60'
      )}
    >
      {/* Active bar */}
      <div className={cn(
        'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-all',
        isActive ? 'bg-primary opacity-100' : 'opacity-0'
      )} />

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="w-10 h-10 shadow-sm">
          <AvatarFallback className={cn(
            'text-white text-[13px] font-display font-semibold bg-gradient-to-br',
            avatarGradient
          )}>
            {getInitials(mainLead.name || mainLead.phone)}
          </AvatarFallback>
        </Avatar>
        {scoreDotColor && (
          <span className={cn(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
            scoreDotColor
          )} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className={cn(
            'text-[13px] font-display font-semibold truncate leading-snug',
            isActive ? 'text-primary' : 'text-foreground'
          )}>
            {mainLead.name || mainLead.phone}
          </span>
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap flex-shrink-0 tabular">
            {timeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/70 truncate flex-1 leading-tight">
            {mainLead.project_name || mainLead.phone}
          </span>
          {mainLead.handoff_active ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Humano activo" />
          ) : (
            <Sparkles size={9} className={cn(
              'flex-shrink-0 transition-colors',
              isActive ? 'text-primary/50' : 'text-muted-foreground/30 group-hover:text-muted-foreground/50'
            )} />
          )}
        </div>
        {mainLead.last_message_preview && (
          <p className="text-[11px] text-muted-foreground truncate leading-snug mt-0.5">
            {mainLead.last_message_role === 'assistant' ? (
              <span className="text-primary/60">Bot: </span>
            ) : null}
            {mainLead.last_message_preview}
          </p>
        )}
      </div>
    </button>
  );
}
