import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';

const formatOptions = {
    video: [
        { value: 'mp4', label: 'MP4 (H.264)' },
        { value: 'mov', label: 'MOV (Apple QuickTime)' },
        { value: 'webm', label: 'WEBM (Web Ready)' },
        { value: 'gif', label: 'GIF (Animated)' },
    ],
    audio: [
        { value: 'mp3', label: 'MP3 (Compressed)' },
        { value: 'wav', label: 'WAV (Lossless)' },
        { value: 'aac', label: 'AAC (Apple)' },
        { value: 'flac', label: 'FLAC (Hi-Res)' },
    ],
    image: [
        { value: 'jpg', label: 'JPG (Compressed)' },
        { value: 'png', label: 'PNG (Transparent)' },
        { value: 'webp', label: 'WEBP (Modern Web)' },
        { value: 'tiff', label: 'TIFF (Lossless)' },
    ],
};

const presetProfiles = [
    {
        name: 'Social Media Snippet',
        description: 'Square or vertical clips ready for TikTok, Instagram Reels, or YouTube Shorts.',
        formats: 'MP4, WEBM, GIF',
    },
    {
        name: 'Studio Master',
        description: 'High-fidelity exports for mixing, mastering, or archival storage.',
        formats: 'WAV, FLAC, TIFF',
    },
    {
        name: 'Lightweight Preview',
        description: 'Perfect for quick approvals and emailing sneak peeks to collaborators.',
        formats: 'MP3, JPG, WEBP',
    },
];

