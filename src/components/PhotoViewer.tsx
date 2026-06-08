'use client';

import { useEffect, useCallback } from 'react';
import ProjectPhoto from './ProjectPhoto';

export default function PhotoViewer({ photo, onClose }: { photo: any; onClose: () => void }) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const photoUri = photo?.photoUri || photo?.photoUrl || '';
  const storagePath = photo?.storagePath || '';

  const handleDownload = async () => {
    if (!photoUri && !storagePath) return;
    try {
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `foto-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(photoUri, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm " onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3">
          <p className="text-sm text-white/80 font-medium truncate">{photo?.userName || ''}</p>
          <div className="flex gap-2">
            <button onClick={handleDownload}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all active:scale-[0.9]"
              title="Download">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all active:scale-[0.9]"
              title="Schließen">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center bg-black/40 rounded-2xl overflow-hidden">
          <ProjectPhoto photo={photo} className="max-w-full max-h-[80vh] object-contain" />
        </div>
      </div>
    </div>
  );
}