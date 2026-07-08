import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const session = useSession();
  useEffect(() => {
    if (!session) navigate({ to: "/auth" });
    else navigate({ to: session.role === "admin" ? "/admin" : "/manager" });
  }, [session, navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-surface-variant text-sm">
      Loading…
    </div>
  );
}
