// The one place the company's printed identity is defined (29 Sept 2026,
// ACC group 9 decision (b), Ravi). Every PDF and Word output reads these, so
// the name and licence number are spelled one way everywhere.
//
// Kept free of any PDF/Word library so any file can import it.
export const COMPANY_NAME = "Atharva Nature Healthcare Pvt. Ltd.";
export const COMPANY_ADDRESS = "Wagholi, Pune";
export const MFG_LIC_NO = "PD/AYU-111";

// "Atharva Nature Healthcare Pvt. Ltd., Wagholi, Pune"
export const COMPANY_NAME_AND_ADDRESS = `${COMPANY_NAME}, ${COMPANY_ADDRESS}`;
// "Mfg. Lic. No. - PD/AYU-111"
export const MFG_LIC_LINE = `Mfg. Lic. No. - ${MFG_LIC_NO}`;
