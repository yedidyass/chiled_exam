import { useEffect, useState } from 'react';
import type { Child } from '../shared/types';
import { api } from './api';

// מטמון תמונות: בזיכרון + localStorage (כדי שיוצגו גם בלי אינטרנט).
// המפתח כולל את הגרסה, כך שתמונה חדשה מחליפה את הישנה אוטומטית.

const PREFIX = 'ce_photo_';
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

const key = (c: Pick<Child, 'id' | 'photo_v'>) => `${c.id}:${c.photo_v}`;

function readStored(c: Pick<Child, 'id' | 'photo_v'>): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + c.id);
    if (!raw) return null;
    const { v, data } = JSON.parse(raw) as { v: number; data: string };
    return v === c.photo_v ? data : null;
  } catch {
    return null;
  }
}

function store(c: Pick<Child, 'id' | 'photo_v'>, data: string) {
  memory.set(key(c), data);
  try {
    localStorage.setItem(PREFIX + c.id, JSON.stringify({ v: c.photo_v, data }));
  } catch {
    /* אחסון מלא/חסום — נשאר רק בזיכרון */
  }
  listeners.forEach((l) => l());
}

export function clearPhotos() {
  memory.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

function load(c: Pick<Child, 'id' | 'photo_v'>): Promise<string | null> {
  const k = key(c);
  let p = inflight.get(k);
  if (!p) {
    p = api
      .getPhoto(c.id)
      .then(toDataUrl)
      .then((data) => {
        store(c, data);
        return data;
      })
      .catch(() => null)
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

/** כתובת התמונה של הילד (data URL), או null אם אין תמונה / עוד לא נטענה. */
export function usePhoto(child: Pick<Child, 'id' | 'photo_v'> | undefined): string | null {
  const lookup = () => {
    if (!child || !child.photo_v) return null;
    const k = key(child);
    const hit = memory.get(k) ?? readStored(child);
    if (hit) memory.set(k, hit);
    return hit ?? null;
  };
  const [url, setUrl] = useState(lookup);

  useEffect(() => {
    const update = () => setUrl(lookup());
    update();
    listeners.add(update);
    if (child?.photo_v && !lookup()) load(child);
    return () => {
      listeners.delete(update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child?.id, child?.photo_v]);

  return url;
}

/** שמירה מיידית של תמונה שהועלתה, בלי להוריד אותה שוב מהשרת. */
export async function rememberUploaded(c: Pick<Child, 'id' | 'photo_v'>, img: Blob) {
  store(c, await toDataUrl(img));
}

const SIZE = 320;

/** חותך לריבוע במרכז, מקטין ל-320px ומקודד ל-JPEG (כ-20KB). */
export async function prepareImage(file: File): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await createImageBitmap(file);
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('bad image'));
      img.src = URL.createObjectURL(file);
    });
  }
  const side = Math.min(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  if ('close' in source && typeof source.close === 'function') source.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
  );
}
