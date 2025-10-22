import axios from 'axios';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import '@/../css/Editor.css';

const DEFAULT_IMAGE_CLIP_DURATION = 5;

const useThrottledCallback = (callback, limitMs) => {
  const lastCallRef = useRef(0);
  const timeoutRef = useRef(null);
  const latestArgsRef = useRef();
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return useCallback((...args) => {
    latestArgsRef.current = args;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const elapsed = now - lastCallRef.current;

    if (elapsed >= limitMs) {
      lastCallRef.current = now;
      savedCallback.current(...args);
      return;
    }

    if (timeoutRef.current) return;

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      lastCallRef.current = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      savedCallback.current(...(latestArgsRef.current || []));
    }, limitMs - elapsed);
  }, [limitMs]);
};

const createMediaItemFromAsset = (asset) => {
  if (!asset) return null;
  const fallbackId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const kind = asset.kind || asset.type || 'video';
  const relativeFromPath =
    typeof asset.path === 'string' && asset.path.length
      ? `/storage/${asset.path.replace(/^\/?storage\//, '')}`
      : null;
  const urlFromAsset = typeof asset.url === 'string' && asset.url.length ? asset.url : null;
  const source =
    relativeFromPath ||
    (asset.source && typeof asset.source === 'string' ? asset.source : null) ||
    urlFromAsset ||
    '';

  const base = {
    id: asset.id || fallbackId,
    name: asset.name || 'Media Asset',
    type: kind,
    kind,
    mime: asset.mime || '',
    path: asset.path || '',
    url: urlFromAsset || relativeFromPath || asset.url || asset.source || '',
    source,
    size: asset.size ?? null,
    startTime: 0,
    startOffset: 0,
    storageKey: null,
    sourceDuration: 0,
    duration: 0,
  };

  if (kind === 'image') {
    base.sourceDuration = DEFAULT_IMAGE_CLIP_DURATION;
    base.duration = DEFAULT_IMAGE_CLIP_DURATION;
  }

  return base;
};

const EFFECT_PRESETS = [
  { key: 'blur', name: 'Blur', type: 'blur', intensity: 0.5, fadeIn: 0.3, fadeOut: 0.3, duration: 3 },
  { key: 'brightness', name: 'Brightness', type: 'brightness', intensity: 0.3, fadeIn: 0.4, fadeOut: 0.4, duration: 5 }
];

const TRANSITION_TYPES = [
  { value: 'fade', label: 'Fade' },
  { value: 'dip-black', label: 'Dip to Black' },
  { value: 'dip-white', label: 'Dip to White' }
];

const getTransitionLabel = (type) => TRANSITION_TYPES.find((t) => t.value === type)?.label || 'Fade';

const LanePlayhead = memo(({ position }) => {
  const safePosition = Number.isFinite(position) ? position : 0;
  return <div className="playhead" style={{ left: `${safePosition}px` }} />;
});

const EffectsLaneContent = memo(function EffectsLaneContent({
  effects,
  selectedEffectIndex,
  pxPerSec,
  onSelect,
  onStartResize,
  onStartDrag,
  onDragStart,
  onDrop,
  onIntensityChange,
}) {
  return (
    <>
      {effects.map((fx, index) => {
        if (!fx) return null;
        const width = Math.max(2, (fx.duration || 0) * pxPerSec);
        const left = Math.max(0, (fx.startTime || 0) * pxPerSec);
        const isSelected = selectedEffectIndex === index;
        const intensity = fx.intensity ?? 0.5;

        return (
          <div
            key={fx.id ?? `effect-${index}`}
            className={`effect-block ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px`, left: `${left}px` }}
            draggable={!isSelected}
            onDragStart={(e) => {
              if (isSelected) return;
              onDragStart(e, index);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, index)}
            onMouseDown={(e) => onStartDrag(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(index);
            }}
          >
            <span>{fx.name}</span>
            {isSelected && (
              <>
                <div className="clip-handle left" onMouseDown={(e) => onStartResize(e, index, 'start')} />
                <div className="clip-handle right" onMouseDown={(e) => onStartResize(e, index, 'end')} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={intensity}
                  onChange={(e) => onIntensityChange(index, parseFloat(e.target.value))}
                  className="effect-slider"
                  onClick={(e) => e.stopPropagation()}
                />
              </>
            )}
          </div>
        );
      })}
    </>
  );
});

const TextLaneContent = memo(function TextLaneContent({
  texts,
  selectedTextIndex,
  pxPerSec,
  onSelect,
  onStartResize,
  onStartDrag,
}) {
  return (
    <>
      {texts.map((tx, index) => {
        if (!tx) return null;
        const width = Math.max(2, (tx.duration || 0) * pxPerSec);
        const left = Math.max(0, (tx.startTime || 0) * pxPerSec);
        const isSelected = selectedTextIndex === index;

        return (
          <div
            key={tx.id ?? `text-${index}`}
            className={`text-block ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px`, left: `${left}px` }}
            onMouseDown={(e) => onStartDrag(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(index);
            }}
          >
            <span className="text-block-label">{tx.content}</span>
            {isSelected && (
              <>
                <div className="clip-handle left" onMouseDown={(e) => onStartResize(e, index, 'start')} />
                <div className="clip-handle right" onMouseDown={(e) => onStartResize(e, index, 'end')} />
              </>
            )}
          </div>
        );
      })}
    </>
  );
});

