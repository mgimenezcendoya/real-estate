'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface Annotation {
  /** 0–100 percentage of image width */
  x: number;
  /** 0–100 percentage of image height */
  y: number;
  label: string;
  description?: string;
}

interface Props {
  src: string;
  alt: string;
  annotations?: Annotation[];
  /** Image natural width for aspect ratio calculation */
  width?: number;
  /** Image natural height for aspect ratio calculation */
  height?: number;
  className?: string;
}

export default function AnnotatedScreenshot({
  src,
  alt,
  annotations = [],
  width = 1280,
  height = 800,
  className,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const aspectRatio = width / height;

  return (
    <div className={cn('rounded-xl overflow-hidden border border-border shadow-sm bg-muted not-prose', className)}>
      {/* Screenshot + callouts */}
      <div
        className="relative w-full"
        style={{ paddingBottom: `${(1 / aspectRatio) * 100}%` }}
      >
        <div className="absolute inset-0">
          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 700px"
            priority={false}
          />

          {/* Numbered callout circles */}
          {annotations.map((a, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'absolute flex items-center justify-center rounded-full',
                'w-5 h-5 text-[9px] font-bold shadow-md z-10',
                'bg-primary text-primary-foreground',
                'hover:scale-110 transition-transform cursor-default',
                hovered === i && 'scale-110 ring-2 ring-primary/30'
              )}
              style={{
                left: `${a.x}%`,
                top: `${a.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              aria-label={a.label}
            >
              {i + 1}
            </button>
          ))}

          {/* Tooltip */}
          {hovered !== null && annotations[hovered] && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                left: `${annotations[hovered].x}%`,
                top: `${annotations[hovered].y}%`,
                transform: 'translate(-50%, calc(-100% - 12px))',
              }}
            >
              <div className="bg-foreground text-background text-xs rounded-lg px-3 py-2 shadow-lg max-w-[200px] text-center">
                <p className="font-semibold leading-tight">{annotations[hovered].label}</p>
                {annotations[hovered].description && (
                  <p className="opacity-70 mt-0.5 leading-snug">{annotations[hovered].description}</p>
                )}
              </div>
              {/* Arrow */}
              <div className="w-0 h-0 mx-auto border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Caption legend */}
      {annotations.length > 0 && (
        <div className="px-4 py-3 bg-muted/50 border-t border-border">
          <ol className="space-y-1.5 list-none">
            {annotations.map((a, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-start gap-2 text-xs text-muted-foreground transition-colors',
                  hovered === i && 'text-foreground'
                )}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>
                  <strong className="text-foreground font-semibold">{a.label}</strong>
                  {a.description && <> — {a.description}</>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
