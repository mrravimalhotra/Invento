// B23 (30 Sept 2026): the old app showed the vendor's address and mobile as soon
// as a vendor was chosen on the Purchase form. Read-only; edit them on Vendor Master.
export function VendorContactLine({ address, mobile }: { address?: string | null; mobile?: string | null }) {
  return (
    <p className="text-sm text-muted">
      <span className="font-medium text-foreground">Address:</span>{" "}
      <span className="whitespace-pre-line">{address?.trim() || "not on file"}</span>
      <span className="mx-2">·</span>
      <span className="font-medium text-foreground">Mobile:</span> {mobile?.trim() || "not on file"}
    </p>
  );
}
