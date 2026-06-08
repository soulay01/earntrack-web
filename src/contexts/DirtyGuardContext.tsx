'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface DirtyGuardValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  message: string;
  setMessage: (msg: string) => void;
  guard: (cb: () => void) => void;
}

const DirtyGuardContext = createContext<DirtyGuardValue>({
  isDirty: false,
  setDirty: () => {},
  message: '',
  setMessage: () => {},
  guard: () => {},
});

export function DirtyGuardProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const dirtyRef = useRef(false);
  const msgRef = useRef('');

  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { msgRef.current = message; }, [message]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = msgRef.current || 'Ungespeicherte Änderungen – wirklich verlassen?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const guard = useCallback((cb: () => void) => {
    if (dirtyRef.current) {
      const ok = window.confirm(msgRef.current || 'Ungespeicherte Änderungen – wirklich verlassen?');
      if (!ok) return;
    }
    cb();
  }, []);

  return (
    <DirtyGuardContext.Provider value={{ isDirty, setDirty, message, setMessage, guard }}>
      {children}
    </DirtyGuardContext.Provider>
  );
}

export function useDirtyGuard() {
  return useContext(DirtyGuardContext);
}
