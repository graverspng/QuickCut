// timelineUtils.js

// Normalize clips so their startTime values are continuous
export const normalizeClips = (clips) => {
    let accumulated = 0;
    return clips.map((clip) => {
        const c = { ...clip };
        c.startTime = accumulated;
        accumulated += c.duration || 0;
        return c;
    });
};

// Normalize tracks so their startTime values are continuous
export const normalizeTracks = (tracks) => {
    let accumulated = 0;
    return tracks.map((track) => {
        const t = { ...track };
        t.startTime = accumulated;
        accumulated += t.duration || 0;
        return t;
    });
};

// Calculate clip width dynamically based on container width
export const getClipWidth = (clip, totalDuration, containerWidth) => {
    if (!clip || !totalDuration) return 0;
    return (clip.duration / totalDuration) * containerWidth;
};
