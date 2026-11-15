import { Heart, Users, Calendar, MessageCircle, HelpCircle, Activity, User, LogOut } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import icon from "@/assets/icon.png";
import { MessageSquare } from "lucide-react";
import { logout } from "@/lib/api";

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Heart },
  { id: 'matching', label: 'Find Peers', icon: Users },
  { id: 'communities', label: 'Communities', icon: MessageCircle },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'activities', label: 'Activities', icon: Calendar },
  { id: 'wellness', label: 'Wellness', icon: Activity },
  { id: 'help', label: 'Support', icon: HelpCircle },
];

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const navigate = useNavigate();
  const items = navigationItems;
  
  const handleLogout = () => {
    // Clear real authentication state, then leave the protected area.
    logout();
    navigate("/");
  };
  
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-primary">
              <img src={icon} alt="Innerbloom Icon" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-xl font-bold text-[#004030] font-roboto">
              InnerBloom
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            {items.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "default" : "ghost"}
                size="sm"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "flex items-center space-x-2 transition-smooth",
                  activeTab === item.id && "shadow-glow"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Button>
            ))}
            {/* Profile section */}
            <button
              className="ml-4 flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary transition-all"
              onClick={() => onTabChange("profile")}
              aria-label="Profile"
            >
              <User className="w-6 h-6 text-primary" />
            </button>
            {/* Logout button */}
            <button
              className="ml-2 flex items-center justify-center w-10 h-10 rounded-full bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
              onClick={handleLogout}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-red-600" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}