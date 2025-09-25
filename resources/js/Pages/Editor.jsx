import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';
import '@/../css/Editor.css';

const EFFECT_PRESETS = [
  { key: 'glow', name: 'Glow', type: 'glow', intensity: 0.8, color: 'rgba(60,207,101,0.9)', fadeIn: 0.5, fadeOut: 0.5, duration: 4 },
  { key: 'blur', name: 'Blur', type: 'blur', intensity: 0.5, fadeIn: 0.3, fadeOut: 0.3, duration: 3 },
  { key: 'brightness', name: 'Brightness', type: 'brightness', intensity: 0.3, fadeIn: 0.4, fadeOut: 0.4, duration: 5 }
];

export default function Editor({ project }) {
  const PX_PER_SEC = 20;

  const resolveLocal = (key, fallback = '') => {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  };

  const hydrateFromStorage = (item) => {
    if (!item) return null;
    const storageKey = item.storageKey || (typeof item.source === 'string' && item.source.startsWith('local-') ? item.source : null);
    if (storageKey) {
      const data = resolveLocal(storageKey, null);
      if (data) return { ...item, source: data, storageKey };
    }
    if (item.fallbackSource) return { ...item, source: item.fallbackSource };
    return { ...item, source: '/placeholder.mp4', missing: true };
  };

  const rehydrateItems = (items = []) => items.map((item) => hydrateFromStorage(item)).filter(Boolean);
  const prepareItemsForSave = (items = []) =>
    items
      .map((item) => {
        if (!item) return null;
        const { storageKey, source, file, ...rest } = item;
        const payload = { ...rest };
        if (storageKey) {
          payload.storageKey = storageKey;
          payload.source = storageKey;
          if (source && source.startsWith('data:')) payload.fallbackSource = source;
        } else if (typeof source === 'string') {
          payload.source = source;
        }
        return payload;
      })
      .filter(Boolean);

  const [mediaFiles, setMediaFiles] = useState(() => rehydrateItems(project.media_files || []));
  const [clips, setClips] = useState(() => rehydrateItems(project.clips || []));
  const [musicTracks, setMusicTracks] = useState(() => rehydrateItems(project.music_tracks || []));
  const [effects, setEffects] = useState(() => (Array.isArray(project.effects) && project.effects.length ? project.effects : []));
  const [textOverlays, setTextOverlays] = useState(() => (Array.isArray(project.text_overlays) ? project.text_overlays : []));

  const [activeClipIndex, setActiveClipIndex] = useState(null);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [selectedMusicIndex, setSelectedMusicIndex] = useState(null);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState(null);
  const [selectedTextIndex, setSelectedTextIndex] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [globalDuration, setGlobalDuration] = useState(60);

  const videoRef = useRef(null);
  const audioRefs = useRef([]);
  const stageRef = useRef(null);

  const [resizeState, setResizeState] = useState(null);
  const [resizeEffectState, setResizeEffectState] = useState(null);
  const [resizeMusicState, setResizeMusicState] = useState(null);
  const [resizeTextState, setResizeTextState] = useState(null);
  const [dragEffectState, setDragEffectState] = useState(null);
  const [dragTextState, setDragTextState] = useState(null);
  const [dragTextStageState, setDragTextStageState] = useState(null);

  const [newText, setNewText] = useState('New Text');
  const [newTextSize, setNewTextSize] = useState(32);
  const [newTextColor, setNewTextColor] = useState('#FCFFFC');

  const clipTotal = useMemo(() => clips.reduce((s, c) => s + (c.duration || 0), 0), [clips]);

  const totalDuration = useMemo(() => {
    const clipDur = clipTotal;
    const musicDur = musicTracks.reduce((max, t) => Math.max(max, (t.startTime || 0) + (t.duration || 0)), 0);
    const effectDur = effects.reduce((max, fx) => Math.max(max, (fx.startTime || 0) + (fx.duration || 0)), 0);
    const textDur = textOverlays.reduce((max, tx) => Math.max(max, (tx.startTime || 0) + (tx.duration || 0)), 0);
    return Math.max(clipDur, musicDur, effectDur, textDur, globalDuration);
  }, [clipTotal, musicTracks, effects, textOverlays, globalDuration]);

  const normalizeClipsLocal = (clipsArr) => {
    let accumulated = 0;
    return clipsArr.map((clip) => {
      const c = { ...clip };
      c.startTime = accumulated;
      accumulated += c.duration || 0;
      return c;
    });
  };

  const clearSelection = () => {
    setSelectedClipIndex(null);
    setSelectedMusicIndex(null);
    setSelectedEffectIndex(null);
    setSelectedTextIndex(null);
  };
  const selectClip = (i) => { setSelectedClipIndex(i); setSelectedMusicIndex(null); setSelectedEffectIndex(null); setSelectedTextIndex(null); };
  const selectMusic = (i) => { setSelectedMusicIndex(i); setSelectedClipIndex(null); setSelectedEffectIndex(null); setSelectedTextIndex(null); };
  const selectEffect = (i) => { setSelectedEffectIndex(i); setSelectedClipIndex(null); setSelectedMusicIndex(null); setSelectedTextIndex(null); };
  const selectText = (i) => { setSelectedTextIndex(i); setSelectedClipIndex(null); setSelectedMusicIndex(null); setSelectedEffectIndex(null); };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play();
    else videoRef.current.pause();
  };

  const startMusicResize = (e, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const track = musicTracks[index];
    if (!track) return;
    setResizeMusicState({
      index,
      edge,
      startX: e.clientX,
      origStartOffset: track.startOffset || 0,
      origStartTime: track.startTime || 0,
      origDuration: track.duration || 0,
      sourceDuration: track.sourceDuration || track.duration || 0,
      pxPerSec: PX_PER_SEC
    });
  };

  const goBack = () => router.get(route('dashboard'));

  const handleFileUpload = async (e) => {
    const uploads = Array.from(e.target.files || []);
    const files = await Promise.all(
      uploads.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            const key = `local-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
            reader.onload = () => {
              const dataUrl = reader.result;
              try { localStorage.setItem(key, dataUrl); } catch (_) {}
              resolve({
                name: file.name,
                source: dataUrl,
                storageKey: key,
                duration: 0,
                type: file.type.startsWith('audio/') ? 'audio' : 'video',
                startOffset: 0,
                startTime: 0,
                sourceDuration: 0,
                autoClamped: file.type.startsWith('audio/')
              });
            };
            reader.readAsDataURL(file);
          })
      )
    );
    setMediaFiles((prev) => [...prev, ...files]);
  };

  const handleDragStart = (e, payload) => {
    e.dataTransfer.setData('payload', JSON.stringify(payload));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('payload');
    if (!data) return;
    const payload = JSON.parse(data);

    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const dropTime = Math.max(0, Math.min(totalDuration, (dropX / (totalDuration * PX_PER_SEC)) * totalDuration));

    if (payload.kind === 'media') {
      const file = payload.file;
      if (!file) return;

      if (file.type === 'video') {
        setClips((prev) => {
          const newClips = normalizeClipsLocal([
            ...prev,
            { ...file, startOffset: 0, startTime: prev.reduce((sum, c) => sum + (c.duration || 0), 0) }
          ]);
          if (prev.length === 0) setActiveClipIndex(0);
          return newClips;
        });
      } else if (file.type === 'audio') {
        if (clips.length === 0) { alert('Add a video clip first.'); return; }
        setMusicTracks((prev) => [
          ...prev,
          { ...file, startTime: 0, startOffset: 0, duration: 0 }
        ]);
      }
    } else if (payload.kind === 'effect') {
      const base = payload.effect;
      setEffects((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: base.name,
          type: base.type,
          color: base.color,
          intensity: base.intensity ?? 0.5,
          startTime: dropTime,
          duration: base.duration ?? 5,
          fadeIn: base.fadeIn ?? 0,
          fadeOut: base.fadeOut ?? 0
        }
      ]);
    } else if (payload.kind === 'text') {
      setTextOverlays((prev) => [
        ...prev,
        { id: crypto.randomUUID(), content: newText || 'New Text', startTime: dropTime, duration: 5, x: 50, y: 50, color: newTextColor, fontSize: newTextSize }
      ]);
    }
  };

  const handleSave = () => {
    const mediaToSave = prepareItemsForSave(mediaFiles);
    const clipsToSave = prepareItemsForSave(clips);
    const tracksToSave = prepareItemsForSave(musicTracks);
    const effectsToSave = effects.map((effect) => ({ ...effect }));
    const textsToSave = textOverlays.map((t) => ({ ...t }));
    router.put(route('projects.update', project.id), {
      media_files: mediaToSave,
      clips: clipsToSave,
      music_tracks: tracksToSave,
      effects: effectsToSave,
      text_overlays: textsToSave
    });
  };

  const handleCut = () => {
    const wasPlaying = videoRef.current && !videoRef.current.paused;

    if (selectedClipIndex !== null) {
      const targetIndex = selectedClipIndex;
      const clip = clips[targetIndex];
      if (!clip || clip.type === 'gap') return;
      const relativeTime = currentTime - (clip.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (clip.duration || 0)) return;

      const before = { ...clip, startOffset: clip.startOffset || 0, startTime: clip.startTime, duration: relativeTime };
      const after = { ...clip, startOffset: (clip.startOffset || 0) + relativeTime, startTime: (clip.startTime || 0) + relativeTime, duration: (clip.duration || 0) - relativeTime };

      setClips((prev) => normalizeClipsLocal([...prev.slice(0, targetIndex), before, after, ...prev.slice(targetIndex + 1)]));
      setSelectedClipIndex(targetIndex + 1);
      seekTo(currentTime, wasPlaying);
      return;
    }

    if (selectedMusicIndex !== null) {
      const tIndex = selectedMusicIndex;
      const track = musicTracks[tIndex];
      if (!track) return;
      const relativeTime = currentTime - (track.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (track.duration || 0)) return;

      const before = { ...track, startOffset: track.startOffset || 0, startTime: track.startTime, duration: relativeTime };
      const after = { ...track, startOffset: (track.startOffset || 0) + relativeTime, startTime: (track.startTime || 0) + relativeTime, duration: (track.duration || 0) - relativeTime };

      setMusicTracks((prev) => [...prev.slice(0, tIndex), before, after, ...prev.slice(tIndex + 1)]);
      setSelectedMusicIndex(tIndex + 1);
      seekTo(currentTime, wasPlaying);
      return;
    }

    if (selectedEffectIndex !== null) {
      const eIndex = selectedEffectIndex;
      const fx = effects[eIndex];
      if (!fx) return;

      const relativeTime = currentTime - (fx.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (fx.duration || 0)) return;

      const before = { ...fx, startTime: fx.startTime, duration: relativeTime };
      const after = { ...fx, startTime: (fx.startTime || 0) + relativeTime, duration: (fx.duration || 0) - relativeTime };

      setEffects((prev) => { const arr = [...prev]; arr.splice(eIndex, 1, before, after); return arr; });
      setSelectedEffectIndex(eIndex + 1);
      seekTo(currentTime, wasPlaying);
      return;
    }

    if (selectedTextIndex !== null) {
      const idx = selectedTextIndex;
      const tx = textOverlays[idx];
      if (!tx) return;
      const relativeTime = currentTime - (tx.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (tx.duration || 0)) return;
      const before = { ...tx, startTime: tx.startTime, duration: relativeTime };
      const after = { ...tx, startTime: (tx.startTime || 0) + relativeTime, duration: (tx.duration || 0) - relativeTime };
      setTextOverlays((prev) => { const arr = [...prev]; arr.splice(idx, 1, before, after); return arr; });
      setSelectedTextIndex(idx + 1);
      seekTo(currentTime, wasPlaying);
      return;
    }
  };

  const handleClipDragStart = (e, index) => e.dataTransfer.setData('clipIndex', index);
  const handleClipDrop = (e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('clipIndex'));
    if (draggedIndex === dropIndex) return;
    setClips((prev) => {
      const updated = [...prev];
      const [draggedClip] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, draggedClip);
      return normalizeClipsLocal(updated);
    });
    selectClip(dropIndex);
  };

  const handleTrackDragStart = (e, index) => e.dataTransfer.setData('trackIndex', index);
  const handleTrackDrop = (e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('trackIndex'));
    if (draggedIndex === dropIndex) return;
    setMusicTracks((prev) => {
      const updated = [...prev];
      const [draggedTrack] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, draggedTrack);
      return updated;
    });
    selectMusic(dropIndex);
  };

  const handleEffectDragStart = (e, index) => e.dataTransfer.setData('effectIndex', index);
  const handleEffectDrop = (e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('effectIndex'));
    if (Number.isNaN(draggedIndex) || draggedIndex === dropIndex) return;
    setEffects((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, dragged);
      return updated;
    });
    selectEffect(dropIndex);
  };

  const startResize = (e, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = clips[index];
    if (!clip) return;
    setResizeState({
      index,
      edge,
      startX: e.clientX,
      origStartOffset: clip.startOffset || 0,
      origDuration: clip.duration || 0,
      sourceDuration: clip.sourceDuration || clip.duration || 0,
      pxPerSec: PX_PER_SEC
    });
  };

  const startEffectResize = (e, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const fx = effects[index];
    if (!fx) return;
    setResizeEffectState({
      index,
      edge,
      startX: e.clientX,
      origStartTime: fx.startTime || 0,
      origDuration: fx.duration || 0,
      pxPerSec: PX_PER_SEC
    });
  };

  const startEffectDrag = (e, index) => {
    const target = e.target;
    if (target.closest('.clip-handle') || target.closest('.effect-slider')) return;
    e.stopPropagation();
    e.preventDefault();
    const fx = effects[index];
    if (!fx) return;
    setDragEffectState({
      index,
      startX: e.clientX,
      origStart: fx.startTime || 0,
      duration: fx.duration || 0,
      pxPerSec: PX_PER_SEC
    });
  };

  const startTextResize = (e, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const tx = textOverlays[index];
    if (!tx) return;
    setResizeTextState({
      index,
      edge,
      startX: e.clientX,
      origStartTime: tx.startTime || 0,
      origDuration: tx.duration || 0,
      pxPerSec: PX_PER_SEC
    });
  };

  const startTextDrag = (e, index) => {
    if (e.target.closest('.clip-handle')) return;
    e.stopPropagation();
    e.preventDefault();
    const tx = textOverlays[index];
    if (!tx) return;
    setDragTextState({
      index,
      startX: e.clientX,
      origStart: tx.startTime || 0,
      duration: tx.duration || 0,
      pxPerSec: PX_PER_SEC
    });
  };

  useEffect(() => {
    clips.forEach((clip, i) => {
      if (!clip.source) return;
      if (!clip.sourceDuration || !clip.duration) {
        const vid = document.createElement('video');
        vid.src = clip.source;
        vid.preload = 'auto';
        vid.onloadedmetadata = () => {
          setClips((prev) => {
            const list = [...prev];
            const c = { ...list[i] };
            const srcDur = vid.duration || 0;
            c.sourceDuration = srcDur;
            if (!c.duration || c.duration <= 0) {
              const startOffset = c.startOffset || 0;
              c.duration = Math.max(0, srcDur - startOffset);
            }
            list[i] = c;
            return normalizeClipsLocal(list);
          });
        };
      }
    });

    musicTracks.forEach((track, i) => {
      if (!track.source) return;
      if (!track.sourceDuration || !track.duration) {
        const aud = document.createElement('audio');
        aud.src = track.source;
        aud.preload = 'auto';
        aud.onloadedmetadata = () => {
          setMusicTracks((prev) => {
            const arr = [...prev];
            const t = { ...arr[i] };
            const srcDur = aud.duration || 0;
            t.sourceDuration = srcDur;
            if (!t.duration || t.duration <= 0) {
              const startOffset = t.startOffset || 0;
              const maxByFile = Math.max(0, srcDur - startOffset);
              const maxByClips = Math.max(0, clipTotal - (t.startTime || 0));
              const initial = clipTotal > 0 ? Math.min(maxByFile, maxByClips) : maxByFile;
              t.duration = initial;
            }
            t.autoClamped = false;
            arr[i] = t;
            return arr;
          });
        };
      }
    });
  }, [clips, musicTracks, clipTotal]);

  useEffect(() => {
    if (!resizeMusicState) return;
    const onMove = (e) => {
      setMusicTracks((prev) => {
        const arr = [...prev];
        const track = { ...arr[resizeMusicState.index] };
        const deltaTime = (e.clientX - resizeMusicState.startX) / resizeMusicState.pxPerSec;

        if (resizeMusicState.edge === 'end') {
          let newDuration = (resizeMusicState.origDuration || 0) + deltaTime;
          const maxDur = (resizeMusicState.sourceDuration || Infinity) - (resizeMusicState.origStartOffset || 0);
          newDuration = Math.max(0, Math.min(maxDur, newDuration));
          track.duration = newDuration;
        } else if (resizeMusicState.edge === 'start') {
          let ns = (resizeMusicState.origStartOffset || 0) + deltaTime;
          ns = Math.max(0, Math.min(ns, (resizeMusicState.origStartOffset || 0) + (resizeMusicState.origDuration || 0)));
          const end = (resizeMusicState.origStartOffset || 0) + (resizeMusicState.origDuration || 0);
          track.startOffset = ns;
          track.duration = end - ns;

          const shift = (resizeMusicState.origStartTime || 0) + ((resizeMusicState.origStartOffset || 0) - ns);
          track.startTime = Math.max(0, Math.min(shift, totalDuration - track.duration));
        }

        arr[resizeMusicState.index] = track;
        return arr;
      });
    };
    const onUp = () => {
      setResizeMusicState(null);
      const wasPlaying = videoRef.current && !videoRef.current.paused;
      seekTo(currentTime, wasPlaying);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeMusicState, totalDuration, currentTime]);

  useEffect(() => {
    if (!resizeState) return;
    const onMove = (e) => {
      setClips((prev) => {
        const arr = [...prev];
        const clip = { ...arr[resizeState.index] };
        const deltaTime = (e.clientX - resizeState.startX) / resizeState.pxPerSec;
        if (resizeState.edge === 'end') {
          let newDuration = (resizeState.origDuration || 0) + deltaTime;
          const maxDuration = (resizeState.sourceDuration ?? Infinity) - (resizeState.origStartOffset ?? 0);
          newDuration = Math.max(0, Math.min(maxDuration, newDuration));
          clip.duration = newDuration;
        } else if (resizeState.edge === 'start') {
          let ns = (resizeState.origStartOffset || 0) + deltaTime;
          ns = Math.max(0, Math.min(ns, (resizeState.origStartOffset || 0) + (resizeState.origDuration || 0)));
          const end = (resizeState.origStartOffset || 0) + (resizeState.origDuration || 0);
          clip.startOffset = ns;
          clip.duration = end - ns;
        }
        arr[resizeState.index] = clip;
        return normalizeClipsLocal(arr);
      });
    };
    const onUp = () => {
      setResizeState(null);
      const wasPlaying = videoRef.current && !videoRef.current.paused;
      seekTo(currentTime, wasPlaying);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeState, currentTime]);

  useEffect(() => {
    if (!resizeEffectState) return;
    const onMove = (e) => {
      setEffects((prev) => {
        const arr = [...prev];
        const fx = { ...arr[resizeEffectState.index] };
        const deltaTime = (e.clientX - resizeEffectState.startX) / resizeEffectState.pxPerSec;
        if (resizeEffectState.edge === 'end') {
          let newDuration = (resizeEffectState.origDuration || 0) + deltaTime;
          fx.duration = Math.max(0, Math.min(newDuration, Math.max(0, totalDuration - (fx.startTime || 0))));
        } else if (resizeEffectState.edge === 'start') {
          const newStart = (resizeEffectState.origStartTime || 0) + deltaTime;
          const maxStart = (resizeEffectState.origStartTime || 0) + (resizeEffectState.origDuration || 0) - 0.01;
          fx.startTime = Math.max(0, Math.min(newStart, Math.min(maxStart, totalDuration)));
          fx.duration = Math.max(0, Math.min((resizeEffectState.origStartTime || 0) + (resizeEffectState.origDuration || 0) - fx.startTime, totalDuration - fx.startTime));
        }
        arr[resizeEffectState.index] = fx;
        return arr;
      });
    };
    const onUp = () => {
      setResizeEffectState(null);
      const wasPlaying = videoRef.current && !videoRef.current.paused;
      seekTo(currentTime, wasPlaying);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeEffectState, totalDuration, currentTime]);

  useEffect(() => {
    if (!dragEffectState) return;
    const onMove = (e) => {
      setEffects((prev) => {
        const arr = [...prev];
        const fx = { ...arr[dragEffectState.index] };
        const deltaTime = (e.clientX - dragEffectState.startX) / dragEffectState.pxPerSec;
        let ns = (dragEffectState.origStart || 0) + deltaTime;
        ns = Math.max(0, Math.min(ns, Math.max(0, totalDuration - (dragEffectState.duration || 0))));
        fx.startTime = ns;
        arr[dragEffectState.index] = fx;
        return arr;
      });
    };
    const onUp = () => setDragEffectState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragEffectState, totalDuration]);

  useEffect(() => {
    if (!resizeTextState) return;
    const onMove = (e) => {
      setTextOverlays((prev) => {
        const arr = [...prev];
        const tx = { ...arr[resizeTextState.index] };
        const deltaTime = (e.clientX - resizeTextState.startX) / resizeTextState.pxPerSec;
        if (resizeTextState.edge === 'end') {
          let nd = (resizeTextState.origDuration || 0) + deltaTime;
          nd = Math.max(0.1, Math.min(nd, Math.max(0, totalDuration - (tx.startTime || 0))));
          tx.duration = nd;
        } else if (resizeTextState.edge === 'start') {
          let ns = (resizeTextState.origStartTime || 0) + deltaTime;
          ns = Math.max(0, Math.min(ns, (resizeTextState.origStartTime || 0) + (resizeTextState.origDuration || 0) - 0.01, totalDuration));
          tx.startTime = ns;
          tx.duration = Math.max(0.1, (resizeTextState.origStartTime || 0) + (resizeTextState.origDuration || 0) - ns);
        }
        arr[resizeTextState.index] = tx;
        return arr;
      });
    };
    const onUp = () => setResizeTextState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeTextState, totalDuration]);

  useEffect(() => {
    if (!dragTextState) return;
    const onMove = (e) => {
      setTextOverlays((prev) => {
        const arr = [...prev];
        const tx = { ...arr[dragTextState.index] };
        const deltaTime = (e.clientX - dragTextState.startX) / dragTextState.pxPerSec;
        let ns = (dragTextState.origStart || 0) + deltaTime;
        ns = Math.max(0, Math.min(ns, Math.max(0, totalDuration - (dragTextState.duration || 0))));
        tx.startTime = ns;
        arr[dragTextState.index] = tx;
        return arr;
      });
    };
    const onUp = () => setDragTextState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragTextState, totalDuration]);

  const computeFilterForTime = (t) => {
    let filters = [];
    effects.forEach((fx) => {
      const fxStart = fx.startTime || 0;
      const fxEnd = fxStart + (fx.duration || 0);
      if (t < fxStart || t > fxEnd) return;

      const rel = t - fxStart;
      const timeLeft = fxEnd - t;
      let effectiveIntensity;
      if (fx.fadeIn && rel < fx.fadeIn) {
        effectiveIntensity = (rel / fx.fadeIn) * (fx.intensity ?? 0.5);
      } else if (fx.fadeOut && timeLeft < fx.fadeOut) {
        effectiveIntensity = (timeLeft / fx.fadeOut) * (fx.intensity ?? 0.5);
      } else {
        effectiveIntensity = fx.intensity ?? 0.5;
      }
      effectiveIntensity = Math.max(0, Math.min(1, effectiveIntensity));

      if (fx.type === 'blur') {
        const px = Math.round(12 * effectiveIntensity);
        if (px > 0) filters.push(`blur(${px}px)`);
      } else if (fx.type === 'brightness') {
        const val = (1 + 0.6 * effectiveIntensity).toFixed(3);
        filters.push(`brightness(${val})`);
      } else if (fx.type === 'glow') {
        const spread = Math.round(24 * effectiveIntensity);
        const color = fx.color || 'rgba(60,207,101,0.9)';
        if (spread > 0) filters.push(`drop-shadow(0 0 ${spread}px ${color})`);
      }
    });
    return filters.join(' ');
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const seg = clips[activeClipIndex];
      let globalTime = 0;
      if (seg) {
        const segStartTime = seg.startTime || 0;
        globalTime = segStartTime + (video.currentTime - (seg.startOffset || 0));
      } else {
        globalTime = video.currentTime || 0;
      }
      setCurrentTime(globalTime);

      const wrapper = video.parentElement;
      if (wrapper) wrapper.style.filter = seg ? computeFilterForTime(globalTime) : '';

      if (seg && (video.currentTime || 0) >= (seg.startOffset || 0) + (seg.duration || 0) - 0.05) {
        if (activeClipIndex < clips.length - 1) {
          setActiveClipIndex((p) => p + 1);
        } else {
          const musicStillPlaying = musicTracks.some((track) => {
            const end = (track.startTime || 0) + (track.duration || 0);
            return globalTime < end;
          });

          if (!musicStillPlaying) {
            video.pause();
            setActiveClipIndex(0);
            setCurrentTime(0);
            const wrap2 = video.parentElement;
            if (wrap2) wrap2.style.filter = '';
            audioRefs.current.forEach((a) => { if (a) { a.pause(); a.currentTime = 0; } });
          } else {
            try {
              video.pause();
              if (video.duration && !isNaN(video.duration)) video.currentTime = Math.max(0, video.duration - 0.05);
            } catch {}
          }
        }
      }

      musicTracks.forEach((track, i) => {
        const audio = audioRefs.current[i];
        if (!audio) return;
        const trackStart = track.startTime || 0;
        const trackDur = track.duration || 0;
        const trackOffset = track.startOffset || 0;

        if (globalTime >= trackStart && globalTime <= trackStart + trackDur) {
          const rel = globalTime - trackStart;
          const desired = trackOffset + rel;
          if (Math.abs((audio.currentTime || 0) - desired) > 0.25) audio.currentTime = desired;
          if (!video.paused && audio.paused) audio.play().catch(() => {});
          if (video.paused && !audio.paused) audio.pause();
        } else if (globalTime < trackStart) {
          audio.pause();
          audio.currentTime = track.startOffset || 0;
        } else {
          audio.pause();
        }
      });
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [clips, activeClipIndex, musicTracks, effects]);

  useEffect(() => {
    if (clips.length > 0 && activeClipIndex === null) setActiveClipIndex(0);
  }, [clips, activeClipIndex]);

  const seekTo = (newGlobalTime, keepPlaying) => {
    const video = videoRef.current;
    if (!video) return;

    let newIndex = null;
    for (let i = 0; i < clips.length; i++) {
      const clipStart = clips[i].startTime || 0;
      const clipEnd = clipStart + (clips[i].duration || 0);
      if (newGlobalTime >= clipStart && newGlobalTime < clipEnd) { newIndex = i; break; }
    }

    const seg = newIndex !== null ? clips[newIndex] : null;

    if (seg) {
      const segRelative = Math.max(0, newGlobalTime - (seg.startTime || 0));
      const seekTimeInSource = (seg.startOffset || 0) + segRelative;
      setActiveClipIndex(newIndex);
      video.src = seg.source;
      video.currentTime = seekTimeInSource;
      if (keepPlaying) video.play().catch(() => {}); else video.pause();
    } else {
      setActiveClipIndex(null);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    setCurrentTime(newGlobalTime);
    const wrapper = video.parentElement;
    if (wrapper) wrapper.style.filter = computeFilterForTime(newGlobalTime);

    musicTracks.forEach((track, i) => {
      const audio = audioRefs.current[i];
      if (!audio) return;
      const start = track.startTime || 0;
      const dur = track.duration || 0;
      const off = track.startOffset || 0;
      if (newGlobalTime >= start && newGlobalTime <= start + dur) {
        const rel = newGlobalTime - start;
        audio.currentTime = off + rel;
        if (keepPlaying) audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });
  };

  const getClickTimeFromEvent = (e) => {
    const scroller = e.currentTarget.closest('.timeline-scroll');
    const scrollLeft = scroller ? scroller.scrollLeft : 0;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollLeft;
    const fullWidth = totalDuration * PX_PER_SEC;
    return Math.max(0, Math.min(totalDuration, (clickX / fullWidth) * totalDuration));
  };

  const handleSeekMouseDownCapture = (e) => {
    if (e.target.closest('.clip, .track, .effect-block, .text-block, .clip-handle, .effect-slider')) return;
    const wasPlaying = videoRef.current && !videoRef.current.paused;
    const t = getClickTimeFromEvent(e);
    seekTo(t, wasPlaying);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      const isFormField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      if (isFormField) return;

      const k = (e.key || '').toLowerCase();
      if (e.code === 'Space' || k === ' ' || k === 'spacebar' || k === 'k') {
        e.preventDefault();
        togglePlay();
      }
      if (k === 'escape') {
        clearSelection();
      }
      if (k === 'arrowleft' || k === 'j') {
        e.preventDefault();
        const wasPlaying = videoRef.current && !videoRef.current.paused;
        seekTo(Math.max(0, currentTime - 1), wasPlaying);
      }
      if (k === 'arrowright' || k === 'l') {
        e.preventDefault();
        const wasPlaying = videoRef.current && !videoRef.current.paused;
        seekTo(Math.min(totalDuration, currentTime + 1), wasPlaying);
      }

      if ((k === 'backspace' || k === 'delete') && selectedClipIndex !== null) {
        setClips((prev) => normalizeClipsLocal(prev.filter((_, i) => i !== selectedClipIndex)));
        setSelectedClipIndex(null);
        setActiveClipIndex(null);
      }
      if ((k === 'backspace' || k === 'delete') && selectedMusicIndex !== null) {
        setMusicTracks((prev) => prev.filter((_, i) => i !== selectedMusicIndex));
        setSelectedMusicIndex(null);
      }
      if ((k === 'backspace' || k === 'delete') && selectedEffectIndex !== null) {
        setEffects((prev) => prev.filter((_, i) => i !== selectedEffectIndex));
        setSelectedEffectIndex(null);
      }
      if ((k === 'backspace' || k === 'delete') && selectedTextIndex !== null) {
        setTextOverlays((prev) => prev.filter((_, i) => i !== selectedTextIndex));
        setSelectedTextIndex(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, totalDuration, selectedClipIndex, selectedMusicIndex, selectedEffectIndex, selectedTextIndex]);

  useEffect(() => {
    const video = videoRef.current;
    const seg = clips[activeClipIndex];
    if (!video || !seg || !seg.source) return;

    let source = seg.source;
    if (seg.file && seg.source.startsWith('blob:')) source = URL.createObjectURL(seg.file);

    video.src = source;
    video.currentTime = seg.startOffset || 0;
    const playPromise = video.play();
    if (playPromise !== undefined) playPromise.catch(() => {});
  }, [activeClipIndex, clips]);

  const addTextAtPlayhead = () => {
    setTextOverlays((prev) => [
      ...prev,
      { id: crypto.randomUUID(), content: newText || 'New Text', startTime: currentTime, duration: 5, x: 50, y: 50, color: newTextColor, fontSize: newTextSize }
    ]);
  };

  const startStageTextDrag = (e, index) => {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tx = textOverlays[index];
    if (!tx) return;
    setDragTextStageState({ index, startX: e.clientX, startY: e.clientY, origX: tx.x || 50, origY: tx.y || 50, rectW: rect.width, rectH: rect.height });
  };

  useEffect(() => {
    if (!dragTextStageState) return;
    const onMove = (e) => {
      setTextOverlays((prev) => {
        const arr = [...prev];
        const tx = { ...arr[dragTextStageState.index] };
        const dx = ((e.clientX - dragTextStageState.startX) / dragTextStageState.rectW) * 100;
        const dy = ((e.clientY - dragTextStageState.startY) / dragTextStageState.rectH) * 100;
        let nx = (dragTextStageState.origX || 0) + dx;
        let ny = (dragTextStageState.origY || 0) + dy;
        nx = Math.max(0, Math.min(100, nx));
        ny = Math.max(0, Math.min(100, ny));
        tx.x = nx; tx.y = ny;
        arr[dragTextStageState.index] = tx;
        return arr;
      });
    };
    const onUp = () => setDragTextStageState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragTextStageState]);

  const activeTexts = useMemo(
    () => textOverlays.map((t, i) => ({ ...t, _i: i })).filter((t) => currentTime >= (t.startTime || 0) && currentTime <= (t.startTime || 0) + (t.duration || 0)),
    [textOverlays, currentTime]
  );

  const selectedEffect = selectedEffectIndex != null ? effects[selectedEffectIndex] : null;
  const selectedEffectValue100 = selectedEffect ? Math.round((selectedEffect.intensity ?? 0.5) * 100) : 50;

  return (
    <AuthenticatedLayout hideNavbar={true}>
      <Head title={project.name} />
      <div className="editor-container" onClick={clearSelection}>
        <div style={{ display: 'none' }}>
          {clips.map((clip, i) => (<video key={i} src={clip.source} preload="auto" />))}
        </div>

        <div className="editor-header" onClick={(e) => e.stopPropagation()}>
          <h2>{project.name}</h2>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {selectedEffect && (
              <div className="effect-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>Effect Intensity</span>
                <input
                  type="range"
                  min="1" max="100"
                  value={selectedEffectValue100}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(100, parseInt(e.target.value || 50)));
                    setEffects((prev) => { const arr = [...prev]; arr[selectedEffectIndex] = { ...arr[selectedEffectIndex], intensity: v / 100 }; return arr; });
                  }}
                />
                <input
                  type="number"
                  min="1" max="100"
                  value={selectedEffectValue100}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value || '50', 10);
                    const v = isNaN(raw) ? 50 : Math.max(1, Math.min(100, raw));
                    setEffects((prev) => { const arr = [...prev]; arr[selectedEffectIndex] = { ...arr[selectedEffectIndex], intensity: v / 100 }; return arr; });
                  }}
                  style={{ width: 64, background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '6px 8px' }}
                />
              </div>
            )}
            <button onClick={handleCut} className="cut-btn">✂️ Cut</button>
            <button onClick={goBack} className="back-btn">Back</button>
            <button onClick={handleSave} className="save-btn">Save</button>
          </div>
        </div>

        <div className="editor-main" onClick={(e) => e.stopPropagation()}>
          <div className="media-library">
            <h3>Media Library</h3>

            <div
              className="upload-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileUpload({ target: { files: e.dataTransfer.files } }); }}
              onClick={() => document.getElementById('hiddenFileInput').click()}
            >
              <p style={{ fontSize: '10px' }}>Drop files here or click to upload</p>
              <input id="hiddenFileInput" type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>

            <div className="media-section effects-section">
              <h4>✨ Effects</h4>
              <div className="section-divider" />
              {EFFECT_PRESETS.map((fx) => (
                <div key={fx.key} draggable onDragStart={(e) => handleDragStart(e, { kind: 'effect', effect: fx })} className="media-item effect-item">
                  {fx.name}
                </div>
              ))}
              <p className="hint">Drag onto the timeline to apply.</p>
            </div>

            <div className="media-section text-section">
              <h4>🅣 Text</h4>
              <div className="section-divider" />
              <div className="media-item text-item" draggable onDragStart={(e) => handleDragStart(e, { kind: 'text' })}>
                New Text
              </div>
              <div className="text-add-inline" style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px auto', gap: 8, marginTop: 8 }}>
                <input className="text-input" value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Your text" style={{ background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '8px 10px' }} />
                <input className="text-size" type="number" min="12" max="96" value={newTextSize} onChange={(e) => setNewTextSize(parseInt(e.target.value || 32))} style={{ background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '8px 10px' }} />
                <input className="text-color" type="color" value={newTextColor} onChange={(e) => setNewTextColor(e.target.value)} style={{ height: 36, borderRadius: 6, border: '1px solid #333' }} />
                <button className="text-add-btn" onClick={addTextAtPlayhead} style={{ padding: '8px 14px', borderRadius: 8, background: 'linear-gradient(90deg, var(--green-1), var(--green-2))', color: 'var(--light)', fontWeight: 700 }}>Add</button>
              </div>
              {selectedTextIndex !== null && textOverlays[selectedTextIndex] && (
                <div className="text-edit-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', gap: 8, marginTop: 10 }}>
                  <input
                    className="text-input"
                    value={textOverlays[selectedTextIndex].content}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTextOverlays((prev) => { const arr = [...prev]; arr[selectedTextIndex] = { ...arr[selectedTextIndex], content: v }; return arr; });
                    }}
                    style={{ background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '8px 10px' }}
                  />
                  <input
                    className="text-size"
                    type="number"
                    min="12"
                    max="96"
                    value={textOverlays[selectedTextIndex].fontSize || 32}
                    onChange={(e) => {
                      const v = Math.max(12, Math.min(96, parseInt(e.target.value || 32)));
                      setTextOverlays((prev) => { const arr = [...prev]; arr[selectedTextIndex] = { ...arr[selectedTextIndex], fontSize: v }; return arr; });
                    }}
                    style={{ background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '8px 10px' }}
                  />
                  <input
                    className="text-color"
                    type="color"
                    value={textOverlays[selectedTextIndex].color || '#FCFFFC'}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTextOverlays((prev) => { const arr = [...prev]; arr[selectedTextIndex] = { ...arr[selectedTextIndex], color: v }; return arr; });
                    }}
                    style={{ height: 36, borderRadius: 6, border: '1px solid #333' }}
                  />
                </div>
              )}
            </div>

            <div className="media-section video-section">
              <h4>📹 Video</h4>
              <div className="section-divider" />
              {mediaFiles.filter((f) => f.type === 'video').map((file, index) => (
                <div key={`vid-${index}`} draggable onDragStart={(e) => handleDragStart(e, { kind: 'media', file })} className="media-item">
                  {file.name}
                </div>
              ))}
            </div>

            <div className="media-section audio-section">
              <h4>🎵 Audio</h4>
              <div className="section-divider" />
              {mediaFiles.filter((f) => f.type === 'audio').map((file, index) => (
                <div key={`aud-${index}`} draggable onDragStart={(e) => handleDragStart(e, { kind: 'media', file })} className="media-item">
                  {file.name}
                </div>
              ))}
            </div>
          </div>

          <div className="editor-area" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
            <div className="video-player" onClick={(e) => e.stopPropagation()}>
              <video ref={videoRef} />
              <div className="overlay-stage" ref={stageRef} onMouseDown={() => setSelectedTextIndex(null)}>
                {activeTexts.map((t) => (
                  <div
                    key={t.id}
                    className={`overlay-text ${selectedTextIndex === t._i ? 'selected' : ''}`}
                    style={{ left: `${t.x || 50}%`, top: `${t.y || 50}%`, fontSize: `${t.fontSize || 32}px`, color: t.color || '#FCFFFC' }}
                    onMouseDown={(e) => {
                      selectText(t._i);
                      startStageTextDrag(e, t._i);
                    }}
                  >
                    {t.content}
                  </div>
                ))}
              </div>
              <button className="play-btn" onClick={togglePlay}>Play / Pause</button>
            </div>

            <div className="timeline-scroll" onClick={(e) => e.stopPropagation()}>
              <div
                className="effects-timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={() => clearSelection()}
              >
                <div className="lane" style={{ width: `${totalDuration * PX_PER_SEC}px` }}>
                  {effects.map((fx, index) => {
                    const width = Math.max(2, (fx.duration || 0) * PX_PER_SEC);
                    const left = Math.max(0, (fx.startTime || 0) * PX_PER_SEC);
                    const isSelected = selectedEffectIndex === index;
                    return (
                      <div
                        key={fx.id}
                        className={`effect-block ${isSelected ? 'selected' : ''}`}
                        style={{ width: `${width}px`, left: `${left}px` }}
                        draggable={!isSelected}
                        onDragStart={(e) => !isSelected && handleEffectDragStart(e, index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleEffectDrop(e, index)}
                        onMouseDown={(e) => startEffectDrag(e, index)}
                        onClick={(e) => { e.stopPropagation(); selectEffect(index); }}
                      >
                        <span>{fx.name}</span>
                        {isSelected && (
                          <>
                            <div className="clip-handle left" onMouseDown={(e) => startEffectResize(e, index, 'start')} />
                            <div className="clip-handle right" onMouseDown={(e) => startEffectResize(e, index, 'end')} />
                            <input
                              type="range"
                              min="0" max="1" step="0.05"
                              value={fx.intensity ?? 0.5}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setEffects((prev) => { const arr = [...prev]; arr[index] = { ...arr[index], intensity: val }; return arr; });
                              }}
                              className="effect-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="playhead" style={{ left: `${currentTime * PX_PER_SEC}px` }} />
                </div>
              </div>

              <div
                className="text-timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={() => clearSelection()}
              >
                <div className="lane" style={{ width: `${totalDuration * PX_PER_SEC}px` }}>
                  {textOverlays.map((tx, index) => {
                    const width = Math.max(2, (tx.duration || 0) * PX_PER_SEC);
                    const left = Math.max(0, (tx.startTime || 0) * PX_PER_SEC);
                    const isSelected = selectedTextIndex === index;
                    return (
                      <div
                        key={tx.id}
                        className={`text-block ${isSelected ? 'selected' : ''}`}
                        style={{ width: `${width}px`, left: `${left}px` }}
                        onMouseDown={(e) => startTextDrag(e, index)}
                        onClick={(e) => { e.stopPropagation(); selectText(index); }}
                      >
                        <span className="text-block-label">{tx.content}</span>
                        {isSelected && (
                          <>
                            <div className="clip-handle left" onMouseDown={(e) => startTextResize(e, index, 'start')} />
                            <div className="clip-handle right" onMouseDown={(e) => startTextResize(e, index, 'end')} />
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="playhead" style={{ left: `${currentTime * PX_PER_SEC}px` }} />
                </div>
              </div>

              <div
                className="timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={() => clearSelection()}
              >
                <div className="lane" style={{ width: `${totalDuration * PX_PER_SEC}px` }}>
                  {clips.map((clip, index) => {
                    const width = Math.max(2, (clip.duration || 0) * PX_PER_SEC);
                    const isSelected = selectedClipIndex === index;
                    return (
                      <div
                        key={index}
                        draggable={!isSelected}
                        onDragStart={(e) => handleClipDragStart(e, index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleClipDrop(e, index)}
                        onClick={(e) => { e.stopPropagation(); selectClip(index); }}
                        className={`clip ${isSelected ? 'selected' : ''}`}
                        style={{ width: `${width}px` }}
                      >
                        {clip.name}
                        {isSelected && (
                          <>
                            <div className="clip-handle left" onMouseDown={(e) => startResize(e, index, 'start')} />
                            <div className="clip-handle right" onMouseDown={(e) => startResize(e, index, 'end')} />
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="playhead" style={{ left: `${currentTime * PX_PER_SEC}px` }} />
                </div>
              </div>

              <div
                className="music-timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={() => clearSelection()}
              >
                <div className="lane" style={{ width: `${totalDuration * PX_PER_SEC}px` }}>
                  {musicTracks.map((track, index) => {
                    const width = Math.max(2, (track.duration || 0) * PX_PER_SEC);
                    const left = Math.max(0, (track.startTime || 0) * PX_PER_SEC);
                    const isSelected = selectedMusicIndex === index;
                    return (
                      <div
                        key={index}
                        draggable
                        onDragStart={(e) => handleTrackDragStart(e, index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleTrackDrop(e, index)}
                        onClick={(e) => { e.stopPropagation(); selectMusic(index); }}
                        className={`track ${isSelected ? 'selected' : ''}`}
                        style={{ width: `${width}px`, left: `${left}px` }}
                      >
                        {track.name}
                        <audio ref={(el) => (audioRefs.current[index] = el)} src={track.source} />
                        {isSelected && (
                          <>
                            <div className="clip-handle left" onMouseDown={(e) => startMusicResize(e, index, 'start')} />
                            <div className="clip-handle right" onMouseDown={(e) => startMusicResize(e, index, 'end')} />
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="playhead" style={{ left: `${currentTime * PX_PER_SEC}px` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
