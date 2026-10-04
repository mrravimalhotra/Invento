"use client";

import { useEffect } from "react";
import { setCompany, type Company } from "@/lib/company";

// Renders nothing; hands the saved company details (Admin -> Company Details)
// to the PDF / Word / label generators, which read them when a button is clicked.
export function CompanySetter({ company }: { company: Company }) {
  const { name, address, licenceLabel, licenceNo } = company;
  useEffect(() => {
    setCompany({ name, address, licenceLabel, licenceNo });
  }, [name, address, licenceLabel, licenceNo]);
  return null;
}
