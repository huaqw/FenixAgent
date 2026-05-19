interface ArtifactPreviewProps {
  entries: unknown[];
}

export function ArtifactPreview({ entries }: ArtifactPreviewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-sm text-text-muted">预览 (placeholder), entries: {entries.length}</p>
    </div>
  );
}
