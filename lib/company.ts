// The company's printed identity: name, address, and the licence label and
// number that every report, slip, certificate, label and Word document prints.
//
// 4 Oct 2026 (FB-0046, Ravi): these are no longer fixed in code. The System
// Administrator edits them in the app (Admin -> Company Details, table
// company_settings, migration 0102). The values below are only what is used
// until the saved ones have been loaded, or if they cannot be read.
//
// Browser side: the dashboard layout reads the saved values and hands them to
// <CompanyProvider>, which calls setCompany(), so a generator that runs on a
// button click (slips, Word files, labels, register PDFs) reads them with
// getCompany(). Server side: read them with fetchCompany() (lib/company-server.ts)
// and pass them in. Kept free of any PDF/Word library so any file can import it.
export type Company = {
  name: string;
  address: string;
  licenceLabel: string;
  licenceNo: string;
};

export const DEFAULT_COMPANY: Company = {
  name: "Atharva Nature Healthcare Pvt. Ltd.",
  address: "Wagholi, Pune",
  licenceLabel: "Mfg. Lic. No.",
  licenceNo: "PD/AYU/111",
};

let current: Company = DEFAULT_COMPANY;

export function setCompany(c: Company) {
  current = c;
}

export function getCompany(): Company {
  return current;
}

// "Atharva Nature Healthcare Pvt. Ltd., Wagholi, Pune"
export function companyNameAndAddress(c: Company = current): string {
  return c.address ? `${c.name}, ${c.address}` : c.name;
}
// "Mfg. Lic. No. - PD/AYU/111"
export function licenceLine(c: Company = current): string {
  return `${c.licenceLabel} - ${c.licenceNo}`;
}
// "Wagholi, Pune · Mfg. Lic. No.: PD/AYU/111"
export function addressAndLicenceLine(c: Company = current): string {
  const lic = `${c.licenceLabel}: ${c.licenceNo}`;
  return c.address ? `${c.address} · ${lic}` : lic;
}
