export function SignatureBlock({
  labels = ["Prepared by", "Checked by", "Approved by"],
}: {
  labels?: string[];
}) {
  return (
    <div className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-4 text-xs">
      {labels.map((label) => (
        <div key={label}>
          <div className="h-10 border-b border-black/30" />
          <p className="mt-1 text-muted">
            {label} · Date: ______________
          </p>
        </div>
      ))}
    </div>
  );
}
