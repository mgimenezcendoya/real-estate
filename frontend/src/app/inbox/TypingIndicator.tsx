'use client';

import React from 'react';

// Typing indicator with bouncing dots — shown while AI is composing a reply
export function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-4 py-2.5 rounded-2xl rounded-bl-sm bg-[#eef1ff] border border-indigo-100/60 shadow-sm w-fit">
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .typing-dot { animation: typing-bounce 1.2s infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
      <div className="typing-dot w-2 h-2 rounded-full bg-indigo-400" />
      <div className="typing-dot w-2 h-2 rounded-full bg-indigo-400" />
      <div className="typing-dot w-2 h-2 rounded-full bg-indigo-400" />
    </div>
  );
}
