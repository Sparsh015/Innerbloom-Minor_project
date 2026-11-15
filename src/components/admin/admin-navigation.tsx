import { useNavigate } from "react-router-dom";
import { LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { currentUser, logout } from "@/lib/api";
import icon from "@/assets/icon.png";

export function AdminNavigation() {
  const navigate = useNavigate();
  const admin = currentUser();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-primary shrink-0">
              <img src={icon} alt="InnerBloom" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-lg font-bold text-[#004030] font-roboto truncate">
              InnerBloom
            </span>
            <Badge variant="secondary" className="gap-1 shrink-0">
              <ShieldAlert className="w-3 h-3" />
              Admin
            </Badge>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:block text-right min-w-0">
              <p className="text-sm font-medium truncate">{admin?.name ?? "Admin"}</p>
              <p className="text-xs text-muted-foreground truncate">{admin?.email}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" />
              Log out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
