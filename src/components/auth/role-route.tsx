import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cacheCurrentUser, getMe, isLoggedIn, logout } from "@/lib/api";

type Role = "admin" | "user";

interface RoleGateProps {
  allow: Role;
  children: ReactNode;
}

/**
 * Route guard that verifies the role against the backend (not just localStorage).
 * - Normal members are redirected away from /admin.
 * - Admins are redirected away from the member dashboard.
 */
export function RoleGate({ allow, children }: RoleGateProps) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        const role: Role = me.role === "admin" ? "admin" : "user";
        cacheCurrentUser(me);
        if (role !== allow) {
          if (allow === "admin") {
            toast.error("Admin access required");
          }
          navigate(role === "admin" ? "/admin" : "/dashboard", { replace: true });
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        logout();
        navigate("/", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [allow, navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-soft">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
