import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Flower, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import innerbloomLogo from "@/assets/innerbloom-logo.png";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

import { loginUser } from "@/lib/api";

export const LoginModal = ({ open, onOpenChange }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Real backend authentication — JWT is stored only on success.
      const auth = await loginUser(email, password);
      const isAdmin = auth.user.role === "admin";
      toast.success(
        isAdmin
          ? "Welcome back! Redirecting to the admin dashboard..."
          : "Welcome back! Redirecting to your dashboard...",
      );
      setLoading(false);
      onOpenChange(false);
      navigate(isAdmin ? "/admin" : "/dashboard");
    } catch (err) {
      // Never fake a successful login: stay here and show the real error.
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "Invalid email or password");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
              <img src={innerbloomLogo} alt="Innerbloom Logo" className="w-6 h-6 object-contain" />
            </div>
          </div>
          <DialogTitle className="text-center text-2xl font-kalam text-[#004030]">
            Welcome Back to InnerBloom
          </DialogTitle>
          <p className="text-center text-muted-foreground">
            Continue your journey of growth and connection
          </p>
        </DialogHeader>

        <Card className="border-primary/20">
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-foreground"
                disabled={loading}
              >
                {loading ? "Signing In..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Button variant="link" className="text-sm text-muted-foreground hover:text-primary">
                Forgot your password?
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          Your mental health journey is safe with us. 
          <br />
          🔒 All data is encrypted and HIPAA compliant.
        </div>
      </DialogContent>
    </Dialog>
  );
};