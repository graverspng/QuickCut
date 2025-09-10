// resources/js/Pages/EditorMobile.jsx
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { normalizeClips, normalizeTracks, getClipWidth } from '@/utils/timelineUtils';
import '@/../css/EditorMobile.css';

export default function EditorMobile({ project }) {
    const [mediaFiles, setMediaFiles] = useState(project.media_files || []);
    const [clips, setClips] = useState(normalizeClips(project.clips || []));
    const [musicTracks, setMusicTracks] = useState(normalizeTracks(project.music_tracks || []));
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const [selectedClipIndex, setSelectedClipIndex] = useState(null);
    const [selectedMusicIndex, setSelectedMusicIndex] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);

    const videoRef = useRef(null);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
    };

    const goBack = () => router.get(route('dashboard'));

    const handleSave = () => {
        router.put(route('projects.update', project.id), {
            media_files: mediaFiles,
            clips: clips,
            music_tracks: musicTracks,
        });
        alert("Project saved!");
    };

    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="editor-mobile">
                {/* Video Preview */}
                <div className="video-preview">
                    <video ref={videoRef} className="video-player" controls />
                </div>

                {/* Bottom Controls */}
                <div className="mobile-controls">
                    <button onClick={goBack} className="back-btn">Back</button>
                    <button onClick={togglePlay} className="play-btn">▶️</button>
                    <button onClick={handleSave} className="save-btn">💾 Save</button>
                </div>

                {/* Timeline (scrollable horizontally on mobile) */}
                <div className="timeline-mobile">
                    {clips.map((clip, i) => (
                        <div
                            key={i}
                            className={`clip-mobile ${selectedClipIndex === i ? 'selected' : ''}`}
                            onClick={() => setSelectedClipIndex(i)}
                        >
                            🎞 {clip.name}
                        </div>
                    ))}

                    {musicTracks.map((track, i) => (
                        <div
                            key={i}
                            className={`track-mobile ${selectedMusicIndex === i ? 'selected' : ''}`}
                            onClick={() => setSelectedMusicIndex(i)}
                        >
                            🎵 {track.name}
                        </div>
                    ))}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
