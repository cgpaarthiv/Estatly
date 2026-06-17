import { useEffect, useState } from "react";
import { db } from "./db";

export type Project = {
  id: string;
  name: string;
  lp_number: string;
  description: string | null;
  created_at: string;
};

export type Plot = {
  id: string;
  project_id: string;
  plot_number: string;
  plot_type: string | null;
  size_sqft: number | null;
  length: number | null;
  width: number | null;
  price: number;
  govt_price: number;
  status: "available" | "advance" | "sale_agreement" | "registered";
  document_number: string | null;
  customer_id: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  description: string | null;
  booking_date: string | null;
  registration_date: string | null;
  agreement_date: string | null;
  advance_date: string | null;
  sale_agreement_date: string | null;
  notes: string | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type Payment = {
  id: string;
  plot_id: string;
  customer_id: string | null;
  amount_white_bank: number;
  amount_white_cash: number;
  amount_black_cash: number;
  amount_advance_cash: number;
  amount_advance_bank: number;
  payment_date: string;
  notes: string | null;
};

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const data = await db.projects.list();
    setProjects(data);
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);
  return { projects, loading, reload };
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
