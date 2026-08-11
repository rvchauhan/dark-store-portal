import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import {
  getStoreApi,
  updateStoreApi,
  changePasswordApi,
  getNotificationPreferencesApi,
  updateNotificationPreferencesApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/types";
import { jsonString, jsonNumber, jsonBoolean } from "@/components/DarkStoreWizard";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/manager/settings")({
  component: ManagerSettings,
});

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

function ManagerSettings() {
  const session = useSession();
  const storeId = session?.storeId;

  return (
    <AppShell role="manager" shellTitle="Settings" searchPlaceholder="Search settings...">
      <PageHeader
        title="Settings"
        subtitle="Store profile, account, and notification preferences."
      />

      {!storeId && (
        <p className="mb-4 text-sm text-destructive">
          No store linked to this user. Re-login as manager@qcommerce.io.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <StoreProfileCard storeId={storeId ?? null} />
        <div className="space-y-5">
          <AccountCard />
          <NotificationPreferencesCard />
        </div>
      </div>
    </AppShell>
  );
}

function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm p-6">
      <h3 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h3>
      <p className="text-sm text-on-surface-variant mt-1">{subtitle}</p>
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
      {children}
    </label>
  );
}

const fieldClass =
  "w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60";

function StoreProfileCard({ storeId }: { storeId: string | null }) {
  const queryClient = useQueryClient();
  const storeQuery = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => getStoreApi(storeId!),
    enabled: Boolean(storeId),
  });

  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  const [capacity, setCapacity] = useState("");
  const [coldStorage, setColdStorage] = useState(false);

  useEffect(() => {
    if (!storeQuery.data) return;
    setOpen(jsonString(storeQuery.data.operatingHours, "open"));
    setClose(jsonString(storeQuery.data.operatingHours, "close"));
    const capacityM3 = jsonNumber(storeQuery.data.facility, "capacityM3");
    setCapacity(capacityM3 !== undefined ? String(capacityM3) : "");
    setColdStorage(jsonBoolean(storeQuery.data.facility, "coldStorage"));
  }, [storeQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const store = storeQuery.data!;
      // facility/operatingHours are replaced wholesale server-side — spread the
      // existing blob first so admin-set fields (street, contact, etc.) survive.
      const existingHours =
        typeof store.operatingHours === "object" && store.operatingHours
          ? (store.operatingHours as Record<string, unknown>)
          : {};
      const existingFacility =
        typeof store.facility === "object" && store.facility
          ? (store.facility as Record<string, unknown>)
          : {};

      return updateStoreApi(storeId!, {
        operatingHours: { ...existingHours, open: open || undefined, close: close || undefined },
        facility: {
          ...existingFacility,
          capacityM3: capacity ? Number(capacity) : null,
          coldStorage,
        },
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["store", storeId], updated);
      toast.success("Store profile updated");
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to update store profile")),
  });

  return (
    <SettingsCard
      title="Store Profile"
      subtitle={
        storeQuery.data ? `${storeQuery.data.name} · ${storeQuery.data.address}` : "Loading…"
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>Opens at</FieldLabel>
          <input
            type="time"
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            disabled={!storeQuery.data}
            className={fieldClass}
          />
        </div>
        <div>
          <FieldLabel>Closes at</FieldLabel>
          <input
            type="time"
            value={close}
            onChange={(e) => setClose(e.target.value)}
            disabled={!storeQuery.data}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Storage capacity (m³)</FieldLabel>
        <input
          type="number"
          min="0"
          step="0.1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          disabled={!storeQuery.data}
          placeholder="e.g. 45"
          className={fieldClass}
        />
      </div>

      <label className="flex items-center justify-between rounded-2xl border border-outline-variant px-4 py-3 cursor-pointer">
        <span>
          <span className="block text-sm font-semibold text-on-surface">Cold storage</span>
          <span className="block text-xs text-on-surface-variant mt-0.5">
            This store has refrigerated/cold-chain capacity
          </span>
        </span>
        <Switch
          checked={coldStorage}
          onCheckedChange={setColdStorage}
          disabled={!storeQuery.data}
        />
      </label>

      <button
        type="button"
        disabled={!storeQuery.data || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full text-sm font-semibold shadow-md shadow-primary/20 disabled:opacity-50"
      >
        {saveMutation.isPending ? "Saving…" : "Save Store Profile"}
      </button>
    </SettingsCard>
  );
}

function AccountCard() {
  const session = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useMutation({
    mutationFn: () => changePasswordApi({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to change password")),
  });

  const mismatch =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  return (
    <SettingsCard title="Account" subtitle={session?.email ?? ""}>
      <div>
        <FieldLabel>Current password</FieldLabel>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <FieldLabel>New password</FieldLabel>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={fieldClass}
        />
        {tooShort && <p className="text-xs text-destructive mt-1">At least 8 characters.</p>}
      </div>
      <div>
        <FieldLabel>Confirm new password</FieldLabel>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={fieldClass}
        />
        {mismatch && <p className="text-xs text-destructive mt-1">Passwords don't match.</p>}
      </div>
      <button
        type="button"
        disabled={!canSubmit || changePassword.isPending}
        onClick={() => changePassword.mutate()}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full text-sm font-semibold shadow-md shadow-primary/20 disabled:opacity-50"
      >
        {changePassword.isPending ? "Updating…" : "Change Password"}
      </button>
    </SettingsCard>
  );
}

const NOTIFICATION_TOGGLES = [
  {
    key: "lowStock",
    label: "Low stock alerts",
    description: "Notify when a SKU drops below its reorder threshold.",
  },
  {
    key: "orderSla",
    label: "Order SLA alerts",
    description: "Notify when an order breaches its acceptance/delivery window.",
  },
  {
    key: "dailySummary",
    label: "Daily summary",
    description: "End-of-day recap of orders and revenue.",
  },
] as const;

function NotificationPreferencesCard() {
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferencesApi,
  });

  const updatePreference = useMutation({
    mutationFn: (patch: Record<string, boolean>) => updateNotificationPreferencesApi(patch),
    onSuccess: (result) => {
      queryClient.setQueryData(["notification-preferences"], result);
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to update preference")),
  });

  const preferences = preferencesQuery.data?.preferences ?? {};

  return (
    <SettingsCard
      title="Notification Preferences"
      subtitle="Choose which alerts you want to receive."
    >
      {preferencesQuery.isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : (
        NOTIFICATION_TOGGLES.map((item) => {
          // Alerts default to on until a preference is explicitly saved.
          const checked = preferences[item.key] ?? true;
          return (
            <label
              key={item.key}
              className="flex items-center justify-between rounded-2xl border border-outline-variant px-4 py-3 cursor-pointer"
            >
              <span>
                <span className="block text-sm font-semibold text-on-surface">{item.label}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5">
                  {item.description}
                </span>
              </span>
              <Switch
                checked={checked}
                disabled={updatePreference.isPending}
                onCheckedChange={(value) => updatePreference.mutate({ [item.key]: value })}
              />
            </label>
          );
        })
      )}
    </SettingsCard>
  );
}
