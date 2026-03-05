'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface GuiaStickyNavProps {
  sections: Section[];
}

export default function GuiaStickyNav({ sections }: GuiaStickyNavProps) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const handleIntersect: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
        }
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      threshold: 0.3,
      rootMargin: '-80px 0px -60% 0px',
    });

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [sections]);

  return (
    <nav className="space-y-0.5">
      {sections.map(({ id, label, icon: Icon }) => {
        const active = activeId === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            className={cn(
              'relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150',
              active
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            )}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setActiveId(id);
            }}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-700 rounded-r-full" />
            )}
            <Icon size={15} className="flex-shrink-0" />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