export default function FormatChanger() {
    const [category, setCategory] = useState('video');
    const [targetFormat, setTargetFormat] = useState(formatOptions.video[0].value);
    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState(null);
    const [history, setHistory] = useState([]);

    const availableFormats = useMemo(() => formatOptions[category] ?? [], [category]);

    const handleCategoryChange = (event) => {
        const newCategory = event.target.value;
        setCategory(newCategory);
        setTargetFormat(formatOptions[newCategory]?.[0]?.value ?? '');
        setStatus(null);
    };

    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        setSelectedFile(file ?? null);
        setStatus(null);
    };

    const handleConvert = (event) => {
        event.preventDefault();

        if (!selectedFile) {
            setStatus({ type: 'error', message: 'Select a media file to start converting.' });
            return;
        }

        const originalName = selectedFile.name;
        const convertedName = originalName.includes('.')
            ? `${originalName.split('.').slice(0, -1).join('.')}.${targetFormat}`
            : `${originalName}.${targetFormat}`;

        setStatus({
            type: 'success',
            message: `${originalName} is ready to download as ${convertedName}.`,
        });

        setHistory((prev) => [
            {
                id: Date.now(),
                original: originalName,
                converted: convertedName,
                format: targetFormat,
                category,
            },
            ...prev,
        ].slice(0, 4));
    };

    return (
        <AuthenticatedLayout
            header={<h2 className="text-xl font-semibold leading-tight text-[#FCFFFC]">Format Changer</h2>}
        >
            <Head title="Format Changer" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
                    <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
                        <form
                            onSubmit={handleConvert}
                            className="space-y-6 rounded-2xl border border-gray-800 bg-[#101010] p-6 shadow-xl"
                        >
                            <div>
                                <h3 className="text-2xl font-bold text-white">Convert anything in seconds</h3>
                                <p className="mt-2 text-sm text-gray-300">
                                    Pick the media type, drop your file, and QuickCut will prep it in the perfect format for
                                    your next upload or presentation.
                                </p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="flex flex-col rounded-xl border border-gray-700 bg-black/40 p-4 text-sm text-gray-200">
                                    <span className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#2BA84A]">
                                        Media type
                                    </span>
                                    <select
                                        value={category}
                                        onChange={handleCategoryChange}
                                        className="rounded-lg border border-gray-700 bg-[#1a1a1a] px-3 py-2 text-sm text-gray-100 focus:border-[#2BA84A] focus:ring-[#2BA84A]"
                                    >
                                        <option value="video">Video</option>
                                        <option value="audio">Audio</option>
                                        <option value="image">Image</option>
                                    </select>
                                </label>

                                <label className="flex flex-col rounded-xl border border-gray-700 bg-black/40 p-4 text-sm text-gray-200">
                                    <span className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#2BA84A]">
                                        Target format
                                    </span>
                                    <select
                                        value={targetFormat}
                                        onChange={(event) => setTargetFormat(event.target.value)}
                                        className="rounded-lg border border-gray-700 bg-[#1a1a1a] px-3 py-2 text-sm text-gray-100 focus:border-[#2BA84A] focus:ring-[#2BA84A]"
                                    >
                                        {availableFormats.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-600 bg-black/40 px-6 py-10 text-center text-gray-300">
                                <input
                                    id="format-changer-input"
                                    type="file"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    accept={category === 'image' ? 'image/*' : category === 'audio' ? 'audio/*' : 'video/*'}
                                />
                                <label htmlFor="format-changer-input" className="cursor-pointer text-sm font-semibold text-[#2BA84A] hover:text-[#248232]">
                                    Click to choose a file
                                </label>
                                <p className="mt-2 text-xs text-gray-400">or drag and drop it anywhere on the page</p>

                                {selectedFile ? (
                                    <div className="mt-5 w-full max-w-md rounded-lg border border-gray-700 bg-[#121212] px-4 py-3 text-left text-sm text-gray-200">
                                        <p className="font-semibold text-white">{selectedFile.name}</p>
                                        <p className="mt-1 text-xs text-gray-400">
                                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type || 'Unknown type'}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="mt-5 text-xs text-gray-500">No file selected yet.</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs text-gray-400">
                                    Quick tip: keep video exports under 500MB for smooth uploads everywhere.
                                </div>
                                <button
                                    type="submit"
                                    className="inline-flex items-center justify-center rounded-xl bg-[#2BA84A] px-6 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-[#248232]"
                                >
                                    Convert file
                                </button>
                            </div>

                            {status && (
                                <div
                                    className={`rounded-xl border px-4 py-3 text-sm ${
                                        status.type === 'success'
                                            ? 'border-green-500/40 bg-green-500/10 text-green-300'
                                            : 'border-red-500/40 bg-red-500/10 text-red-300'
                                    }`}
                                >
                                    {status.message}
                                </div>
                            )}
                        </form>

                        <aside className="space-y-6 rounded-2xl border border-gray-800 bg-[#101010] p-6 shadow-xl">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Recent conversions</h3>
                                <p className="mt-1 text-xs text-gray-400">
                                    We keep the latest versions handy so you can redownload without repeating the steps.
                                </p>

                                <ul className="mt-4 space-y-3 text-sm text-gray-200">
                                    {history.length === 0 && <li className="text-xs text-gray-500">No conversions yet.</li>}
                                    {history.map((item) => (
                                        <li
                                            key={item.id}
                                            className="rounded-lg border border-gray-700 bg-[#161616] px-4 py-3"
                                        >
                                            <p className="font-semibold text-white">{item.converted}</p>
                                            <p className="text-xs text-gray-400">
                                                from {item.original} · {item.category.toUpperCase()} → {item.format.toUpperCase()}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-white">Preset profiles</h3>
                                <div className="mt-4 space-y-4">
                                    {presetProfiles.map((profile) => (
                                        <div
                                            key={profile.name}
                                            className="rounded-xl border border-gray-700 bg-[#161616] p-4"
                                        >
                                            <p className="text-sm font-semibold text-white">{profile.name}</p>
                                            <p className="mt-1 text-xs text-gray-400">{profile.description}</p>
                                            <p className="mt-2 text-xs font-semibold text-[#2BA84A]">{profile.formats}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-white">Export tips</h3>
                                <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-gray-400">
                                    <li>Use MP4 (H.264) for universal playback support.</li>
                                    <li>Switch to WEBM or GIF for lightweight social previews.</li>
                                    <li>WAV keeps audio pristine for studio workflows, while MP3 is perfect for sharing.</li>
                                </ul>
                            </div>
                        </aside>
                    </section>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}