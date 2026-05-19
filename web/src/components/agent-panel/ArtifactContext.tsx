interface ArtifactContextProps {
  entries: unknown[];
}

export function ArtifactContext({ entries }: ArtifactContextProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-sm text-text-muted">上下文 (placeholder), entries: {entries.length}</p>
    </div>
  );
}
