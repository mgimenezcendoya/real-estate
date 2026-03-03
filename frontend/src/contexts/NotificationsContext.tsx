'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const SEEN_KEY = 'realia_seen_leads';

interface NotificationsContextValue {
  inboxUnreadCount: number;
  markInboxAsRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  inboxUnreadCount: 0,
  markInboxAsRead: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const loadSeen = () => {
    try {
      const raw = sessionStorage.getItem(SEEN_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        seenIds.current = new Set(ids);
      }
    } catch { /* ignore */ }
  };

  const saveSeen = (ids: Set<string>) => {
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
    } catch { /* ignore */ }
  };

  const checkForNewLeads = async () => {
    try {
      const leads = await api.getLeads();
      const currentIds = new Set(leads.map((l) => l.id));

      if (!initialized.current) {
        // First load: mark all current leads as seen, no notifications
        seenIds.current = currentIds;
        saveSeen(currentIds);
        initialized.current = true;
        return;
      }

      let newCount = 0;
      for (const lead of leads) {
        if (!seenIds.current.has(lead.id)) {
          newCount++;
          toast.info(`Nuevo lead: ${lead.name || lead.phone}`, { duration: 4000 });
          seenIds.current.add(lead.id);
        }
      }

      if (newCount > 0) {
        saveSeen(seenIds.current);
        setInboxUnreadCount((prev) => prev + newCount);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadSeen();
    checkForNewLeads();
    const interval = setInterval(checkForNewLeads, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const markInboxAsRead = () => {
    setInboxUnreadCount(0);
  };

  return (
    <NotificationsContext.Provider value={{ inboxUnreadCount, markInboxAsRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}
