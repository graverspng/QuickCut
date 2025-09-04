import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';

export default function Editor({ project }) {
    const [mediaFiles, setMediaFiles] = useState(project.media_files || []);
    const [clips, setClips] = useState(project.clips || []);
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [globalDuration, setGlobalDuration] = useState(60); // default 1min timeline
    const videoRef = useRef(null);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
    };

    const goBack = () => router.get(route('dashboard'));

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files).map((file) => ({
            name: file.name,
            source: URL.createObjectURL(file),
            duration: 0,
        }));
        setMediaFiles((prev) => [...prev, ...files]);
    };

    const handleDragStart = (e, index) => {
        e.dataTransfer.setData('index', index);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const index = parseInt(e.dataTransfer.getData('index'));
        const file = mediaFiles[index];
        if (file) setClips((prev) => [...prev, { ...file }]);
    };

    const handleSave = () => {
        router.post(route('projects.store'), {
            project_id: project.id,
            media_files: mediaFiles,
            clips: clips,
        });
    };

    // Fetch clip durations
    useEffect(() => {
        clips.forEach((clip, i) => {
            if (!clip.duration) {
                const vid = document.createElement('video');
                vid.src = clip.source;
                vid.onloadedmetadata = () => {
                    setClips((prev) => {
                        const newClips = [...prev];
                        newClips[i].duration = vid.duration;
                        return newClips;
                    });
                };
            }
        });
    }, [clips]);

    // Compute total timeline duration
    const totalDuration = useMemo(() => {
        return clips.reduce((sum, c) => sum + (c.duration || 0), 0) || globalDuration;
    }, [clips, globalDuration]);

    // Switch active clip
    useEffect(() => {
        if (videoRef.current && clips[activeClipIndex]) {
            videoRef.current.src = clips[activeClipIndex].source;
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        }
    }, [activeClipIndex, clips]);

    // Sync playback across clips
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const elapsedBefore = clips
                .slice(0, activeClipIndex)
                .reduce((sum, c) => sum + (c.duration || 0), 0);
            setCurrentTime(elapsedBefore + video.currentTime);
        };

        const onEnded = () => {
            if (activeClipIndex < clips.length - 1) {
                setActiveClipIndex((prev) => prev + 1);
            } else {
                video.pause();
                setActiveClipIndex(0);
                setCurrentTime(0);
            }
        };

        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('ended', onEnded);
        };
    }, [clips, activeClipIndex]);

    // Seek in timeline
    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const timelineWidth = rect.width;
        const newGlobalTime = (clickX / timelineWidth) * totalDuration;

        let acc = 0;
        let newIndex = 0;
        for (let i = 0; i < clips.length; i++) {
            if (newGlobalTime < acc + clips[i].duration) {
                newIndex = i;
                break;
            }
            acc += clips[i].duration;
        }

        setActiveClipIndex(newIndex);
        if (videoRef.current) {
            videoRef.current.src = clips[newIndex].source;
            videoRef.current.currentTime = newGlobalTime - acc;
            videoRef.current.play().catch(() => {});
        }
    };

    // Spacebar toggle
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="flex flex-col h-screen p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">{project.name}</h2>
                    <div className="flex space-x-2">
                        <button
                            onClick={goBack}
                            className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-green-500 px-3 py-1 rounded text-white hover:bg-green-600"
                        >
                            Save
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Media Library */}
                    <div className="w-1/4 bg-gray-100 border-r overflow-y-auto p-4">
                        <h3 className="font-semibold mb-2">Media Library</h3>
                        <input type="file" multiple onChange={handleFileUpload} className="mb-2" />
                        <div className="space-y-2">
                            {mediaFiles.map((file, index) => (
                                <div
                                    key={index}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    className="bg-gray-200 h-16 flex items-center justify-center cursor-pointer"
                                >
                                    {file.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Editor Area */}
                    <div
                        className="flex-1 flex flex-col bg-gray-50"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {/* Video Player */}
                        <div className="flex-1 relative bg-black flex justify-center items-center">
                            <video ref={videoRef} className="w-full h-full object-contain" />
                            <button
                                className="absolute bottom-2 left-2 bg-white px-2 py-1 rounded"
                                onClick={togglePlay}
                            >
                                Play / Pause
                            </button>
                        </div>

                        {/* Timeline */}
                        <div
                            className="h-24 bg-gray-300 p-2 flex items-center overflow-x-auto relative cursor-pointer"
                            onClick={handleSeek}
                        >
                            <div className="flex items-center" style={{ width: '1200px' }}>
                                {clips.map((clip, index) => {
                                    const width = (clip.duration / totalDuration) * 1200;
                                    return (
                                        <div
                                            key={index}
                                            className="bg-blue-500 h-full rounded flex items-center justify-center text-white"
                                            style={{ width: `${width}px` }}
                                        >
                                            {clip.name}
                                        </div>
                                    );
                                })}

                                {/* Playhead */}
                                <div
                                    className="absolute top-0 bottom-0 w-1 bg-red-500"
                                    style={{
                                        left: `${(currentTime / totalDuration) * 1200}px`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