const ClipLaneContent = memo(function ClipLaneContent({
  clips,
  selectedClipIndex,
  pxPerSec,
  transitionLookup,
  selectedTransitionId,
  onSelectClip,
  onClipDragStart,
  onClipDrop,
  onStartResize,
  onSelectTransition,
  onAddTransition,
}) {
  return (
    <>
      {clips.map((clip, index) => {
        if (!clip) return null;
        const width = Math.max(2, (clip.duration || 0) * pxPerSec);
        const isSelected = selectedClipIndex === index;

        return (
          <div
            key={clip._localId || clip.id || `clip-${index}`}
            draggable={!isSelected}
            onDragStart={(e) => onClipDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onClipDrop(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectClip(index);
            }}
            className={`clip ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px` }}
          >
            {clip.name}
            {isSelected && (
              <>
                <div className="clip-handle left" onMouseDown={(e) => onStartResize(e, index, 'start')} />
                <div className="clip-handle right" onMouseDown={(e) => onStartResize(e, index, 'end')} />
              </>
            )}
          </div>
        );
      })}

      {clips.map((clip, index) => {
        if (index >= clips.length - 1) return null;
        const nextClip = clips[index + 1];
        if (!nextClip) return null;
        const key = clip._localId && nextClip._localId ? `${clip._localId}->${nextClip._localId}` : null;
        const transition = key ? transitionLookup.get(key) : null;
        const seamTime = (clip.startTime || 0) + (clip.duration || 0);

        if (transition) {
          const safeDuration = Number(transition.duration || 0);
          const startTime = Math.max(0, seamTime - safeDuration);
          const width = Math.max(18, safeDuration * pxPerSec);
          const left = Math.max(0, startTime * pxPerSec);
          const isSelected = selectedTransitionId === transition.id;
          const durationLabel = safeDuration.toFixed(1);
          return (
            <div
              key={`transition-${transition.id}`}
              className={`transition-block ${isSelected ? 'selected' : ''}`}
              style={{ width: `${width}px`, left: `${left}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTransition(transition.id);
              }}
              title={`${getTransitionLabel(transition.type)} · ${durationLabel}s`}
            >
              <span className="transition-label">{getTransitionLabel(transition.type)}</span>
              <span className="transition-duration">{durationLabel}s</span>
            </div>
          );
        }

        const canAdd = (clip.duration || 0) > 0 && (nextClip.duration || 0) > 0;
        if (!canAdd) return null;
        const buttonLeft = Math.max(0, seamTime * pxPerSec);

        return (
          <button
            key={`add-transition-${clip._localId || index}`}
            className="transition-add-button"
            style={{ left: `${buttonLeft}px` }}
            onClick={(e) => {
              e.stopPropagation();
              onAddTransition(index);
            }}
            title="Add transition"
          >
            +
          </button>
        );
      })}
    </>
  );
});

const MusicLaneContent = memo(function MusicLaneContent({
  tracks,
  selectedMusicIndex,
  pxPerSec,
  onSelect,
  onDragStart,
  onDrop,
  onStartResize,
  registerAudioRef,
  onLoadedMetadata,
}) {
  return (
    <>
      {tracks.map((track, index) => {
        if (!track) return null;
        const width = Math.max(2, (track.duration || 0) * pxPerSec);
        const left = Math.max(0, (track.startTime || 0) * pxPerSec);
        const isSelected = selectedMusicIndex === index;

        return (
          <div
            key={track.id || `track-${index}`}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(index);
            }}
            className={`track ${isSelected ? 'selected' : ''}`}
            style={{ width: `${width}px`, left: `${left}px` }}
          >
            {track.name}
            <audio
              ref={(el) => registerAudioRef(index, el)}
              src={track.source}
              preload="auto"
              onLoadedMetadata={() => onLoadedMetadata(track, index)}
            />
            {isSelected && (
              <>
                <div className="clip-handle left" onMouseDown={(e) => onStartResize(e, index, 'start')} />
                <div className="clip-handle right" onMouseDown={(e) => onStartResize(e, index, 'end')} />
              </>
            )}
          </div>
        );
      })}
    </>
  );
});

export default function Editor({ project }) {
  const BASE_PX_PER_SEC = 20;
  const MIN_TIMELINE_SECONDS = 12;

  const makeId = useCallback(
    (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`,
    []
  );

  const resolveLocal = (key, fallback = '') => {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  };

  const normalizeClipsLocal = (clipsArr = []) => {
    let accumulated = 0;
    return (clipsArr || []).map((clip) => {
      if (!clip) return clip;
      const c = { ...clip };
      if (!c._localId) c._localId = c.id || makeId('clip');
      c.startTime = accumulated;
      accumulated += c.duration || 0;
      return c;
    });
  };

  const rehydrateTransitions = (list = [], clipsWithIds = []) => {
    if (!Array.isArray(list) || list.length === 0) return [];
    const lookup = new Map();
    clipsWithIds.forEach((clip, index) => {
      if (!clip) return;
      if (clip._localId) lookup.set(String(clip._localId), clip._localId);
      if (clip.id != null) lookup.set(String(clip.id), clip._localId);
      lookup.set(`index-${index}`, clip._localId);
      if (clip.storageKey) lookup.set(String(clip.storageKey), clip._localId);
    });

    return list
      .map((transition) => {
        if (!transition) return null;
        const fromLocal =
          lookup.get(String(transition.from_clip_local_id)) ||
          lookup.get(String(transition.fromClipLocalId)) ||
          lookup.get(String(transition.from_clip_id)) ||
          lookup.get(String(transition.fromClipId)) ||
          lookup.get(`index-${transition.from_clip_index}`) ||
          lookup.get(`index-${transition.fromClipIndex}`);
        const toLocal =
          lookup.get(String(transition.to_clip_local_id)) ||
          lookup.get(String(transition.toClipLocalId)) ||
          lookup.get(String(transition.to_clip_id)) ||
          lookup.get(String(transition.toClipId)) ||
          lookup.get(`index-${transition.to_clip_index}`) ||
          lookup.get(`index-${transition.toClipIndex}`);
        if (!fromLocal || !toLocal) return null;
        return {
          id: transition.id || makeId('transition'),
          type: transition.type || 'fade',
          duration: typeof transition.duration === 'number' ? transition.duration : 0.5,
          fromClipLocalId: fromLocal,
          toClipLocalId: toLocal
        };
      })
      .filter(Boolean);
  };

  const hydrateFromStorage = (item) => {
    if (!item) return null;
    const storageKey =
      item.storageKey ||
      (typeof item.source === 'string' && item.source.startsWith('local-') ? item.source : null);
    if (storageKey) {
      const data = resolveLocal(storageKey, null);
      if (data) return { ...item, source: data, storageKey };
    }
    if (typeof item.source === 'string' && item.source.length > 0) {
      return { ...item };
    }
    if (typeof item.path === 'string' && item.path.length > 0) {
      const relative = `/storage/${item.path.replace(/^\/?storage\//, '')}`;
      return { ...item, source: relative };
    }
    if (item.url) {
      return { ...item, source: item.url };
    }
    if (item.fallbackSource) return { ...item, source: item.fallbackSource };
    return { ...item, source: '/placeholder.mp4', missing: true };
  };

  const rehydrateItems = (items = []) => items.map((item) => hydrateFromStorage(item)).filter(Boolean);
  const prepareItemsForSave = (items = []) =>
    items
      .map((item) => {
        if (!item) return null;
        const { storageKey, source, file, _localId, ...rest } = item;
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

      const initialClips = useMemo(() => normalizeClipsLocal(rehydrateItems(project.clips || [])), [project]);
      const initialTransitions = useMemo(() => rehydrateTransitions(project.transitions || [], initialClips), [project, initialClips]);

  const [mediaFiles, setMediaFiles] = useState(() => rehydrateItems(project.media_files || []));
  const [clips, setClips] = useState(initialClips);
  const [musicTracks, setMusicTracks] = useState(() => rehydrateItems(project.music_tracks || []));
  const [effects, setEffects] = useState(() => (Array.isArray(project.effects) && project.effects.length ? project.effects : []));
  const [textOverlays, setTextOverlays] = useState(() => (Array.isArray(project.text_overlays) ? project.text_overlays : []));
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const [transitions, setTransitions] = useState(initialTransitions);
  const [activeClipIndex, setActiveClipIndex] = useState(null);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [selectedMusicIndex, setSelectedMusicIndex] = useState(null);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState(null);
  const [selectedTextIndex, setSelectedTextIndex] = useState(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const setCurrentTimeThrottled = useThrottledCallback(setCurrentTime, 33);

  const videoRef = useRef(null);
  const videoSourceRef = useRef({ url: null, objectUrl: null, file: null });
  const imageRef = useRef(null);
  const audioRefs = useRef([]);
  const audioSyncStateRef = useRef(new Map());
  const stageRef = useRef(null);
  const transitionOverlayRef = useRef(null);
  const manualPlaybackRef = useRef(null);
  const seekToRef = useRef(null);

  const handleAudioMetadataLoaded = useCallback((track, index) => {
    const audio = audioRefs.current[index];
    if (!audio) return;
    const key = track?._localId || track?.id || `track-${index}`;
    const state = audioSyncStateRef.current;
    const entry = state.get(key) || { lastForcedAt: 0, lastDesired: null };
    const target =
      entry && entry.lastDesired != null ? entry.lastDesired : (track.startOffset || 0);
    try {
      audio.currentTime = target;
    } catch (_) {}
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    entry.lastDesired = target;
    entry.lastForcedAt = now;
    state.set(key, entry);
  }, []);

  useEffect(() => {
    const state = audioSyncStateRef.current;
    const validKeys = new Set(
      musicTracks.map((track, index) => {
        if (!track) return `track-${index}`;
        return track._localId || track.id || `track-${index}`;
      })
    );
    Array.from(state.keys()).forEach((key) => {
      if (!validKeys.has(key)) state.delete(key);
    });
  }, [musicTracks]);

  useEffect(() => {
    return () => {
      const current = videoSourceRef.current;
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl);
        videoSourceRef.current = { url: null, objectUrl: null, file: null };
      }
    };
  }, []);

  const applyStageDimensions = useCallback((overlays) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    let mediaRect = null;
    if (videoRef.current?.getBoundingClientRect) {
      const rect = videoRef.current.getBoundingClientRect();
      if (rect && rect.width && rect.height) mediaRect = rect;
    }
    if (!mediaRect && imageRef.current?.getBoundingClientRect) {
      const rect = imageRef.current.getBoundingClientRect();
      if (rect && rect.width && rect.height) mediaRect = rect;
    }

    if (!stageRect || !Array.isArray(overlays)) return overlays;

    const stageWidth = stageRect.width || 1;
    const stageHeight = stageRect.height || 1;
    const videoWidth = Math.max(1, mediaRect?.width || stageWidth);
    const videoHeight = Math.max(1, mediaRect?.height || stageHeight);
    const videoOffsetX = mediaRect ? mediaRect.left - stageRect.left : 0;
    const videoOffsetY = mediaRect ? mediaRect.top - stageRect.top : 0;

    return overlays.map((overlay) => {
      if (!overlay || typeof overlay !== 'object') {
        return overlay;
      }

      const clampPercent = (value, fallback = 50) => {
        const num = Number.isFinite(value) ? value : fallback;
        return Math.max(0, Math.min(100, num));
      };

      const fallbackVideoPercentX = clampPercent(Number.isFinite(overlay.x) ? overlay.x : 50, 50);
      const fallbackVideoPercentY = clampPercent(Number.isFinite(overlay.y) ? overlay.y : 50, 50);

      const stagePercentXRaw = Number.isFinite(overlay.stagePercentX) ? overlay.stagePercentX : null;
      const stagePercentYRaw = Number.isFinite(overlay.stagePercentY) ? overlay.stagePercentY : null;

      const stagePosX = stagePercentXRaw != null
        ? (stagePercentXRaw / 100) * stageWidth
        : ((fallbackVideoPercentX / 100) * Math.max(1, videoWidth)) + videoOffsetX;
      const stagePosY = stagePercentYRaw != null
        ? (stagePercentYRaw / 100) * stageHeight
        : ((fallbackVideoPercentY / 100) * Math.max(1, videoHeight)) + videoOffsetY;

      const stagePercentX = clampPercent((stagePosX / Math.max(1, stageWidth)) * 100, fallbackVideoPercentX);
      const stagePercentY = clampPercent((stagePosY / Math.max(1, stageHeight)) * 100, fallbackVideoPercentY);

      const videoPercentX = clampPercent(
        ((stagePosX - videoOffsetX) / Math.max(1, videoWidth)) * 100,
        fallbackVideoPercentX
      );
      const videoPercentY = clampPercent(
        ((stagePosY - videoOffsetY) / Math.max(1, videoHeight)) * 100,
        fallbackVideoPercentY
      );

      const unchanged =
        overlay.canvasWidth === stageWidth &&
        overlay.canvasHeight === stageHeight &&
        overlay.displayVideoWidth === videoWidth &&
        overlay.displayVideoHeight === videoHeight &&
        overlay.displayVideoOffsetX === videoOffsetX &&
        overlay.displayVideoOffsetY === videoOffsetY &&
        overlay.x === videoPercentX &&
        overlay.y === videoPercentY &&
        overlay.stagePercentX === stagePercentX &&
        overlay.stagePercentY === stagePercentY;

      if (unchanged) {
        return overlay;
      }

      return {
        ...overlay,
        x: videoPercentX,
        y: videoPercentY,
        stagePercentX,
        stagePercentY,
        canvasWidth: stageWidth,
        canvasHeight: stageHeight,
        displayVideoWidth: videoWidth,
        displayVideoHeight: videoHeight,
        displayVideoOffsetX: videoOffsetX,
        displayVideoOffsetY: videoOffsetY,
      };
    });
  }, []);

  const resolveOverlayGeometry = useCallback((overlay) => {
    if (!overlay || typeof overlay !== 'object') return null;
    const fallbackStageWidth = stageRef.current?.clientWidth || 1;
    const fallbackStageHeight = stageRef.current?.clientHeight || 1;
    const stageWidth =
      Number.isFinite(overlay.canvasWidth) && overlay.canvasWidth > 0 ? overlay.canvasWidth : fallbackStageWidth;
    const stageHeight =
      Number.isFinite(overlay.canvasHeight) && overlay.canvasHeight > 0 ? overlay.canvasHeight : fallbackStageHeight;
    const videoWidth =
      Number.isFinite(overlay.displayVideoWidth) && overlay.displayVideoWidth > 0
        ? overlay.displayVideoWidth
        : stageWidth;
    const videoHeight =
      Number.isFinite(overlay.displayVideoHeight) && overlay.displayVideoHeight > 0
        ? overlay.displayVideoHeight
        : stageHeight;
    const offsetX =
      Number.isFinite(overlay.displayVideoOffsetX) && overlay.displayVideoOffsetX >= 0
        ? overlay.displayVideoOffsetX
        : Math.max(0, (stageWidth - videoWidth) / 2);
    const offsetY =
      Number.isFinite(overlay.displayVideoOffsetY) && overlay.displayVideoOffsetY >= 0
        ? overlay.displayVideoOffsetY
        : Math.max(0, (stageHeight - videoHeight) / 2);
    const clampPercent = (value, fallback = 50) => {
      const num = Number.isFinite(value) ? value : fallback;
      return Math.max(0, Math.min(100, num));
    };
    const videoPercentX = clampPercent(overlay.x, 50);
    const videoPercentY = clampPercent(overlay.y, 50);
    let stagePercentX = Number.isFinite(overlay.stagePercentX) ? overlay.stagePercentX : null;
    let stagePercentY = Number.isFinite(overlay.stagePercentY) ? overlay.stagePercentY : null;
    const stageX = stagePercentX != null ? (stagePercentX / 100) * stageWidth : offsetX + (videoWidth * videoPercentX) / 100;
    const stageY = stagePercentY != null ? (stagePercentY / 100) * stageHeight : offsetY + (videoHeight * videoPercentY) / 100;
    const normalizedStagePercentX = (stageX / Math.max(1, stageWidth)) * 100;
    const normalizedStagePercentY = (stageY / Math.max(1, stageHeight)) * 100;

    return {
      stageWidth,
      stageHeight,
      videoWidth: Math.max(1, videoWidth),
      videoHeight: Math.max(1, videoHeight),
      offsetX,
      offsetY,
      videoPercentX,
      videoPercentY,
      stagePercentX: clampPercent(normalizedStagePercentX, 50),
      stagePercentY: clampPercent(normalizedStagePercentY, 50),
      stageX,
      stageY,
    };
  }, []);

  const updateTextOverlays = useCallback((updater) => {
    setTextOverlays((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const next = updater(base);
      return applyStageDimensions(Array.isArray(next) ? next : base);
    });
  }, [applyStageDimensions]);

  useEffect(() => {
    const sync = () => {
      updateTextOverlays((prev) => prev);
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', sync);
    }
    window.addEventListener('resize', sync);
    sync();

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', sync);
      }
      window.removeEventListener('resize', sync);
    };
  }, [updateTextOverlays]);

  useEffect(() => {
    if (!Array.isArray(textOverlays) || textOverlays.length === 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const requiresUpdate = textOverlays.some((overlay) => {
      if (!overlay || typeof overlay !== 'object') return false;
      return !overlay.canvasWidth || !overlay.canvasHeight;
    });
    if (!requiresUpdate) return;
    setTextOverlays((prev) => applyStageDimensions(prev));
  }, [textOverlays, applyStageDimensions]);

  const [resizeState, setResizeState] = useState(null);
  const [resizeEffectState, setResizeEffectState] = useState(null);
  const [resizeMusicState, setResizeMusicState] = useState(null);
  const [resizeTextState, setResizeTextState] = useState(null);
  const [dragEffectState, setDragEffectState] = useState(null);
  const [dragTextState, setDragTextState] = useState(null);
  const [dragTextStageState, setDragTextStageState] = useState(null);
  const timelineScrollRef = useRef(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);

  const [newText, setNewText] = useState('New Text');
  const [newTextSize, setNewTextSize] = useState(32);
  const [newTextColor, setNewTextColor] = useState('#FCFFFC');

  const clipTotal = useMemo(() => clips.reduce((s, c) => s + (c.duration || 0), 0), [clips]);

  const totalDuration = useMemo(() => {
    const clipDur = clipTotal;
    const musicDur = musicTracks.reduce((max, t) => Math.max(max, (t.startTime || 0) + (t.duration || 0)), 0);
    const effectDur = effects.reduce((max, fx) => Math.max(max, (fx.startTime || 0) + (fx.duration || 0)), 0);
    const textDur = textOverlays.reduce((max, tx) => Math.max(max, (tx.startTime || 0) + (tx.duration || 0)), 0);
    return Math.max(clipDur, musicDur, effectDur, textDur);
  }, [clipTotal, musicTracks, effects, textOverlays]);

  const hasTimelineContent =
    totalDuration > 0 || clips.length > 0 || musicTracks.length > 0 || effects.length > 0 || textOverlays.length > 0;
  const timelineBaseDuration = hasTimelineContent ? 5 : MIN_TIMELINE_SECONDS;
  const timelineDuration = Math.max(totalDuration, timelineBaseDuration);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const measure = () => {
      if (timelineScrollRef.current) {
        setTimelineViewportWidth(timelineScrollRef.current.clientWidth || 0);
      }
    };

    measure();
    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !timelineScrollRef.current) return undefined;
    const handle = window.requestAnimationFrame(() => {
      setTimelineViewportWidth(timelineScrollRef.current?.clientWidth || 0);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [timelineDuration]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined' || !timelineScrollRef.current) {
      return undefined;
    }
    const observer = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setTimelineViewportWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(timelineScrollRef.current);
    return () => observer.disconnect();
  }, []);

  const pxPerSec = useMemo(() => {
    if (!timelineDuration || !Number.isFinite(timelineDuration)) {
      return BASE_PX_PER_SEC;
    }
    if (!timelineViewportWidth) {
      return BASE_PX_PER_SEC;
    }
    const viewportBased = timelineViewportWidth / timelineDuration;
    return Math.max(BASE_PX_PER_SEC, viewportBased);
  }, [timelineDuration, timelineViewportWidth]);

  const timelineWidth = timelineDuration * pxPerSec;

  const transitionLookup = useMemo(() => {
    const map = new Map();
    transitions.forEach((transition) => {
      if (transition?.fromClipLocalId && transition?.toClipLocalId) {
        map.set(`${transition.fromClipLocalId}->${transition.toClipLocalId}`, transition);
      }
    });
  return map;
}, [transitions]);

  const activeClip = activeClipIndex != null ? clips[activeClipIndex] : null;
  const activeClipIsImage = activeClip?.type === 'image';

  const clearSelection = useCallback(() => {
    setSelectedClipIndex(null);
    setSelectedMusicIndex(null);
    setSelectedEffectIndex(null);
    setSelectedTextIndex(null);
    setSelectedTransitionId(null);
  }, []);

  const selectClip = useCallback((index) => {
    setSelectedClipIndex(index);
    setSelectedMusicIndex(null);
    setSelectedEffectIndex(null);
    setSelectedTextIndex(null);
    setSelectedTransitionId(null);
  }, []);

  const selectMusic = useCallback((index) => {
    setSelectedMusicIndex(index);
    setSelectedClipIndex(null);
    setSelectedEffectIndex(null);
    setSelectedTextIndex(null);
    setSelectedTransitionId(null);
  }, []);

  const selectEffect = useCallback((index) => {
    setSelectedEffectIndex(index);
    setSelectedClipIndex(null);
    setSelectedMusicIndex(null);
    setSelectedTextIndex(null);
    setSelectedTransitionId(null);
  }, []);

  const selectText = useCallback((index) => {
    setSelectedTextIndex(index);
    setSelectedClipIndex(null);
    setSelectedMusicIndex(null);
    setSelectedEffectIndex(null);
    setSelectedTransitionId(null);
  }, []);

  const selectTransition = useCallback((id) => {
    setSelectedTransitionId(id);
    setSelectedClipIndex(null);
    setSelectedMusicIndex(null);
    setSelectedEffectIndex(null);
    setSelectedTextIndex(null);
  }, []);

  const togglePlay = () => {
    const clip = activeClipIndex != null ? clips[activeClipIndex] : null;
    if (clip?.type === 'image') {
      if (manualPlaybackRef.current) {
        stopManualPlayback({ syncAudio: true });
      } else {
        startManualPlayback(currentTime);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (manualPlaybackRef.current) {
      stopManualPlayback({ syncAudio: false });
    }
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const isTimelinePlaying = () => {
    const video = videoRef.current;
    return (video && !video.paused) || Boolean(manualPlaybackRef.current);
  };

  const startMusicResize = useCallback(
    (e, index, edge) => {
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
        pxPerSec,
      });
    },
    [musicTracks, pxPerSec]
  );

  const goBack = () => router.get(route('dashboard'));

  const handleFileUpload = async (input) => {
    const fileList =
      input?.target?.files ||
      input?.dataTransfer?.files ||
      input?.files ||
      (Array.isArray(input) ? input : null);

    const uploads = Array.from(fileList || []);
    if (uploads.length === 0) {
      if (input?.target?.value !== undefined) input.target.value = '';
      return;
    }

    const formData = new FormData();
    uploads.forEach((file, index) => formData.append(`files[${index}]`, file));

    setIsUploadingMedia(true);

    try {
      const response = await axios.post(route('projects.media.upload', project.id), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const assets = Array.isArray(response?.data?.assets) ? response.data.assets : [];
      const normalized = assets.map(createMediaItemFromAsset).filter(Boolean);

      if (normalized.length) {
        setMediaFiles((prev) => [...prev, ...normalized]);
      }
    } catch (error) {
      console.error('Media upload failed', error);
      const status = error?.response?.status;
      const serverMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.response?.data?.errors
          ? JSON.stringify(error.response.data.errors)
          : null;
      let message = 'Uploading media failed. Please try again.';
      if (status === 413) {
        message = 'Upload too large for the server (HTTP 413). Try a smaller file or contact support.';
      } else if (status === 419) {
        message = 'Session expired (HTTP 419). Refresh the page and try again.';
      } else if (status === 422) {
        message = serverMessage || 'The file did not pass validation (HTTP 422).';
      } else if (status >= 500 && status < 600) {
        message = 'Server error while uploading. Please try again later.';
      } else if (serverMessage) {
        message = serverMessage;
      }
      alert(message);
    } finally {
      setIsUploadingMedia(false);
      if (input?.target?.value !== undefined) {
        input.target.value = '';
      }
    }
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
    const safeDuration = Math.max(timelineDuration, 1);
    const safeWidth = safeDuration * pxPerSec;
    const ratio = safeWidth > 0 ? dropX / safeWidth : 0;
    const dropTime = Math.max(0, Math.min(safeDuration, ratio * safeDuration));

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
      } else if (file.type === 'image') {
        setClips((prev) => {
          const baseDuration = file.duration && file.duration > 0 ? file.duration : DEFAULT_IMAGE_CLIP_DURATION;
          const startTime = prev.reduce((sum, c) => sum + (c.duration || 0), 0);
          const newClips = normalizeClipsLocal([
            ...prev,
            {
              ...file,
              startOffset: 0,
              startTime,
              duration: baseDuration,
              sourceDuration: Number.isFinite(file.sourceDuration) && file.sourceDuration > 0 ? file.sourceDuration : null,
              type: 'image',
            }
          ]);
          if (prev.length === 0) setActiveClipIndex(0);
          return newClips;
        });
      }
    } else if (payload.kind === 'effect') {
      const base = payload.effect;
      setEffects((prev) => {
        const next = {
          id: crypto.randomUUID(),
          name: base.name,
          type: base.type,
          intensity: base.intensity ?? 0.5,
          startTime: dropTime,
          duration: base.duration ?? 5,
          fadeIn: base.fadeIn ?? 0,
          fadeOut: base.fadeOut ?? 0
        };

        if (base.color) {
          next.color = base.color;
        }

        return [...prev, next];
      });
    } else if (payload.kind === 'text') {
      updateTextOverlays((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: newText || 'New Text',
          startTime: dropTime,
          duration: 5,
          x: 50,
          y: 50,
          stagePercentX: 50,
          stagePercentY: 50,
          color: newTextColor,
          fontSize: newTextSize,
          anchorX: null,
          anchorY: null
        }
      ]);
    }
  };

  const handleSave = () => {
    const mediaToSave = prepareItemsForSave(mediaFiles);
    const clipsToSave = prepareItemsForSave(clips);
    const tracksToSave = prepareItemsForSave(musicTracks);
    const effectsToSave = effects.map((effect) => ({ ...effect }));
    const textsToSave = textOverlays.map((t) => ({ ...t }));
    const transitionsToSave = transitions
    .map((transition) => {
      const fromIndex = clips.findIndex((clip) => clip._localId === transition.fromClipLocalId);
      const toIndex = clips.findIndex((clip) => clip._localId === transition.toClipLocalId);
      if (fromIndex === -1 || toIndex === -1) return null;
      const fromClip = clips[fromIndex];
      const toClip = clips[toIndex];
      return {
        id: transition.id,
        type: transition.type,
        duration: transition.duration,
        from_clip_index: fromIndex,
        to_clip_index: toIndex,
        from_clip_id: fromClip?.id ?? null,
        to_clip_id: toClip?.id ?? null,
        from_clip_local_id: transition.fromClipLocalId,
        to_clip_local_id: transition.toClipLocalId
      };
    })
    .filter(Boolean);
    router.put(route('projects.update', project.id), {
      media_files: mediaToSave,
      clips: clipsToSave,
      music_tracks: tracksToSave,
      effects: effectsToSave,
      text_overlays: textsToSave,
      transitions: transitionsToSave
    });
  };

  const handleCut = () => {
    const wasPlaying = isTimelinePlaying();

    if (selectedClipIndex !== null) {
      const targetIndex = selectedClipIndex;
      const clip = clips[targetIndex];
      if (!clip || clip.type === 'gap') return;
      const relativeTime = currentTime - (clip.startTime || 0);
      if (relativeTime <= 0 || relativeTime >= (clip.duration || 0)) return;

      const before = { ...clip, _localId: makeId('clip'), startOffset: clip.startOffset || 0, startTime: clip.startTime, duration: relativeTime };
      const after = { ...clip, _localId: makeId('clip'), startOffset: (clip.startOffset || 0) + relativeTime, startTime: (clip.startTime || 0) + relativeTime, duration: (clip.duration || 0) - relativeTime };

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
      updateTextOverlays((prev) => {
        const arr = [...prev];
        arr.splice(idx, 1, before, after);
        return arr;
      });
      setSelectedTextIndex(idx + 1);
      seekTo(currentTime, wasPlaying);
      return;
    }
  };

  const handleClipDragStart = useCallback((e, index) => {
    e.dataTransfer.setData('clipIndex', String(index));
  }, []);
  const handleClipDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('clipIndex'), 10);
    if (Number.isNaN(draggedIndex) || draggedIndex === dropIndex) return;
    setClips((prev) => {
      const updated = [...prev];
      const [draggedClip] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, draggedClip);
      return normalizeClipsLocal(updated);
    });
    selectClip(dropIndex);
  }, [selectClip]);

  const addTransitionBetween = useCallback((fromIndex) => {
    const fromClip = clips[fromIndex];
    const toClip = clips[fromIndex + 1];
    if (!fromClip || !toClip) return;
    const existing = transitions.find(
      (transition) => transition.fromClipLocalId === fromClip._localId && transition.toClipLocalId === toClip._localId
    );
    if (existing) {
      selectTransition(existing.id);
      return;
    }
    const maxDuration = Math.max(0.2, Math.min(fromClip.duration || 0, toClip.duration || 0));
    if (!isFinite(maxDuration) || maxDuration <= 0) return;
    const newTransition = {
      id: makeId('transition'),
      type: 'fade',
      duration: Math.min(1.5, maxDuration),
      fromClipLocalId: fromClip._localId,
      toClipLocalId: toClip._localId,
    };
    setTransitions((prev) => [...prev, newTransition]);
    selectTransition(newTransition.id);
  }, [clips, makeId, selectTransition, setTransitions, transitions]);

  const updateTransition = (id, updates) => {
    setTransitions((prev) => prev.map((transition) => (transition.id === id ? { ...transition, ...updates } : transition)));
  };

  const removeTransition = (id) => {
    setTransitions((prev) => prev.filter((transition) => transition.id !== id));
    if (selectedTransitionId === id) setSelectedTransitionId(null);
  };

  const handleTrackDragStart = useCallback((e, index) => {
    e.dataTransfer.setData('trackIndex', String(index));
  }, []);
  const handleTrackDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('trackIndex'), 10);
    if (Number.isNaN(draggedIndex) || draggedIndex === dropIndex) return;
    setMusicTracks((prev) => {
      const updated = [...prev];
      const [draggedTrack] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, draggedTrack);
      return updated;
    });
    selectMusic(dropIndex);
  }, [selectMusic]);

  const handleEffectDragStart = useCallback((e, index) => {
    e.dataTransfer.setData('effectIndex', String(index));
  }, []);
  const handleEffectDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('effectIndex'), 10);
    if (Number.isNaN(draggedIndex) || draggedIndex === dropIndex) return;
    setEffects((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, dragged);
      return updated;
    });
    selectEffect(dropIndex);
  }, [selectEffect]);

  const handleEffectIntensityChange = useCallback((index, value) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(0, Math.min(1, value));
    setEffects((prev) => {
      if (!prev[index]) return prev;
      const arr = [...prev];
      arr[index] = { ...arr[index], intensity: clamped };
      return arr;
    });
  }, []);

  const registerAudioRef = useCallback((index, el) => {
    audioRefs.current[index] = el;
  }, []);

  const startResize = useCallback(
    (e, index, edge) => {
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
        sourceDuration: clip.type === 'image' ? Infinity : clip.sourceDuration || clip.duration || 0,
        pxPerSec,
      });
    },
    [clips, pxPerSec]
  );

  const startEffectResize = useCallback(
    (e, index, edge) => {
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
        pxPerSec,
      });
    },
    [effects, pxPerSec]
  );

  const startEffectDrag = useCallback(
    (e, index) => {
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
        pxPerSec,
      });
    },
    [effects, pxPerSec]
  );

  const startTextResize = useCallback(
    (e, index, edge) => {
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
        pxPerSec,
      });
    },
    [pxPerSec, textOverlays]
  );

  const startTextDrag = useCallback(
    (e, index) => {
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
        pxPerSec,
      });
    },
    [pxPerSec, textOverlays]
  );

  useEffect(() => {
    setTransitions((prev) => {
      let changed = false;
      const updated = [];
      prev.forEach((transition) => {
        const fromIndex = clips.findIndex((clip) => clip._localId === transition.fromClipLocalId);
        if (fromIndex === -1) { changed = true; return; }
        const fromClip = clips[fromIndex];
        const toClip = clips[fromIndex + 1];
        if (!toClip || toClip._localId !== transition.toClipLocalId) { changed = true; return; }
        const maxDuration = Math.max(0.2, Math.min(fromClip.duration || 0, toClip.duration || 0));
        if (!isFinite(maxDuration) || maxDuration <= 0) { changed = true; return; }
        const desiredDuration = Math.max(0.2, Math.min(transition.duration || 0.5, maxDuration));
        if (Math.abs(desiredDuration - (transition.duration || 0)) > 1e-6) {
          updated.push({ ...transition, duration: desiredDuration });
          changed = true;
        } else {
          updated.push(transition);
        }
      });
      if (!changed && updated.length === prev.length && updated.every((item, idx) => item === prev[idx])) return prev;
      return updated;
    });
  }, [clips]);

  useEffect(() => {
    if (selectedTransitionId && !transitions.some((transition) => transition.id === selectedTransitionId)) {
      setSelectedTransitionId(null);
    }
  }, [selectedTransitionId, transitions]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.style.transition = 'opacity 0.12s linear';
    if (transitionOverlayRef.current) transitionOverlayRef.current.style.transition = 'opacity 0.12s linear';
  }, []);

  const applyTransitionVisuals = useCallback(
    (globalTime, clipIndex) => {
      const video = videoRef.current;
      const overlay = transitionOverlayRef.current;
      if (!video) return;

      let videoOpacity = 1;
      let overlayOpacity = 0;
      let overlayColor = 'transparent';

      const applyOverlay = (color, opacity) => {
        if (opacity > overlayOpacity) {
          overlayOpacity = opacity;
          overlayColor = color;
        }
      };

      const handlePhase = (transition, progress, direction) => {
        if (!transition || !transition.duration) return;
        const clamped = Math.max(0, Math.min(1, progress));
        switch (transition.type) {
          case 'dip-white':
            applyOverlay('rgba(255,255,255,1)', direction === 'out' ? clamped : 1 - clamped);
            break;
          case 'dip-black':
            applyOverlay('rgba(0,0,0,1)', direction === 'out' ? clamped : 1 - clamped);
            break;
          default: {
            if (direction === 'out') {
              videoOpacity = Math.min(videoOpacity, 1 - clamped);
              applyOverlay('rgba(0,0,0,1)', clamped * 0.6);
            } else {
              videoOpacity = Math.min(videoOpacity, clamped);
              applyOverlay('rgba(0,0,0,1)', (1 - clamped) * 0.6);
            }
            break;
          }
        }
      };

      const index = clipIndex != null && clipIndex >= 0 ? clipIndex : null;
      if (index !== null) {
        const currentClip = clips[index];
        if (currentClip) {
          if (index > 0) {
            const prevClip = clips[index - 1];
            const incoming = prevClip ? transitionLookup.get(`${prevClip._localId}->${currentClip._localId}`) : null;
            if (incoming && (incoming.duration || 0) > 0) {
              const start = currentClip.startTime || 0;
              const rel = (globalTime - start) / (incoming.duration || 1);
              if (rel >= 0 && rel <= 1) handlePhase(incoming, rel, 'in');
            }
          }

          if (index < clips.length - 1) {
            const nextClip = clips[index + 1];
            const outgoing = nextClip ? transitionLookup.get(`${currentClip._localId}->${nextClip._localId}`) : null;
            if (outgoing && (outgoing.duration || 0) > 0) {
              const start = (currentClip.startTime || 0) + (currentClip.duration || 0) - (outgoing.duration || 0);
              const rel = (globalTime - start) / (outgoing.duration || 1);
              if (rel >= 0 && rel <= 1) handlePhase(outgoing, rel, 'out');
            }
          }
        }
      }

      video.style.opacity = `${Math.max(0, Math.min(1, videoOpacity))}`;
      if (overlay) {
        overlay.style.opacity = overlayOpacity;
        overlay.style.background = overlayOpacity > 0 ? overlayColor : 'transparent';
      }
    },
    [clips, transitionLookup]
  );

  useEffect(() => {
    clips.forEach((clip, i) => {
      if (!clip || clip.type === 'image') {
        if (clip?.type === 'image' && (!clip.duration || clip.duration <= 0)) {
          setClips((prev) => {
            const list = [...prev];
            const updated = { ...list[i], duration: DEFAULT_IMAGE_CLIP_DURATION };
            list[i] = updated;
            return normalizeClipsLocal(list);
          });
        }
        return;
      }
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
      const wasPlaying = isTimelinePlaying();
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
      const wasPlaying = isTimelinePlaying();
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
      const wasPlaying = isTimelinePlaying();
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
      updateTextOverlays((prev) => {
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
      updateTextOverlays((prev) => {
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

  const findClipIndexAtTime = useCallback((time) => {
    if (!Array.isArray(clips) || clips.length === 0) return null;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip) continue;
      const clipStart = clip.startTime || 0;
      const clipEnd = clipStart + (clip.duration || 0);
      if (time >= clipStart && time < clipEnd) {
        return i;
      }
    }
    const lastClip = clips[clips.length - 1];
    if (lastClip) {
      const lastEnd = (lastClip.startTime || 0) + (lastClip.duration || 0);
      if (time >= lastEnd) return clips.length - 1;
    }
    return null;
  }, [clips]);

  const syncVisuals = useCallback((globalTime) => {
    const video = videoRef.current;
    if (video) {
      const wrapper = video.parentElement;
      if (wrapper) wrapper.style.filter = computeFilterForTime(globalTime);
    }
    const clipIndex = findClipIndexAtTime(globalTime);
    applyTransitionVisuals(globalTime, clipIndex != null ? clipIndex : -1);
  }, [computeFilterForTime, applyTransitionVisuals, findClipIndexAtTime]);

  const syncAudio = useCallback(
    (globalTime, shouldPlay) => {
      const syncState = audioSyncStateRef.current;
      musicTracks.forEach((track, i) => {
        const audio = audioRefs.current[i];
        if (!audio) return;

        const trackStart = track.startTime || 0;
        const trackDuration = track.duration || 0;
        const trackEnd = trackStart + trackDuration;
        const trackOffset = track.startOffset || 0;
        const key = track?._localId || track?.id || `track-${i}`;
        const entry = syncState.get(key) || { lastForcedAt: 0, lastDesired: null };
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const forceToTime = (target) => {
          const current = audio.currentTime || 0;
          const diff = Math.abs(current - target);
          const elapsed = now - (entry.lastForcedAt || 0);
          if (diff > 0.35 && elapsed > 200) {
            try {
              audio.currentTime = target;
              entry.lastForcedAt = now;
            } catch (_) {}
          }
          entry.lastDesired = target;
        };

        if (globalTime >= trackStart && globalTime <= trackEnd) {
          const desired = trackOffset + (globalTime - trackStart);
          if (audio.readyState >= 1) {
            forceToTime(desired);
          } else {
            entry.lastDesired = desired;
          }
          if (shouldPlay) {
            if (audio.paused) audio.play().catch(() => {});
          } else if (!audio.paused) {
            audio.pause();
          }
        } else if (globalTime < trackStart) {
          if (!audio.paused) audio.pause();
          if (entry.lastDesired !== trackOffset) {
            try { audio.currentTime = trackOffset; } catch (_) {}
            entry.lastDesired = trackOffset;
            entry.lastForcedAt = now;
          }
        } else {
          if (!audio.paused) audio.pause();
          entry.lastDesired = null;
        }

        syncState.set(key, entry);
      });
    },
    [musicTracks]
  );

  const stopManualPlayback = useCallback(
    (options = {}) => {
      const { syncAudio: shouldSyncAudio = true, globalTime } = options;
      const state = manualPlaybackRef.current;
      if (state?.frameId) {
        cancelAnimationFrame(state.frameId);
      }
      manualPlaybackRef.current = null;
      if (shouldSyncAudio) {
        syncAudio(globalTime != null ? globalTime : currentTime, false);
      }
    },
    [currentTime, syncAudio]
  );

  const startManualPlayback = useCallback(
    (anchorTime = null) => {
      const targetTime = anchorTime != null ? anchorTime : currentTime;
      const clipIndex = findClipIndexAtTime(targetTime) ?? activeClipIndex ?? 0;
      const clip = clipIndex != null ? clips[clipIndex] : null;
      if (!clip || clip.type !== 'image') return;

      stopManualPlayback({ syncAudio: false });

      const initialState = {
        anchorTime: targetTime,
        anchorTimestamp: performance.now(),
        clipIndex,
        frameId: null,
      };

      const step = (timestamp) => {
        const state = manualPlaybackRef.current;
        if (!state) return;
        const active = clips[state.clipIndex];
        if (!active || active.type !== 'image') {
          stopManualPlayback({ syncAudio: true });
          return;
        }

        const elapsed = (timestamp - state.anchorTimestamp) / 1000;
        let newTime = state.anchorTime + elapsed;
        const clipStart = active.startTime || 0;
        const clipEnd = clipStart + (active.duration || 0);
        if (newTime > clipEnd) newTime = clipEnd;

        setCurrentTimeThrottled(newTime);
        syncVisuals(newTime);
        syncAudio(newTime, true);

        const epsilon = 1e-3;
        if (newTime >= clipEnd - epsilon) {
          const nextIndex = state.clipIndex + 1;
          const nextClip = clips[nextIndex];
          if (nextClip && nextClip.type === 'image') {
            manualPlaybackRef.current = {
              anchorTime: clipEnd,
              anchorTimestamp: timestamp,
              clipIndex: nextIndex,
              frameId: null,
            };
            setActiveClipIndex(nextIndex);
            syncVisuals(clipEnd);
            syncAudio(clipEnd, true);
            manualPlaybackRef.current.frameId = requestAnimationFrame(step);
            return;
          }

          stopManualPlayback({ syncAudio: !nextClip, globalTime: newTime });
          if (nextClip && typeof seekToRef.current === 'function') {
            seekToRef.current(clipEnd, true);
          }
          return;
        }

        state.frameId = requestAnimationFrame(step);
      };

      manualPlaybackRef.current = { ...initialState };
      setActiveClipIndex(clipIndex);
      setCurrentTime(targetTime);
      syncVisuals(targetTime);
      syncAudio(targetTime, true);
      manualPlaybackRef.current.frameId = requestAnimationFrame(step);
    },
    [activeClipIndex, clips, currentTime, findClipIndexAtTime, setCurrentTimeThrottled, stopManualPlayback, syncAudio, syncVisuals]
  );

  useEffect(() => {
    if (clips.length > 0 && activeClipIndex === null) setActiveClipIndex(0);
  }, [clips, activeClipIndex]);

  useEffect(() => {
    applyTransitionVisuals(currentTime, activeClipIndex != null ? activeClipIndex : -1);
  }, [applyTransitionVisuals, currentTime, activeClipIndex]);

  const seekTo = useCallback((newGlobalTime, keepPlaying) => {
    const safeDuration = Math.max(timelineDuration, 0);
    const targetTime = Math.max(0, Math.min(newGlobalTime, safeDuration));
    const video = videoRef.current;
    const clipIndex = findClipIndexAtTime(targetTime);
    const seg = clipIndex != null ? clips[clipIndex] : null;

    setCurrentTime(targetTime);

    if (!seg) {
      setActiveClipIndex(null);
      stopManualPlayback({ syncAudio: true, globalTime: targetTime });
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      syncVisuals(targetTime);
      syncAudio(targetTime, false);
      return;
    }

    setActiveClipIndex(clipIndex);

    if (seg.type === 'image') {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      syncVisuals(targetTime);
      syncAudio(targetTime, keepPlaying);
      if (keepPlaying) {
        startManualPlayback(targetTime);
      } else {
        stopManualPlayback({ syncAudio: true, globalTime: targetTime });
      }
      return;
    }

    stopManualPlayback({ syncAudio: false });

    const clipStart = seg.startTime || 0;
    const clipStartOffset = seg.startOffset || 0;
    const clipDuration = seg.duration || 0;
    const segRelative = Math.max(0, targetTime - clipStart);
    const rawSeek = clipStartOffset + segRelative;
    const clipEndInSource = clipStartOffset + clipDuration;
    const availableInSource =
      typeof seg.sourceDuration === 'number' && seg.sourceDuration > 0 ? seg.sourceDuration : clipEndInSource;
    const seekTimeInSource = Math.max(
      clipStartOffset,
      Math.min(Number.isFinite(availableInSource) ? availableInSource : rawSeek, rawSeek)
    );

    if (video) {
      const lastSource = videoSourceRef.current;
      const nextFile = typeof Blob !== 'undefined' && seg.file && seg.file instanceof Blob ? seg.file : null;
      let nextObjectUrl = lastSource?.objectUrl || null;
      let nextSource = seg.source || '';

      const canUseObjectUrl =
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function' &&
        typeof URL.revokeObjectURL === 'function';

      if (nextFile && canUseObjectUrl) {
        if (lastSource?.file === nextFile && lastSource?.objectUrl) {
          nextSource = lastSource.objectUrl;
          nextObjectUrl = lastSource.objectUrl;
        } else {
          if (lastSource?.objectUrl) {
            URL.revokeObjectURL(lastSource.objectUrl);
          }
          nextObjectUrl = URL.createObjectURL(nextFile);
          nextSource = nextObjectUrl;
        }
      } else if (nextFile) {
        nextObjectUrl = null;
        nextSource = seg.source || '';
      } else if (lastSource?.objectUrl && lastSource?.file && canUseObjectUrl) {
        URL.revokeObjectURL(lastSource.objectUrl);
        nextObjectUrl = null;
      }

      const sourceChanged = !lastSource || lastSource.url !== nextSource;
      const sameClipActive = activeClipIndex === clipIndex;
      const videoTime = video.currentTime || 0;
      if (!sourceChanged && sameClipActive && Math.abs(videoTime - seekTimeInSource) < 0.01) {
        if (keepPlaying) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        syncVisuals(targetTime);
        syncAudio(targetTime, keepPlaying);
        return;
      }

      if (sourceChanged) {
        video.src = nextSource;
      }

      videoSourceRef.current = { url: nextSource, objectUrl: nextObjectUrl, file: nextFile };

      const applyPlaybackState = () => {
        try {
          video.currentTime = seekTimeInSource;
        } catch {
          return;
        }
        if (keepPlaying) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      };

      if (video.readyState >= 1 && !sourceChanged) {
        applyPlaybackState();
      } else {
        const onLoaded = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          applyPlaybackState();
        };
        video.addEventListener('loadedmetadata', onLoaded);
        if (video.readyState >= 1) {
          onLoaded();
        }
      }
    }

    syncVisuals(targetTime);
    syncAudio(targetTime, keepPlaying);
  }, [activeClipIndex, clips, findClipIndexAtTime, startManualPlayback, stopManualPlayback, syncAudio, syncVisuals, timelineDuration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const seg = clips[activeClipIndex];
      if (seg?.type === 'image') return;

      let globalTime = video.currentTime || 0;
      if (seg) {
        const segStartTime = seg.startTime || 0;
        globalTime = segStartTime + (video.currentTime - (seg.startOffset || 0));
      }

      setCurrentTimeThrottled(globalTime);
      syncVisuals(globalTime);
      syncAudio(globalTime, !video.paused);

      if (seg) {
        const clipDuration = seg.duration || 0;
        if (clipDuration > 0) {
          const clipEndTime = (seg.startTime || 0) + clipDuration;
          const videoEndTime = (seg.startOffset || 0) + clipDuration;
          if ((video.currentTime || 0) >= videoEndTime - 0.05) {
            if (activeClipIndex < clips.length - 1) {
              seekTo(clipEndTime, true);
              return;
            }

            const musicStillPlaying = musicTracks.some((track) => {
              const end = (track.startTime || 0) + (track.duration || 0);
              return globalTime < end;
            });

            if (!musicStillPlaying) {
              video.pause();
              setActiveClipIndex(0);
              setCurrentTime(0);
              syncVisuals(0);
              syncAudio(0, false);
              audioRefs.current.forEach((a) => {
                if (a) {
                  a.pause();
                  a.currentTime = 0;
                }
              });
            } else {
              try {
                video.pause();
                if (video.duration && !isNaN(video.duration)) {
                  video.currentTime = Math.max(0, video.duration - 0.05);
                }
              } catch {}
            }
          }
        }
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [clips, activeClipIndex, musicTracks, setCurrentTimeThrottled, syncVisuals, syncAudio, seekTo]);

  seekToRef.current = seekTo;

  const getClickTimeFromEvent = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect) return 0;
      const scroller = e.currentTarget.closest('.timeline-scroll');
      const scrollLeft = scroller ? scroller.scrollLeft : 0;
      const offsetX = e.clientX - rect.left + scrollLeft;
      const positionX = Math.max(0, offsetX);
      const clampedPxPerSec = Number.isFinite(pxPerSec) && pxPerSec > 0 ? pxPerSec : BASE_PX_PER_SEC;
      const rawTime = positionX / clampedPxPerSec;
      return Math.max(0, Math.min(timelineDuration, rawTime));
    },
    [pxPerSec, timelineDuration]
  );

  const handleSeekMouseDownCapture = (e) => {
    if (
      e.target.closest(
        '.clip, .track, .effect-block, .text-block, .transition-block, .clip-handle, .effect-slider, .transition-add-button, .transition-toolbar, .transition-type, .transition-slider'
      )
    ) {
      return;
    }
    const wasPlaying = isTimelinePlaying();
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
        const wasPlaying = isTimelinePlaying();
        seekTo(Math.max(0, currentTime - 1), wasPlaying);
      }
      if (k === 'arrowright' || k === 'l') {
        e.preventDefault();
        const wasPlaying = isTimelinePlaying();
        seekTo(Math.min(timelineDuration, currentTime + 1), wasPlaying);
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
        updateTextOverlays((prev) => prev.filter((_, i) => i !== selectedTextIndex));
        setSelectedTextIndex(null);
      }
      if ((k === 'backspace' || k === 'delete') && selectedTransitionId) {
        setTransitions((prev) => prev.filter((transition) => transition.id !== selectedTransitionId));
        setSelectedTransitionId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, totalDuration, selectedClipIndex, selectedMusicIndex, selectedEffectIndex, selectedTextIndex, selectedTransitionId]);

  useEffect(() => {
    const video = videoRef.current;
    const image = imageRef.current;
    const seg = clips[activeClipIndex];
    if (!video) return;

    if (!seg) {
      if (image) image.style.display = 'none';
      video.pause();
      return;
    }

    if (seg.type === 'image') {
      if (image) {
        image.src = seg.source || '';
        image.style.display = 'block';
      }
      video.pause();
      video.style.display = 'none';
      video.removeAttribute('src');
      video.load();
      return;
    }

    if (image) image.style.display = 'none';
    video.style.display = '';

    if (!seg.source) return;

    let source = seg.source;
    if (seg.file && typeof seg.source === 'string' && seg.source.startsWith('blob:')) {
      source = URL.createObjectURL(seg.file);
    }

    if (video.src !== source) {
      video.src = source;
    }
    video.currentTime = seg.startOffset || 0;
  }, [activeClipIndex, clips]);

  const addTextAtPlayhead = () => {
    updateTextOverlays((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        content: newText || 'New Text',
        startTime: currentTime,
        duration: 5,
        x: 50,
        y: 50,
        stagePercentX: 50,
        stagePercentY: 50,
        color: newTextColor,
        fontSize: newTextSize,
      }
    ]);
  };

  const startStageTextDrag = (e, index) => {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tx = textOverlays[index];
    if (!tx) return;
    const geometry = resolveOverlayGeometry(tx);
    if (!geometry) return;
    const elementRect = e.currentTarget?.getBoundingClientRect?.() || null;
    const elementHalfWidth = elementRect ? elementRect.width / 2 : 0;
    const elementHalfHeight = elementRect ? elementRect.height / 2 : 0;
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const minStageX = geometry.offsetX + elementHalfWidth;
    const maxStageX = geometry.offsetX + geometry.videoWidth - elementHalfWidth;
    const minStageY = geometry.offsetY + elementHalfHeight;
    const maxStageY = geometry.offsetY + geometry.videoHeight - elementHalfHeight;
    const safeMinStageX = maxStageX >= minStageX ? minStageX : geometry.offsetX + geometry.videoWidth / 2;
    const safeMaxStageX = maxStageX >= minStageX ? maxStageX : safeMinStageX;
    const safeMinStageY = maxStageY >= minStageY ? minStageY : geometry.offsetY + geometry.videoHeight / 2;
    const safeMaxStageY = maxStageY >= minStageY ? maxStageY : safeMinStageY;
    const rawPointerStageX = e.clientX - rect.left;
    const rawPointerStageY = e.clientY - rect.top;
    const pointerStageX = clamp(rawPointerStageX, safeMinStageX, safeMaxStageX);
    const pointerStageY = clamp(rawPointerStageY, safeMinStageY, safeMaxStageY);
    const origStageX = geometry.stageX;
    const origStageY = geometry.stageY;
    setDragTextStageState({
      index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      pointerStageX,
      pointerStageY,
      stageLeft: rect.left,
      stageTop: rect.top,
      origStageX,
      origStageY,
      origVideoX: geometry.videoPercentX,
      origVideoY: geometry.videoPercentY,
      stageWidth: geometry.stageWidth,
      stageHeight: geometry.stageHeight,
      videoWidth: geometry.videoWidth,
      videoHeight: geometry.videoHeight,
      offsetX: geometry.offsetX,
      offsetY: geometry.offsetY,
      elementHalfWidth,
      elementHalfHeight,
      safeMinStageX,
      safeMaxStageX,
      safeMinStageY,
      safeMaxStageY,
    });
  };

  useEffect(() => {
    if (!dragTextStageState) return;
    const onMove = (e) => {
      updateTextOverlays((prev) => {
        const arr = [...prev];
        const tx = { ...arr[dragTextStageState.index] };
        const rawPointerStageX = e.clientX - dragTextStageState.stageLeft;
        const rawPointerStageY = e.clientY - dragTextStageState.stageTop;
        const pointerStageX = Math.max(
          dragTextStageState.safeMinStageX,
          Math.min(dragTextStageState.safeMaxStageX, rawPointerStageX)
        );
        const pointerStageY = Math.max(
          dragTextStageState.safeMinStageY,
          Math.min(dragTextStageState.safeMaxStageY, rawPointerStageY)
        );
        const deltaX = pointerStageX - dragTextStageState.pointerStageX;
        const deltaY = pointerStageY - dragTextStageState.pointerStageY;
        const minStageX = dragTextStageState.safeMinStageX;
        const maxStageX = dragTextStageState.safeMaxStageX;
        const minStageY = dragTextStageState.safeMinStageY;
        const maxStageY = dragTextStageState.safeMaxStageY;
        let newStageX = dragTextStageState.origStageX + deltaX;
        let newStageY = dragTextStageState.origStageY + deltaY;
        newStageX = Math.max(minStageX, Math.min(maxStageX, newStageX));
        newStageY = Math.max(minStageY, Math.min(maxStageY, newStageY));
        const newVideoX = ((newStageX - dragTextStageState.offsetX) / dragTextStageState.videoWidth) * 100;
        const newVideoY = ((newStageY - dragTextStageState.offsetY) / dragTextStageState.videoHeight) * 100;
        const newStagePercentX = (newStageX / dragTextStageState.stageWidth) * 100;
        const newStagePercentY = (newStageY / dragTextStageState.stageHeight) * 100;
        tx.x = Math.max(0, Math.min(100, newVideoX));
        tx.y = Math.max(0, Math.min(100, newVideoY));
        tx.stagePercentX = Math.max(0, Math.min(100, newStagePercentX));
        tx.stagePercentY = Math.max(0, Math.min(100, newStagePercentY));
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
  const selectedTransition = useMemo(() => transitions.find((transition) => transition.id === selectedTransitionId) || null, [transitions, selectedTransitionId]);
  const selectedTransitionContext = useMemo(() => {
    if (!selectedTransition) return null;
    const fromIndex = clips.findIndex((clip) => clip._localId === selectedTransition.fromClipLocalId);
    if (fromIndex === -1) return null;
    const toClip = clips[fromIndex + 1];
    if (!toClip || toClip._localId !== selectedTransition.toClipLocalId) return null;
    const fromClip = clips[fromIndex];
    const maxDuration = Math.max(0.2, Math.min(fromClip.duration || 0, toClip.duration || 0));
    if (!isFinite(maxDuration) || maxDuration <= 0) return null;
    return { fromClip, toClip, maxDuration };
  }, [selectedTransition, clips]);

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
                        {selectedTransition && selectedTransitionContext && (
              <div className="transition-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>Transition</span>
                <select
                  className="transition-type"
                  value={selectedTransition.type}
                  onChange={(e) => updateTransition(selectedTransition.id, { type: e.target.value })}
                  style={{ background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '6px 8px' }}
                >
                  {TRANSITION_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  type="range"
                  min="0.2"
                  max={Math.max(0.2, selectedTransitionContext.maxDuration).toFixed(1)}
                  step="0.1"
                  value={Math.max(0.2, Math.min(selectedTransitionContext.maxDuration, selectedTransition.duration || 0.5))}
                  onChange={(e) => {
                    const val = Math.max(0.2, Math.min(selectedTransitionContext.maxDuration, parseFloat(e.target.value || '0.5')));
                    updateTransition(selectedTransition.id, { duration: val });
                  }}
                  className="transition-slider"
                />
                <input
                  type="number"
                  min="0.2"
                  max={Math.max(0.2, selectedTransitionContext.maxDuration).toFixed(1)}
                  step="0.1"
                  value={Math.max(0.2, Math.min(selectedTransitionContext.maxDuration, selectedTransition.duration || 0.5)).toFixed(1)}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value || '0.5');
                    if (Number.isNaN(raw)) return;
                    const val = Math.max(0.2, Math.min(selectedTransitionContext.maxDuration, raw));
                    updateTransition(selectedTransition.id, { duration: val });
                  }}
                  style={{ width: 60, background: '#222', border: '1px solid #333', color: '#FCFFFC', borderRadius: 6, padding: '6px 8px' }}
                />
                <button
                  onClick={() => removeTransition(selectedTransition.id)}
                  style={{ padding: '6px 12px', borderRadius: 6, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #b91c1c' }}
                >
                  Remove
                </button>
              </div>
            )}
            <button onClick={handleCut} className="cut-btn">✂️ Cut</button>
            <button onClick={goBack} className="back-btn">Back</button>
            <button onClick={handleSave} className="save-btn">Save</button>
            <Link href={route('projects.export', project.id)} className="export-btn">Export</Link>
          </div>
        </div>

        <div className="editor-main" onClick={(e) => e.stopPropagation()}>
          <div className="media-library">
            <h3>Media Library</h3>

            <div
              className="upload-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileUpload(e); }}
              onClick={() => document.getElementById('hiddenFileInput').click()}
            >
              <p style={{ fontSize: '10px' }}>
                {isUploadingMedia ? 'Uploading...' : 'Drop files here or click to upload'}
              </p>
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
              <div className="text-add-inline">
                <input
                  className="text-field text-field--full"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Enter text"
                />
                <div className="text-add-inline-row">
                  <input
                    className="text-field text-field--number"
                    type="number"
                    min="12"
                    max="96"
                    value={newTextSize}
                    onChange={(e) => setNewTextSize(parseInt(e.target.value || 32))}
                  />
                  <input
                    className="text-field text-field--color"
                    type="color"
                    value={newTextColor}
                    onChange={(e) => setNewTextColor(e.target.value)}
                  />
                </div>
              </div>
              {selectedTextIndex !== null && textOverlays[selectedTextIndex] && (
                <div className="text-edit-panel">
                  <input
                    className="text-field text-field--full"
                    value={textOverlays[selectedTextIndex].content}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateTextOverlays((prev) => {
                        const arr = [...prev];
                        arr[selectedTextIndex] = { ...arr[selectedTextIndex], content: v };
                        return arr;
                      });
                    }}
                  />
                  <input
                    className="text-field text-field--number"
                    type="number"
                    min="12"
                    max="96"
                    value={textOverlays[selectedTextIndex].fontSize || 32}
                    onChange={(e) => {
                      const v = Math.max(12, Math.min(96, parseInt(e.target.value || 32)));
                      updateTextOverlays((prev) => {
                        const arr = [...prev];
                        arr[selectedTextIndex] = { ...arr[selectedTextIndex], fontSize: v };
                        return arr;
                      });
                    }}
                  />
                  <input
                    className="text-field text-field--color"
                    type="color"
                    value={textOverlays[selectedTextIndex].color || '#FCFFFC'}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateTextOverlays((prev) => {
                        const arr = [...prev];
                        arr[selectedTextIndex] = { ...arr[selectedTextIndex], color: v };
                        return arr;
                      });
                    }}
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

            <div className="media-section image-section">
              <h4>🖼️ Images</h4>
              <div className="section-divider" />
              {mediaFiles.filter((f) => f.type === 'image').map((file, index) => (
                <div key={`img-${index}`} draggable onDragStart={(e) => handleDragStart(e, { kind: 'media', file })} className="media-item">
                  {file.name}
                </div>
              ))}
              {mediaFiles.filter((f) => f.type === 'image').length === 0 && <p className="hint">No images added yet.</p>}
            </div>
          </div>

          <div className="editor-area" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
            <div className="video-player" onClick={(e) => e.stopPropagation()}>
              <video ref={videoRef} style={{ display: activeClipIsImage ? 'none' : 'block' }} />
              <img
                ref={imageRef}
                className="image-player"
                style={{ display: activeClipIsImage ? 'block' : 'none' }}
                alt={activeClip?.name || 'Image frame'}
                draggable={false}
              />
              <div
                ref={transitionOverlayRef}
                className="transition-overlay-layer"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'transparent', opacity: 0, zIndex: 2 }}
              />
              <div className="overlay-stage" ref={stageRef} onMouseDown={() => setSelectedTextIndex(null)}>
                {activeTexts.map((t) => {
                  const geom = resolveOverlayGeometry(t);
                  const leftPercent = geom
                    ? geom.stagePercentX
                    : Number.isFinite(t.stagePercentX)
                    ? t.stagePercentX
                    : Number.isFinite(t.x)
                    ? t.x
                    : 50;
                  const topPercent = geom
                    ? geom.stagePercentY
                    : Number.isFinite(t.stagePercentY)
                    ? t.stagePercentY
                    : Number.isFinite(t.y)
                    ? t.y
                    : 50;
                  return (
                    <div
                      key={t.id}
                      className={`overlay-text ${selectedTextIndex === t._i ? 'selected' : ''}`}
                      style={{
                        left: `${leftPercent}%`,
                        top: `${topPercent}%`,
                        fontSize: `${t.fontSize || 32}px`,
                        color: t.color || '#FCFFFC'
                      }}
                      onMouseDown={(e) => {
                        selectText(t._i);
                        startStageTextDrag(e, t._i);
                      }}
                    >
                      {t.content}
                    </div>
                  );
                })}
              </div>
              <button className="play-btn" onClick={togglePlay}>Play / Pause</button>
            </div>

            <div
              ref={timelineScrollRef}
              className="timeline-scroll"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="effects-timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={clearSelection}
              >
                <div className="lane" style={{ width: `${timelineWidth}px` }}>
                  <EffectsLaneContent
                    effects={effects}
                    selectedEffectIndex={selectedEffectIndex}
                    pxPerSec={pxPerSec}
                    onSelect={selectEffect}
                    onStartResize={startEffectResize}
                    onStartDrag={startEffectDrag}
                    onDragStart={handleEffectDragStart}
                    onDrop={handleEffectDrop}
                    onIntensityChange={handleEffectIntensityChange}
                  />
                  <LanePlayhead position={currentTime * pxPerSec} />
                </div>
              </div>

              <div
                className="text-timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={clearSelection}
              >
                <div className="lane" style={{ width: `${timelineWidth}px` }}>
                  <TextLaneContent
                    texts={textOverlays}
                    selectedTextIndex={selectedTextIndex}
                    pxPerSec={pxPerSec}
                    onSelect={selectText}
                    onStartResize={startTextResize}
                    onStartDrag={startTextDrag}
                  />
                  <LanePlayhead position={currentTime * pxPerSec} />
                </div>
              </div>

              <div
                className="timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={clearSelection}
              >
                <div className="lane" style={{ width: `${timelineWidth}px` }}>
                  <ClipLaneContent
                    clips={clips}
                    selectedClipIndex={selectedClipIndex}
                    pxPerSec={pxPerSec}
                    transitionLookup={transitionLookup}
                    selectedTransitionId={selectedTransitionId}
                    onSelectClip={selectClip}
                    onClipDragStart={handleClipDragStart}
                    onClipDrop={handleClipDrop}
                    onStartResize={startResize}
                    onSelectTransition={selectTransition}
                    onAddTransition={addTransitionBetween}
                  />
                  <LanePlayhead position={currentTime * pxPerSec} />
                </div>
              </div>

              <div
                className="music-timeline"
                onMouseDownCapture={handleSeekMouseDownCapture}
                onClick={clearSelection}
              >
                <div className="lane" style={{ width: `${timelineWidth}px` }}>
                  <MusicLaneContent
                    tracks={musicTracks}
                    selectedMusicIndex={selectedMusicIndex}
                    pxPerSec={pxPerSec}
                    onSelect={selectMusic}
                    onDragStart={handleTrackDragStart}
                    onDrop={handleTrackDrop}
                    onStartResize={startMusicResize}
                    registerAudioRef={registerAudioRef}
                    onLoadedMetadata={handleAudioMetadataLoaded}
                  />
                  <LanePlayhead position={currentTime * pxPerSec} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
