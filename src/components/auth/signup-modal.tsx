import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flower, User, Mail, Lock, Phone, Calendar, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { registerUser } from "@/lib/api";
import innerbloomLogo from "@/assets/innerbloom-logo.png";

interface SignupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/\d/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must include at least one letter.";
  }
  return null;
}

export const SignupModal = ({ open, onOpenChange }: SignupModalProps) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    email: "",
    phone: "",
    password: "",
    concerns: "",
    description: "",
    interests: ""
  });
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    const passwordIssue = validatePassword(formData.password);
    setPasswordError(passwordIssue);
    if (passwordIssue) {
      toast.error(passwordIssue);
      return;
    }
    if (formData.name && formData.age && formData.email && formData.password) {
      setStep(2);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Real backend registration — creates the user in PostgreSQL.
      await registerUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        age: formData.age ? Number(formData.age) : undefined,
        phone: formData.phone || undefined,
        concerns: formData.concerns,
        interests: formData.interests,
        description: formData.description,
      });
      setStep(3);
    } catch (err) {
      // Never fake a successful registration: show the real backend error.
      toast.error(err instanceof Error ? err.message : "Registration failed");
    }
    setLoading(false);
  };

  const handleFinish = () => {
    toast.success("Welcome to InnerBloom! Let's start your journey...");
    onOpenChange(false);
    navigate("/dashboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
              <img src={innerbloomLogo} alt="Innerbloom Logo" className="w-6 h-6 object-contain" />
            </div>
          </div>
          <DialogTitle className="text-center text-2xl font-kalam text-[#004030]">
            {step === 1 && "Join InnerBloom"}
            {step === 2 && "Tell Us About Yourself"}
            {step === 3 && "You're Ready to Bloom!"}
          </DialogTitle>
          <p className="text-center text-muted-foreground">
            {step === 1 && "Start your journey of growth and connection"}
            {step === 2 && "Help us understand how we can support you best"}
            {step === 3 && "Your inner self is ready to flourish"}
          </p>
        </DialogHeader>

        <Card className="border-primary/20">
          <CardContent className="p-6">
            {step === 1 && (
              <form onSubmit={handleNext} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="age"
                      type="number"
                      placeholder="Your age"
                      value={formData.age}
                      onChange={(e) => setFormData({...formData, age: e.target.value})}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Create a secure password (min 8 characters, letters + digits)"
                      value={formData.password}
                      onChange={(e) => {
                        const password = e.target.value;
                        setFormData({...formData, password});
                        if (passwordError) {
                          setPasswordError(validatePassword(password));
                        }
                      }}
                      className="pl-10"
                      required
                      minLength={8}
                    />
                  </div>
                  {passwordError && (
                    <p className="text-xs text-destructive">{passwordError}</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-foreground">
                  Continue
                </Button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleComplete} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="concerns">What concerns are you dealing with?</Label>
                  <div className="relative">
                    <Heart className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="concerns"
                      placeholder="e.g., Anxiety, Depression, Stress, Loneliness"
                      value={formData.concerns}
                      onChange={(e) => setFormData({...formData, concerns: e.target.value})}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interests">What are your interests?</Label>
                  <Input
                    id="interests"
                    placeholder="e.g., Music, Art, Sports, Reading"
                    value={formData.interests}
                    onChange={(e) => setFormData({...formData, interests: e.target.value})}
                    className="pl-3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Tell us more about your situation (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Share as much or as little as you're comfortable with. This helps us match you with someone who truly understands..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={4}
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setStep(1)}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-primary hover:bg-primary/90 text-foreground"
                    disabled={loading}
                  >
                    {loading ? "Creating Account..." : "Complete"}
                  </Button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
                  <Flower className="w-10 h-10 text-primary animate-pulse" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">
                    🌸 You're Ready to Bloom Your Inner Self! 🌸
                  </h3>
                  <p className="text-muted-foreground">
                    Your account has been created and you're now part of a supportive community 
                    that understands your journey.
                  </p>
                </div>

                <div className="bg-primary/5 rounded-xl p-4 space-y-2">
                  <p className="text-sm text-foreground font-medium">What happens next:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• AI will analyze your profile for the best matches</li>
                    <li>• You'll see your personalized dashboard</li>
                    <li>• Connect with peers who understand your experience</li>
                    <li>• Access wellness tools and community support</li>
                  </ul>
                </div>

                <Button 
                  onClick={handleFinish}
                  className="w-full bg-primary hover:bg-primary/90 text-foreground text-lg py-3 rounded-full"
                >
                  Enter Your InnerBloom Dashboard ✨
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {step < 3 && (
          <div className="text-center text-sm text-muted-foreground">
            Your information is completely secure and anonymous. 
            <br />
            🔒 HIPAA compliant • End-to-end encrypted
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};