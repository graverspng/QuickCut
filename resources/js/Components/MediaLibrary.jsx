import MediaLibrary from '@/Components/Editor/MediaLibrary';
import Timeline from '@/Components/Editor/Timeline';
import Player from '@/Components/Editor/Player';
import EffectsPanel from '@/Components/Editor/EffectsPanel';

export default function Editor({ project }) {
    return (
        <div className="flex h-screen">
            {/* Left panel */}
            <div className="w-1/4 border-r">
                <MediaLibrary projectId={project.id} />
            </div>

            {/* Main area */}
            <div className="flex-1 flex flex-col">
                <Player />
                <Timeline projectId={project.id} />
            </div>

            {/* Right panel (optional effects) */}
            <div className="w-1/4 border-l">
                <EffectsPanel />
            </div>
        </div>
    );
}
