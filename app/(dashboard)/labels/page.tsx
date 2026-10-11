import { PageHeader } from "@/components/ui/page-header";
import { LabelPicker } from "./label-picker";

// SCAN-P4-16 (Ravi, 12 Oct 2026): this page no longer reads every batch ever
// received. The picker asks the server for the batches that match what the
// user types and are eligible for the chosen label (lib/actions/labels.ts).
export default function LabelsPage() {
  return (
    <div>
      <PageHeader
        title="Label Printing"
        description="Print compact labels for raw material and finished product batches — Approved Raw Material, Under Test, In-process, and Finished Product templates."
      />
      <LabelPicker />
    </div>
  );
}
