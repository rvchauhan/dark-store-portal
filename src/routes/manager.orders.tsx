import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/manager/orders")({
  component: Orders,
});

type Status = "New" | "Picking" | "Packed" | "Out for Delivery" | "Delivered";
type Order = {
  id: string;
  customer: string;
  items: number;
  total: string;
  eta: string;
  status: Status;
  address: string;
  rider?: string;
};

const initial: Order[] = [
  { id: "#A2091", customer: "Meera Iyer", items: 4, total: "£12.40", eta: "8m", status: "New", address: "14 Wharf Rd, E15" },
  { id: "#A2090", customer: "Jonas Baker", items: 2, total: "£6.10", eta: "10m", status: "New", address: "77 High St, E15" },
  { id: "#A2089", customer: "Ravi Menon", items: 7, total: "£24.80", eta: "6m", status: "Picking", address: "3 Church Ln, E15", rider: "Priya S." },
  { id: "#A2088", customer: "Ada Nkosi", items: 3, total: "£9.20", eta: "4m", status: "Packed", address: "22 Park View, E15", rider: "Vikram P." },
  { id: "#A2087", customer: "Lena Ortiz", items: 5, total: "£18.60", eta: "2m", status: "Out for Delivery", address: "8 Mill Yard, E15", rider: "Rahul K." },
  { id: "#A2081", customer: "Tom Fisher", items: 2, total: "£5.90", eta: "—", status: "Delivered", address: "1 Bridge St, E15", rider: "Ayesha N." },
];

const columns: Status[] = ["New", "Picking", "Packed", "Out for Delivery", "Delivered"];

const statusStyles: Record<Status, string> = {
  New: "bg-primary/10 text-primary",
  Picking: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.5_0.16_75)]",
  Packed: "bg-primary-container text-on-primary-container",
  "Out for Delivery": "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]",
  Delivered: "bg-surface-container-high text-on-surface-variant",
};

function Orders() {
  const [orders, setOrders] = useState(initial);

  const advance = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const idx = columns.indexOf(o.status);
        if (idx === columns.length - 1) return o;
        return { ...o, status: columns[idx + 1] };
      }),
    );
  };

  return (
    <AppShell role="manager" searchPlaceholder="Search orders…">
      <PageHeader
        title="Order Fulfillment"
        subtitle="Live queue for Dark Store #402 — drag orders through the flow"
        actions={
          <>
            <button className="flex items-center gap-2 bg-surface border border-outline-variant px-5 py-2 rounded-full text-sm hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-[18px]">tune</span>
              Filters
            </button>
            <button className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20">
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Order
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {columns.map((col) => {
          const items = orders.filter((o) => o.status === col);
          return (
            <div key={col} className="bg-surface-container-low rounded-2xl p-3">
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles[col]}`}>
                    {col}
                  </span>
                </div>
                <span className="text-xs font-bold text-on-surface-variant">{items.length}</span>
              </div>
              <div className="space-y-3 mt-2">
                {items.map((o) => (
                  <div key={o.id} className="bg-surface rounded-xl border border-outline-variant p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-on-surface">{o.id}</p>
                      <span className="text-xs font-semibold text-primary">{o.eta}</span>
                    </div>
                    <p className="text-sm text-on-surface font-medium">{o.customer}</p>
                    <p className="text-xs text-on-surface-variant truncate">{o.address}</p>
                    <div className="flex justify-between items-center mt-3 text-xs text-on-surface-variant">
                      <span>{o.items} items</span>
                      <span className="font-bold text-on-surface">{o.total}</span>
                    </div>
                    {o.rider && (
                      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-outline-variant">
                        <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-primary text-[10px] font-bold">
                          {o.rider.split(" ").map((s) => s[0]).join("")}
                        </div>
                        <span className="text-xs text-on-surface-variant">{o.rider}</span>
                      </div>
                    )}
                    {col !== "Delivered" && (
                      <button
                        onClick={() => advance(o.id)}
                        className="w-full mt-3 text-xs font-semibold text-primary hover:bg-primary/5 rounded-full py-2 flex items-center justify-center gap-1"
                      >
                        Advance
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
