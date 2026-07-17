'use client';

import { useState, useEffect, useRef } from 'react';
import { ref, getBytes, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';
import { compressImage } from '@/lib/utils';

function extractPath(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'gs:') return u.pathname.replace(/^\//, '');
    const m = u.pathname.match(/\/o\/(.+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

function isDataUri(s: string): boolean {
  return typeof s === 'string' && s.startsWith('data:');
}
function isLocalFileUri(s: string): boolean {
  return typeof s === 'string' && s.startsWith('file://');
}

const blobCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

/** Display a single photo */
function PhotoDisplay({ photo, className }: { photo: any; className?: string }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    setFailed(false);
    setSrc('');

    const uri = photo?.photoUri || photo?.photoUrl || '';
    const path = photo?.storagePath || (uri ? extractPath(uri) : null);

    if (!uri && !path) { setFailed(true); return; }

    if (isDataUri(uri)) { setSrc(uri); return; }
    if (isLocalFileUri(uri)) { setFailed(true); return; }

    if (path) {
      const cached = blobCache.get(path);
      if (cached) { setSrc(cached); return; }
      (async () => {
        try {
          const bytes = await getBytes(ref(storage, path));
          if (cancel) return;
          const blob = new Blob([bytes]);
          const url = URL.createObjectURL(blob);
          if (blobCache.size >= MAX_CACHE_SIZE) {
            const firstKey = blobCache.keys().next().value;
            if (firstKey) {
              const oldUrl = blobCache.get(firstKey);
              if (oldUrl) URL.revokeObjectURL(oldUrl);
              blobCache.delete(firstKey);
            }
          }
          blobCache.set(path, url);
          setSrc(url);
        } catch (e) {
          if (cancel) return;
          try {
            const downloadUrl = await getDownloadURL(ref(storage, path));
            if (cancel) return;
            setSrc(downloadUrl);
          } catch {
            if (cancel) return;
            if (uri && !uri.startsWith('gs://')) setSrc(uri);
            else setFailed(true);
          }
        }
      })();
    } else if (uri) {
      setSrc(uri);
    } else {
      setFailed(true);
    }

    return () => { cancel = true; };
  }, [photo?.id, photo?.photoUri, photo?.photoUrl, photo?.storagePath]);

  useEffect(() => {
    return () => {
      if (src && src.startsWith('blob:') && ![...blobCache.values()].includes(src)) {
        URL.revokeObjectURL(src);
      }
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center text-slate-400 ${className || ''}`}>
        <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span className="text-[10px]">Foto nicht verfügbar</span>
      </div>
    );
  }

  if (!src) {
    return <div className={`flex items-center justify-center ${className || ''}`}>
      <span className="w-5 h-5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
    </div>;
  }

  return <img key={src} src={src} alt="" className={className} onError={() => setFailed(true)} />;
}

/** Upload form (shown on create mode) */
function PhotoUpload({ assignmentId, userId, userName, onUpload }: { assignmentId: string; userId: string; userName: string; onUpload: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setCaption('');
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      let compressed;
      try {
        compressed = await compressImage(pendingFile);
      } catch {
        compressed = pendingFile;
      }
      const path = `project_photos/${userId}/${Date.now()}_${pendingFile.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, compressed);

      const photoUri = `gs://${storageRef.bucket}/${storageRef.fullPath}`;
      await addDoc(collection(db, 'project_photos'), {
        assignmentId,
        userId,
        userName,
        photoUri,
        storagePath: path,
        caption: caption.trim() || null,
        createdAt: serverTimestamp(),
      });
      setPendingFile(null);
      setCaption('');
      onUpload();
    } catch (e) {
      alert('Fehler beim Hochladen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (pendingFile) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-500 truncate">{pendingFile.name}</p>
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Beschriftung (optional)" maxLength={200}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40" />
        <div className="flex gap-2">
          <button onClick={confirmUpload} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:scale-[0.97] disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all">
            {uploading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {uploading ? 'Wird hochgeladen…' : 'Hochladen'}
          </button>
          <button onClick={() => { setPendingFile(null); setCaption(''); if (inputRef.current) inputRef.current.value = ''; }} disabled={uploading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition-all disabled:opacity-50">
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:scale-[0.97] text-white font-semibold rounded-xl text-sm transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
        Foto auswählen
      </button>
    </div>
  );
}

type Props = { photo: any; className?: string } | { assignmentId: string; userId: string; userName: string; onUpload: () => void };

export default function ProjectPhoto(props: Props) {
  if ('photo' in props) {
    return <PhotoDisplay photo={props.photo} className={props.className} />;
  }
  return <PhotoUpload assignmentId={props.assignmentId} userId={props.userId} userName={props.userName} onUpload={props.onUpload} />;
}
