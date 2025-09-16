import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';
import '@/../css/Editor.css';
import '@/../css/EditorMobile.css'; // 📱 mobile overrides

// ====== Simple effect presets (drag from library) ======
const EFFECT_PRESETS = [
  {
    key: 'glow',
    name: 'Glow',
    type: 'glow',
    intensity: 0.8, // 0..1
    color: 'rgba(60,207,101,0.9)',
    fadeIn: 0.5,
    fadeOut: 0.5,
    duration: 4,
  },
  {
    key: 'blur',
    name: 'Blur',
    type: 'blur',
    intensity: 0.5, // 0..1 maps to ~6px
    fadeIn: 0.3,
    fadeOut: 0.3,
    duration: 3,
  },
  {
    key: 'brightness',
    name: 'Brightness',
    type: 'brightness',
    intensity: 0.3, // 0..1 maps to 1..1.6
    fadeIn: 0.4,
    fadeOut: 0.4,
    duration: 5,
  },
];

export default function Editor({ project }) {
  const resolveLocal = (key, fallback = '') => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_) {
      return fallback;
    }
  };

  const [mediaFiles, setMediaFiles] = useState(() =>
    (project.media_files || []).map((f) => {
      if (f.source?.startsWith('local-')) {
        const data = resolveLocal(f.source, '');
        return { ...f, source: data, storageKey: f.source };
      }
      return f;
    })
  );

  const [clips, setClips] = useState(() =>
    (project.clips || []).map((c) => {
      if (c.source?.startsWith('local-')) {
        const data = resolveLocal(c.source, '');
        return { ...c, source: data, storageKey: c.source };
      }
      return c;
    })
  );

  const [musicTracks, setMusicTracks] = useState(() =>
    (project.music_tracks || []).map((t) => {
      if (t.source?.startsWith('local-')) {
        const data = resolveLocal(t.source, '');
        return { ...t, source: data, storageKey: t.source };
      }
      return t;
    })
  );

  // ===== NEW: Effects state =====
  // If project.effects exist, use them; otherwise seed with a couple defaults
  const [effects, setEffects] = useState(() => {
    if (Array.isArray(project.effects) && project.effects.length) return project.effects;
    return [
      { id: crypto.randomUUID(), name: 'Glow', type: 'glow', color: 'rgba(60,207,101,0.9)', intensity: 0.8, startTime: 0, duration: 4, fadeIn: 0.5, fadeOut: 0.5 },
      { id: crypto.randomUUID(), name: 'Blur', type: 'blur', intensity: 0.5, startTime: 4.5, duration: 3, fadeIn: 0.3, fadeOut: 0.3 },
    ];
  });

  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [selectedMusicIndex, setSelectedMusicIndex] = useState(null);

  // NEW: selection for effect blocks
  const [selectedEffectIndex, setSelectedEffectIndex] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [globalDuration, setGlobalDuration] = useState(60);

  const videoRef = useRef(null);
  const audioRefs = useRef([]);

  // Existing resize state for clips
  const [resizeState, setResizeState] = useState(null);
  // NEW: resize state for effects
  const [resizeEffectState, setResizeEffectState] = useState(null);

  // --- HELPERS TO NORMALIZE TIMELINE (keep your originals local) ---
  const normalizeClipsLocal = (clipsArr) => {
    let accumulated = 0;
    return clipsArr.map((clip) => {
      const c = { ...clip };
      c.startTime = accumulated;
      accumulated += c.duration || 0;
      return c;
    });
  };

  const normalizeTracksLocal = (tracksArr) => {
    let accumulated = 0;
    return tracksArr.map((track) => {
      const t = { ...track };
      t.startTime = accumulated;
      accumulated += t.duration || 0;
      return t;
    });
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play();
    else videoRef.current.pause();
  };

  const goBack = () => router.get(route('dashboard'));

  // Store uploaded files as data URLs in localStorage
  const handleFileUpload = async (e) => {
    const uploads = Array.from(e.target.files);

    const files = await Promise.all(
      uploads.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            const key = `local-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
            reader.onload = () => {
              const dataUrl = reader.result;
              try {
                localStorage.setItem(key, dataUrl);
              } catch (_) {
                // ignore quota errors
              }
              resolve({
                name: file.name,
                source: dataUrl,
                storageKey: key,
                duration: 0,
                type: file.type.startsWith('audio/') ? 'audio' : 'video',
                startOffset: 0,
                startTime: 0,
                sourceDuration: 0,
              });
            };
            reader.readAsDataURL(file);
          })
      )
    );

    // ✅ Add ALL files (video + audio) only to Media Library
    setMediaFiles((prev) => [...prev, ...files]);
  };

  // Drag from media/effects libraries
  const handleDragStart = (e, payload) => {
    e.dataTransfer.setData('payload', JSON.stringify(payload));
  };

  // Drop onto timeline area: decide whether it’s media or effect
  const handleDrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('payload');
    if (!data) return;
    const payload = JSON.parse(data);

    // Drop position time
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const timelineWidth = rect.width;
    const dropTime = (dropX / timelineWidth) * totalDuration;

    if (payload.kind === 'media') {
      const file = payload.file;
      if (!file) return;

      if (file.type === 'video') {
        setClips((prev) =>
          normalizeClipsLocal([
            ...prev,
            {
              ...file,
              startOffset: 0,
              startTime: prev.reduce((sum, c) => sum + (c.duration || 0), 0),
            },
          ])
        );
      } else if (file.type === 'audio') {
        setMusicTracks((prev) =>
          normalizeTracksLocal([...prev, { ...file, startTime: dropTime, startOffset: 0 }])
        );
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
            startTime: dropTime,   // ✅ drop where user placed
            duration: base.duration ?? 5,
            fadeIn: base.fadeIn ?? 0,
            fadeOut: base.fadeOut ?? 0,
          },
        ]);
      }
      
}


  const handleSave = () => {
    const mediaToSave = mediaFiles.map(({ storageKey, source, ...rest }) => ({
      ...rest,
      source: storageKey || source,
    }));
    const clipsToSave = clips.map(({ storageKey, source, ...rest }) => ({
      ...rest,
      source: storageKey || source,
    }));
    const tracksToSave = musicTracks.map(({ storageKey, source, ...rest }) => ({
      ...rest,
      source: storageKey || source,
    }));

    // Save effects as-is
    const effectsToSave = effects.map((e) => ({ ...e }));

    router.put(route('projects.update', project.id), {
      media_files: mediaToSave,
      clips: clipsToSave,
      music_tracks: tracksToSave,
      effects: effectsToSave,
    });
  };

  const handleCut = () => {
    if (selectedClipIndex !== null) {
      const targetIndex = selectedClipIndex;
      const clip = clips[targetIndex];
      if (!clip || clip.type === 'gap') return;

      const relativeTime = currentTime - (clip.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (clip.duration || 0)) return;

      const before = {
        ...clip,
        startOffset: clip.startOffset || 0,
        startTime: clip.startTime,
        duration: relativeTime,
      };
      const after = {
        ...clip,
        startOffset: (clip.startOffset || 0) + relativeTime,
        startTime: (clip.startTime || 0) + relativeTime,
        duration: (clip.duration || 0) - relativeTime,
      };

      setClips((prev) => {
        const newClips = [
          ...prev.slice(0, targetIndex),
          before,
          after,
          ...prev.slice(targetIndex + 1),
        ];
        return normalizeClipsLocal(newClips);
      });

      setSelectedClipIndex(targetIndex + 1);
      return;
    }

    if (selectedMusicIndex !== null) {
      const tIndex = selectedMusicIndex;
      const track = musicTracks[tIndex];
      if (!track) return;

      const relativeTime = currentTime - (track.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (track.duration || 0)) return;

      const before = {
        ...track,
        startOffset: track.startOffset || 0,
        startTime: track.startTime,
        duration: relativeTime,
      };

      const after = {
        ...track,
        startOffset: (track.startOffset || 0) + relativeTime,
        startTime: (track.startTime || 0) + relativeTime,
        duration: (track.duration || 0) - relativeTime,
      };

      setMusicTracks((prev) => {
        const newTracks = [
          ...prev.slice(0, tIndex),
          before,
          after,
          ...prev.slice(tIndex + 1),
        ];
        return normalizeTracksLocal(newTracks);
      });

      setSelectedMusicIndex(tIndex + 1);
      return;
    }

    if (selectedEffectIndex !== null) {
      const eIndex = selectedEffectIndex;
      const fx = effects[eIndex];
      if (!fx) return;

      const relativeTime = currentTime - (fx.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (fx.duration || 0)) return;

      const before = {
        ...fx,
        startTime: fx.startTime,
        duration: relativeTime,
      };

      const after = {
        ...fx,
        startTime: (fx.startTime || 0) + relativeTime,
        duration: (fx.duration || 0) - relativeTime,
      };

      setEffects((prev) => {
        const arr = [...prev];
        arr.splice(eIndex, 1, before, after);
        return arr;
      });

      setSelectedEffectIndex(eIndex + 1);
      return;
    }
  };

  // --- DRAG & DROP reordering for clips/tracks (keep your handlers) ---
  const handleClipDragStart = (e, index) => {
    e.dataTransfer.setData('clipIndex', index);
  };
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

    setSelectedClipIndex(dropIndex);
  };

  const handleTrackDragStart = (e, index) => {
    e.dataTransfer.setData('trackIndex', index);
  };
  const handleTrackDrop = (e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('trackIndex'));
    if (draggedIndex === dropIndex) return;

    setMusicTracks((prev) => {
      const updated = [...prev];
      const [draggedTrack] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, draggedTrack);
      return normalizeTracksLocal(updated);
    });

    setSelectedMusicIndex(dropIndex);
  };

  // --- EFFECTS: reorder by drag between lanes positions (visual only) ---
  const handleEffectDragStart = (e, index) => {
    e.dataTransfer.setData('effectIndex', index);
  };
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
    setSelectedEffectIndex(dropIndex);
  };

  // --- CLIP RESIZING (existing) ---
  const startResize = (e, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = clips[index];
    if (!clip) return;
    const pxPerSec = 1200 / totalDuration;
    setResizeState({
      index,
      edge,
      startX: e.clientX,
      origStartOffset: clip.startOffset || 0,
      origDuration: clip.duration || 0,
      sourceDuration: clip.sourceDuration || clip.duration || 0,
      pxPerSec,
    });
  };

  // --- EFFECT RESIZING (new) ---
  const startEffectResize = (e, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const fx = effects[index];
    if (!fx) return;
    const pxPerSec = 1200 / totalDuration;
    setResizeEffectState({
      index,
      edge,
      startX: e.clientX,
      origStartTime: fx.startTime || 0,
      origDuration: fx.duration || 0,
      pxPerSec,
    });
  };

  // --- LOAD CLIP & TRACK METADATA ---
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
              t.duration = Math.max(0, srcDur - startOffset);
            }
            arr[i] = t;
            return normalizeTracksLocal(arr);
          });
        };
      }
    });
  }, [clips, musicTracks]);

  const totalDuration = useMemo(() => {
    const clipDur = clips.reduce((sum, c) => sum + (c.duration || 0), 0);
  
    // Music should consider startTime + duration (not just duration sum)
    const musicDur = musicTracks.reduce((max, t) => {
      const end = (t.startTime || 0) + (t.duration || 0);
      return Math.max(max, end);
    }, 0);
  
    // Effects can also extend the timeline
    const effectDur = effects.reduce((max, fx) => {
      const end = (fx.startTime || 0) + (fx.duration || 0);
      return Math.max(max, end);
    }, 0);
  
    return Math.max(clipDur, musicDur, effectDur, globalDuration);
  }, [clips, musicTracks, effects, globalDuration]);
  
  

  // Handle clip resize dragging
  useEffect(() => {
    if (!resizeState) return;
    const onMove = (e) => {
      setClips((prev) => {
        const arr = [...prev];
        const clip = { ...arr[resizeState.index] };
        const deltaTime = (e.clientX - resizeState.startX) / resizeState.pxPerSec;
        if (resizeState.edge === 'end') {
          let newDuration = resizeState.origDuration + deltaTime;
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
    const onUp = () => setResizeState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeState]);

  // Handle effect resize dragging
  useEffect(() => {
    if (!resizeEffectState) return;
    const onMove = (e) => {
      setEffects((prev) => {
        const arr = [...prev];
        const fx = { ...arr[resizeEffectState.index] };
        const deltaTime = (e.clientX - resizeEffectState.startX) / resizeEffectState.pxPerSec;
        if (resizeEffectState.edge === 'end') {
          let newDuration = (resizeEffectState.origDuration || 0) + deltaTime;
          newDuration = Math.max(0, newDuration);
          fx.duration = newDuration;
        } else if (resizeEffectState.edge === 'start') {
          // Move start, shorten from the left
          const newStart = (resizeEffectState.origStartTime || 0) + deltaTime;
          const maxStart = (resizeEffectState.origStartTime || 0) + (resizeEffectState.origDuration || 0) - 0.01;
          fx.startTime = Math.max(0, Math.min(newStart, maxStart));
          fx.duration = (resizeEffectState.origStartTime || 0) + (resizeEffectState.origDuration || 0) - fx.startTime;
        }
        arr[resizeEffectState.index] = fx;
        return arr;
      });
    };
    const onUp = () => setResizeEffectState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeEffectState]);

  // ===== EFFECT RENDERING: compute CSS filters based on active effects =====
  const computeFilterForTime = (t) => {
    let filters = [];
  
    effects.forEach((fx) => {
      const fxStart = fx.startTime || 0;
      const fxEnd = fxStart + (fx.duration || 0);
  
      if (t < fxStart || t > fxEnd) return;
  
      const rel = t - fxStart;
      const timeLeft = fxEnd - t;
  
      let effectiveIntensity;
  
      // Fade-in ramp
      if (fx.fadeIn && rel < fx.fadeIn) {
        effectiveIntensity = (rel / fx.fadeIn) * (fx.intensity ?? 0.5);
      }
      // Fade-out ramp
      else if (fx.fadeOut && timeLeft < fx.fadeOut) {
        effectiveIntensity = (timeLeft / fx.fadeOut) * (fx.intensity ?? 0.5);
      }
      // Middle section = full effect
      else {
        effectiveIntensity = fx.intensity ?? 0.5;
      }
  
      // Clamp 0..1
      effectiveIntensity = Math.max(0, Math.min(1, effectiveIntensity));
  
      // ✅ Apply effect
      if (fx.type === 'blur') {
        const px = Math.round(12 * effectiveIntensity);
        if (px > 0) filters.push(`blur(${px}px)`);
      } else if (fx.type === 'brightness') {
        const val = (1 + 0.6 * effectiveIntensity).toFixed(3);
        filters.push(`brightness(${val})`);
      } else if (fx.type === 'glow') {
        const spread = Math.round(24 * effectiveIntensity);
        const color = fx.color || 'rgba(60,207,101,0.9)';
        if (spread > 0) {
          filters.push(`drop-shadow(0 0 ${spread}px ${color})`);
        }
      }
    });
  
    return filters.join(' ');
  };
  

  // Apply filters each time video clock ticks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
        const seg = clips[activeClipIndex];
      
        // Compute global time safely
        let globalTime = 0;
        if (seg) {
          const segStartTime = seg.startTime || 0;
          globalTime = segStartTime + (video.currentTime - (seg.startOffset || 0));
        } else {
          // fallback: use video currentTime directly if no clip
          globalTime = video.currentTime || 0;
        }
        setCurrentTime(globalTime);
      
        // Update CSS filters only if a video segment is active
        const wrapper = video.parentElement;
        if (wrapper) {
          if (seg) {
            wrapper.style.filter = computeFilterForTime(globalTime);
          } else {
            wrapper.style.filter = ''; // no video clip → clear filters
          }
        }
      
        if (seg && (video.currentTime || 0) >= (seg.startOffset || 0) + (seg.duration || 0) - 0.05) {
            if (activeClipIndex < clips.length - 1) {
              setActiveClipIndex((p) => p + 1);
            } else {
              // ✅ only reset if there's no music playing beyond video
              const musicStillPlaying = musicTracks.some(track => {
                const end = (track.startTime || 0) + (track.duration || 0);
                return globalTime < end; // music extends past video
              });
          
              if (!musicStillPlaying) {
                video.pause();
                setActiveClipIndex(0);
                setCurrentTime(0);
                const wrap2 = video.parentElement;
                if (wrap2) wrap2.style.filter = '';
                audioRefs.current.forEach((a) => {
                  if (a) {
                    a.pause();
                    a.currentTime = 0;
                  }
                });
              } else {
                // ✅ freeze last frame instead of black screen
                video.pause();
                try {
                  video.currentTime = Math.max(0, video.duration - 0.05);
                } catch (e) {
                  // ignore if duration not ready
                }
              }              
            }
          }          

      // Sync audio tracks
      musicTracks.forEach((track, i) => {
        const audio = audioRefs.current[i];
        if (!audio) return;

        const trackStart = track.startTime || 0;
        const trackDur = track.duration || 0;
        const trackOffset = track.startOffset || 0;

        if (globalTime >= trackStart && globalTime <= trackStart + trackDur) {
          const rel = globalTime - trackStart;
          const desired = trackOffset + rel;
          if (Math.abs((audio.currentTime || 0) - desired) > 0.25) {
            audio.currentTime = desired;
          }
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

  // Update filter on seek
  const applyFilterAtTime = (t) => {
    const video = videoRef.current;
    if (!video) return;
    const wrapper = video.parentElement;
    if (wrapper) {
      wrapper.style.filter = computeFilterForTime(t);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollX = e.currentTarget.parentElement.scrollLeft; // ✅ get scroll offset
    const clickX = e.clientX - rect.left + scrollX;
    const fullWidth = totalDuration * 20; // ✅ use full scaled width
    const newGlobalTime = (clickX / fullWidth) * totalDuration;
    

    let newIndex = 0;
    for (let i = 0; i < clips.length; i++) {
      const clipStart = clips[i].startTime || 0;
      const clipEnd = clipStart + (clips[i].duration || 0);
      if (newGlobalTime >= clipStart && newGlobalTime < clipEnd) {
        newIndex = i;
        break;
      }
    }

    const seg = clips[newIndex];
    if (!seg) return;

    const segRelative = Math.max(0, newGlobalTime - (seg.startTime || 0));
    const seekTimeInSource = (seg.startOffset || 0) + segRelative;

    // remember playback state
    const wasPlaying = videoRef.current && !videoRef.current.paused;

    setActiveClipIndex(newIndex);

    if (videoRef.current) {
      videoRef.current.src = seg.source;
      videoRef.current.currentTime = seekTimeInSource;

      if (wasPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }

    setCurrentTime(newGlobalTime);
    applyFilterAtTime(newGlobalTime);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }

      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedClipIndex !== null) {
        setClips((prev) => normalizeClipsLocal(prev.filter((_, i) => i !== selectedClipIndex)));
        setSelectedClipIndex(null);
      }

      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedMusicIndex !== null) {
        setMusicTracks((prev) => normalizeTracksLocal(prev.filter((_, i) => i !== selectedMusicIndex)));
        setSelectedMusicIndex(null);
      }

      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedEffectIndex !== null) {
        setEffects((prev) => prev.filter((_, i) => i !== selectedEffectIndex));
        setSelectedEffectIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipIndex, selectedMusicIndex, selectedEffectIndex, currentTime, musicTracks]);

  // ======== Video source swapping when clip index changes ========
  useEffect(() => {
    const video = videoRef.current;
    const seg = clips[activeClipIndex];
    if (!video || !seg || !seg.source) return;

    // regenerate blob URL if needed
    let source = seg.source;
    if (seg.file && seg.source.startsWith('blob:')) {
      source = URL.createObjectURL(seg.file);
    }

    video.src = source;
    video.currentTime = seg.startOffset || 0;

    const playPromise = video.play();
    if (playPromise !== undefined) playPromise.catch(() => {});
  }, [activeClipIndex, clips]);

  return (
    <AuthenticatedLayout hideNavbar={true}>
      <Head title={project.name} />

      <div className="editor-container">
        <div style={{ display: "none" }}>
          {clips.map((clip, i) => (
            <video key={i} src={clip.source} preload="auto" />
          ))}
        </div>

        <div className="editor-header">
          <h2>{project.name}</h2>
          <div>
            <button onClick={handleCut} className="cut-btn">✂️ Cut</button>
            <button onClick={goBack} className="back-btn">Back</button>
            <button onClick={handleSave} className="save-btn">Save</button>
          </div>
        </div>

        <div className="editor-main">
          {/* ===== Left Sidebar: Media + Effects Library ===== */}
          <div className="media-library">
            <h3>Media Library</h3>

            <div
              className="upload-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileUpload({ target: { files: e.dataTransfer.files } });
              }}
              onClick={() => document.getElementById('hiddenFileInput').click()}
            >
              <p style={{ fontSize: "10px" }}>Drop files here or click to upload</p>
              <input
                id="hiddenFileInput"
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
            </div>

            {/* --- Effects Library --- */}
            <div className="media-section effects-section">
              <h4>✨ Effects</h4>
              <div className="section-divider" />
              {EFFECT_PRESETS.map((fx) => (
                <div
                  key={fx.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, { kind: 'effect', effect: fx })}
                  className="media-item effect-item"
                >
                  {fx.name}
                </div>
              ))}
              <p className="hint">Drag onto the timeline to apply.</p>
            </div>

            {/* --- Video Section --- */}
            <div className="media-section video-section">
              <h4>📹 Video</h4>
              <div className="section-divider" />
              {mediaFiles.filter(f => f.type === 'video').map((file, index) => (
                <div
                  key={`vid-${index}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, { kind: 'media', file })}
                  className="media-item"
                >
                  {file.name}
                </div>
              ))}
            </div>

            {/* --- Audio Section --- */}
            <div className="media-section audio-section">
              <h4>🎵 Audio</h4>
              <div className="section-divider" />
              {mediaFiles.filter(f => f.type === 'audio').map((file, index) => (
                <div
                  key={`aud-${index}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, { kind: 'media', file })}
                  className="media-item"
                >
                  {file.name}
                </div>
              ))}
            </div>
          </div>

          {/* ===== Right: Player + Timelines ===== */}
          <div
            className="editor-area"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="video-player">
              {/* filter is applied to this wrapper via JS */}
              <video ref={videoRef} />
              <button className="play-btn" onClick={togglePlay}>
                Play / Pause
              </button>
            </div>

{/* ===== Unified Scrollable Timeline ===== */}
<div className="timeline-scroll">
  {/* ===== Effects timeline (TOP) ===== */}
  <div
    className="effects-timeline"
    onClick={(e) => {
      e.stopPropagation();
      setSelectedEffectIndex(null);
    }}
  >
    <div
      className="flex items-center"
      style={{ width: `${totalDuration * 20}px`, position: 'relative' }}
    >
      {effects.map((fx, index) => {
        const width = (fx.duration / totalDuration) * (totalDuration * 20);
        const left = (fx.startTime / totalDuration) * (totalDuration * 20);
        const isSelected = selectedEffectIndex === index;

        return (
          <div
            key={fx.id}
            draggable={!isSelected}
            onDragStart={(e) => !isSelected && handleEffectDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleEffectDrop(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedEffectIndex(isSelected ? null : index);
            }}
            className={`effect-block ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px`, left: `${left}px` }}
          >
            {isSelected && (
              <>
                <div
                  className="clip-handle left"
                  onMouseDown={(e) => startEffectResize(e, index, 'start')}
                />
                <div
                  className="clip-handle right"
                  onMouseDown={(e) => startEffectResize(e, index, 'end')}
                />
              </>
            )}
            <span>{fx.name}</span>
            {isSelected && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fx.intensity ?? 0.5}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setEffects((prev) => {
                    const arr = [...prev];
                    arr[index] = { ...arr[index], intensity: val };
                    return arr;
                  });
                }}
                className="effect-slider"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        );
      })}

      <div
        className="playhead"
        style={{
          left: `${(currentTime / totalDuration) * (totalDuration * 20)}px`,
        }}
      />
    </div>
  </div>

  {/* ===== Media clips timeline (MIDDLE) ===== */}
  <div className="timeline" onClick={handleSeek}>
    <div
      className="flex items-center"
      style={{ width: `${totalDuration * 20}px` }}
    >
      {clips.map((clip, index) => {
        const width = (clip.duration / totalDuration) * (totalDuration * 20);
        const isSelected = selectedClipIndex === index;
        return (
          <div
            key={index}
            draggable={!isSelected}
            onDragStart={(e) => handleClipDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleClipDrop(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedClipIndex(isSelected ? null : index);
            }}
            className={`clip ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px` }}
          >
            {isSelected && (
              <>
                <div
                  className="clip-handle left"
                  onMouseDown={(e) => startResize(e, index, 'start')}
                />
                <div
                  className="clip-handle right"
                  onMouseDown={(e) => startResize(e, index, 'end')}
                />
              </>
            )}
            {clip.name}
          </div>
        );
      })}

      <div
        className="playhead"
        style={{
          left: `${(currentTime / totalDuration) * (totalDuration * 20)}px`,
        }}
      />
    </div>
  </div>

  {/* ===== Music timeline (BOTTOM) ===== */}
  <div
    className="music-timeline"
    onClick={(e) => {
      e.stopPropagation();
      setSelectedMusicIndex(null);
    }}
  >
    <div
      className="flex items-center"
      style={{ width: `${totalDuration * 20}px` }}
    >
      {musicTracks.map((track, index) => {
        const width = (track.duration / totalDuration) * (totalDuration * 20);
        const isSelected = selectedMusicIndex === index;
        return (
          <div
            key={index}
            draggable
            onDragStart={(e) => handleTrackDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleTrackDrop(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMusicIndex(isSelected ? null : index);
            }}
            className={`track ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px` }}
          >
            {track.name}
            <audio
              ref={(el) => (audioRefs.current[index] = el)}
              src={track.source}
            />
          </div>
        );
      })}
    </div>
  </div>
</div>


          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
