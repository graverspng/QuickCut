import { useMemo, useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import '@/../css/formatchanger.css';

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

export default function FormatChanger() {
  const [category, setCategory] = useState(null);
  const [targetFormat, setTargetFormat] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const availableFormats = useMemo(() => (category ? formatOptions[category] : []), [category]);

  const detectCategory = (file) => {
    if (!file) return null;
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('image/')) return 'image';
    return null;
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const detected = detectCategory(file);
    if (!detected) return;

    setCategory(detected);
    setTargetFormat(formatOptions[detected][0].value);
    setSelectedFile(file);
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFileSelect(file);
  };

  const handleConvert = (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      const originalName = selectedFile.name;
      const convertedName = originalName.includes('.')
        ? `${originalName.split('.').slice(0, -1).join('.')}.${targetFormat}`
        : `${originalName}.${targetFormat}`;

      const blob = new Blob([`Converted content of ${originalName}`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      setHistory((prev) => [
        { 
          id: Date.now(), 
          original: originalName, 
          converted: convertedName, 
          format: targetFormat, 
          category, 
          url 
        },
        ...prev,
      ].slice(0, 5));

      // Reset selection after conversion
      setSelectedFile(null);
      setCategory(null);
      setTargetFormat('');
    }, 2000);
  };

  return (
    <AuthenticatedLayout>
      <Head title="Convert Media" />

      {loading && (
        <div className="loader-overlay">
          <div className="loader"></div>
        </div>
      )}

      <div className="formatchanger-page">
        <div className="formatchanger-wrapper">
          <div className="formatchanger-title fade-in-up">
            <h2>Convert Your Media</h2>
            <p>Drop your file, QuickCut will auto-detect the type and let you choose an output format.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Conversion Form */}
            <div className="fc-card">
              <form onSubmit={handleConvert} className="space-y-6">
                {/* File Upload with Drag & Drop */}
                <div
                  className={`fc-upload ${isDragging ? 'drag-active' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input
                    id="format-changer-input"
                    type="file"
                    onChange={handleInputChange}
                    className="hidden"
                    accept="video/*,audio/*,image/*"
                  />
                  <label htmlFor="format-changer-input">Click to choose a file</label>
                  <p className="mt-2 text-xs text-gray-400">or drag & drop it here</p>

                  {selectedFile ? (
                    <div className="mt-4 text-left text-sm bg-black/40 p-3 rounded">
                      <p className="font-semibold">{selectedFile.name}</p>
                      <p className="text-xs text-gray-400">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type || 'Unknown type'}
                      </p>
                      <p className="text-xs text-[var(--green-2)] mt-1">Detected type: {category}</p>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-gray-500">No file selected yet.</p>
                  )}
                </div>

                {/* Format Select (only if file chosen) */}
                {category && (
                  <div>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[var(--green-2)]">Target format</span>
                      <select
                        value={targetFormat}
                        onChange={(e) => setTargetFormat(e.target.value)}
                        className="fc-input"
                      >
                        {availableFormats.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-400">Tip: keep video exports under 500MB.</p>
                  <button type="submit" className="fc-button">Convert file</button>
                </div>
              </form>
            </div>

            {/* Recent Conversions */}
            <div className="fc-card">
              <h3 className="text-lg font-semibold text-white">Recent Conversions</h3>
              <ul className="fc-history mt-4 space-y-3 text-sm">
                {history.length === 0 && <li className="text-xs text-gray-400">No conversions yet.</li>}
                {history.map((item) => (
                  <li key={item.id} className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{item.converted}</p>
                      <p className="text-xs text-gray-400">
                        from {item.original} · {item.category.toUpperCase()} → {item.format.toUpperCase()}
                      </p>
                    </div>
                    <a
                      href={item.url}
                      download={item.converted}
                      className="fc-button px-3 py-1 text-xs"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
