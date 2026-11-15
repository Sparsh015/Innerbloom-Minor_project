import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bug,
  CalendarPlus,
  CheckCircle2,
  Clock,
  HeartHandshake,
  LifeBuoy,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WellnessChatCard } from "@/components/wellness/WellnessChatCard";
import { myReports, submitReport, type SupportRequest } from "@/lib/api";
import { toast } from "sonner";

const emergencyContacts = [
  { name: "Tele-MANAS", contact: "14416", description: "24/7 mental health support (India)" },
  { name: "KIRAN", contact: "1800-599-0019", description: "24/7 toll-free helpline (India)" },
  { name: "Emergency", contact: "112", description: "Immediate danger or medical emergency" },
];

const supportCategories = ["General", "Emotional", "Relationship", "Academic", "Other"];
const activityCategories = ["Games", "Wellness", "Creative", "Social", "Other"];
const technicalCategories = ["Login", "Account", "Chat", "Video call", "Notifications", "Other"];

const typeLabels: Record<SupportRequest["request_type"], string> = {
  support: "Support",
  activity: "Activity",
  technical: "Technical",
};

const statusLabels: Record<SupportRequest["status"], string> = {
  open: "Pending",
  reviewed: "In Progress",
  resolved: "Resolved",
};

const statusClasses: Record<SupportRequest["status"], string> = {
  open: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const typeClasses: Record<SupportRequest["request_type"], string> = {
  support: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  activity: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  technical: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

type FormKind = "support" | "activity" | "technical";

const emptyForms = {
  support: { level: "medium", category: "General", text: "" },
  activity: { title: "", category: "Wellness", date: "", time: "", duration: "", location: "", text: "" },
  technical: { title: "", category: "Other", text: "" },
};

export function HelpSection() {
  const [open, setOpen] = useState<FormKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forms, setForms] = useState(emptyForms);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const loadRequests = useCallback(() => {
    setLoadingRequests(true);
    myReports()
      .then(setRequests)
      .catch(() => undefined)
      .finally(() => setLoadingRequests(false));
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleSubmit = async (kind: FormKind) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (kind === "support") {
        const f = forms.support;
        if (!f.text.trim()) throw new Error("Please describe what you need support with.");
        await submitReport({
          request_type: "support",
          concern_level: f.level as SupportRequest["concern_level"],
          category: f.category,
          description: f.text.trim(),
        });
      } else if (kind === "activity") {
        const f = forms.activity;
        if (!f.title.trim() || !f.date || !f.text.trim()) {
          throw new Error("Please add a title, preferred date and description.");
        }
        await submitReport({
          request_type: "activity",
          category: f.category,
          title: f.title.trim(),
          preferred_date: f.date,
          preferred_time: f.time,
          duration_minutes: f.duration ? Number(f.duration) : null,
          location_pref: f.location.trim(),
          description: f.text.trim(),
        });
      } else {
        const f = forms.technical;
        if (!f.title.trim() || !f.text.trim()) {
          throw new Error("Please add a short title and describe the problem.");
        }
        await submitReport({
          request_type: "technical",
          category: f.category,
          title: f.title.trim(),
          description: f.text.trim(),
        });
      }
      toast.success("Your request has been sent. Our team will review it.");
      setForms(emptyForms);
      setOpen(null);
      loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to submit your request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Support Centre</h2>
        <p className="text-muted-foreground">
          Reach out for support, request an activity, talk to our wellness assistant, or report a
          technical problem.
        </p>
      </div>

      <Card className="border-destructive/20 shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Need urgent help?
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {emergencyContacts.map((c) => (
            <div key={c.name} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm font-medium flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {c.name}
              </p>
              <a href={`tel:${c.contact}`} className="text-lg font-bold text-destructive">
                {c.contact}
              </a>
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-primary" />
              Request Support
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share what you're going through and our team will follow up. This is a confidential
              support request, not a medical diagnosis.
            </p>
            <Button className="w-full" onClick={() => setOpen("support")}>
              <LifeBuoy className="w-4 h-4 mr-2" />
              Send a Support Request
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-primary" />
              Request an Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask for a peer activity such as a games session, wellness workshop or creative
              meet-up. Tell us your preferred date and time.
            </p>
            <Button className="w-full" onClick={() => setOpen("activity")}>
              <CalendarPlus className="w-4 h-4 mr-2" />
              Request an Activity
            </Button>
          </CardContent>
        </Card>

        <WellnessChatCard />

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              Report a Technical Problem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Something not working? Let us know and our team will look into it.
            </p>
            <Button className="w-full" onClick={() => setOpen("technical")}>
              <Bug className="w-4 h-4 mr-2" />
              Report a Problem
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            My Requests
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={loadRequests} disabled={loadingRequests}>
            <RefreshCw className={`w-4 h-4 ${loadingRequests ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingRequests ? (
            <p className="text-sm text-muted-foreground">Loading your requests…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven't submitted any requests yet. Your submissions and team replies will appear
              here.
            </p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeClasses[r.request_type]}`}>
                    {typeLabels[r.request_type]}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClasses[r.status]}`}>
                    {statusLabels[r.status]}
                  </span>
                  {r.category && (
                    <span className="text-xs text-muted-foreground capitalize">{r.category}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {dayjs(r.created_at).format("DD MMM YYYY, HH:mm")}
                  </span>
                </div>
                <p className="text-sm font-medium">{r.title || "Support request"}</p>
                <p className="text-sm text-muted-foreground">{r.description}</p>
                {r.request_type === "activity" && (r.preferred_date || r.preferred_time) && (
                  <p className="text-xs text-muted-foreground">
                    Preferred: {r.preferred_date || "any day"} {r.preferred_time || ""}
                    {r.duration_minutes ? ` · ${r.duration_minutes} min` : ""}
                    {r.location_pref ? ` · ${r.location_pref}` : ""}
                  </p>
                )}
                {r.admin_response && (
                  <div className="rounded-md bg-primary/5 p-2 text-sm">
                    <p className="flex items-center gap-1 text-xs font-medium text-primary mb-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Reply from our team
                    </p>
                    {r.admin_response}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {open === "support" && <HeartHandshake className="w-5 h-5" />}
              {open === "activity" && <CalendarPlus className="w-5 h-5" />}
              {open === "technical" && <Bug className="w-5 h-5" />}
              {open === "support" && "Request Support"}
              {open === "activity" && "Request an Activity"}
              {open === "technical" && "Report a Technical Problem"}
            </DialogTitle>
          </DialogHeader>

          {open === "support" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit("support");
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="support-level">Urgency</Label>
                  <select
                    id="support-level"
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={forms.support.level}
                    onChange={(e) =>
                      setForms((f) => ({ ...f, support: { ...f.support, level: e.target.value } }))
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="support-category">Topic</Label>
                  <select
                    id="support-category"
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={forms.support.category}
                    onChange={(e) =>
                      setForms((f) => ({ ...f, support: { ...f.support, category: e.target.value } }))
                    }
                  >
                    {supportCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="support-text">What do you need support with?</Label>
                <Textarea
                  id="support-text"
                  placeholder="Describe what you're going through…"
                  value={forms.support.text}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, support: { ...f.support, text: e.target.value } }))
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send Support Request"}
              </Button>
            </form>
          )}

          {open === "activity" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit("activity");
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="activity-title">Activity</Label>
                <Input
                  id="activity-title"
                  placeholder="e.g. Evening yoga session"
                  value={forms.activity.title}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, activity: { ...f.activity, title: e.target.value } }))
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="activity-category">Type</Label>
                  <select
                    id="activity-category"
                    className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                    value={forms.activity.category}
                    onChange={(e) =>
                      setForms((f) => ({
                        ...f,
                        activity: { ...f.activity, category: e.target.value },
                      }))
                    }
                  >
                    {activityCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="activity-duration">Duration (minutes)</Label>
                  <Input
                    id="activity-duration"
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    placeholder="60"
                    value={forms.activity.duration}
                    onChange={(e) =>
                      setForms((f) => ({
                        ...f,
                        activity: { ...f.activity, duration: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="activity-date">Preferred date</Label>
                  <Input
                    id="activity-date"
                    type="date"
                    value={forms.activity.date}
                    onChange={(e) =>
                      setForms((f) => ({ ...f, activity: { ...f.activity, date: e.target.value } }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="activity-time">Preferred time</Label>
                  <Input
                    id="activity-time"
                    type="time"
                    value={forms.activity.time}
                    onChange={(e) =>
                      setForms((f) => ({ ...f, activity: { ...f.activity, time: e.target.value } }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="activity-location">Location preference</Label>
                <Input
                  id="activity-location"
                  placeholder="Online, or a place in your city"
                  value={forms.activity.location}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      activity: { ...f.activity, location: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="activity-text">Details</Label>
                <Textarea
                  id="activity-text"
                  placeholder="Tell us what you'd like to do and anything we should know…"
                  value={forms.activity.text}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, activity: { ...f.activity, text: e.target.value } }))
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send Activity Request"}
              </Button>
            </form>
          )}

          {open === "technical" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit("technical");
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="tech-title">Summary</Label>
                <Input
                  id="tech-title"
                  placeholder="e.g. Chat messages won't load"
                  value={forms.technical.title}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      technical: { ...f.technical, title: e.target.value },
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tech-category">Area</Label>
                <select
                  id="tech-category"
                  className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                  value={forms.technical.category}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      technical: { ...f.technical, category: e.target.value },
                    }))
                  }
                >
                  {technicalCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tech-text">What happened?</Label>
                <Textarea
                  id="tech-text"
                  placeholder="Describe the problem, what you expected, and any steps to reproduce it…"
                  value={forms.technical.text}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, technical: { ...f.technical, text: e.target.value } }))
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Submit Technical Report"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Other ways to connect
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use <span className="font-medium text-foreground">Find Peers</span> to connect with
          trained peer supporters, or <span className="font-medium text-foreground">Communities</span>{" "}
          to join moderated support groups.
        </CardContent>
      </Card>
    </div>
  );
}
