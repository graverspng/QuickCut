import '@/../css/SaveStatus.css';

export default function SaveStatusBadge({ isDirty, saving }) {
    if (saving) {
        return (
            <span className="ssb ssb--saving">
                <span className="ssb-dot" />
                Saving…
            </span>
        );
    }
    if (isDirty) {
        return (
            <span className="ssb ssb--unsaved">
                <span className="ssb-dot" />
                Unsaved
            </span>
        );
    }
    return (
        <span className="ssb ssb--saved">
            <span className="ssb-dot" />
            Saved
        </span>
    );
}
