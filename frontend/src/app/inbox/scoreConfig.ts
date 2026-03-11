export const SCORE_CONFIG = {
  hot: {
    label: 'Hot',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200',
    ring: 'ring-2 ring-red-200',
    avatarBg: 'bg-gradient-to-br from-red-400 to-red-600',
  },
  warm: {
    label: 'Warm',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    ring: 'ring-2 ring-amber-200',
    avatarBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
  },
  cold: {
    label: 'Frío',
    dot: 'bg-blue-400',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    ring: 'ring-2 ring-blue-200',
    avatarBg: 'bg-gradient-to-br from-blue-400 to-blue-600',
  },
} as const;

export type ScoreKey = keyof typeof SCORE_CONFIG;
