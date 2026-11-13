/**
 * InnerBloom Admin Dashboard
 * Comprehensive admin panel with overview, community management,
 * member profiles, activity feed, and AI-assisted behavioural insights.
 *
 * Scope: Admin only. No facial recognition, no private journals/messages.
 * Mood/wellness data is self-reported and shown only where consent applies.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ShieldAlert, Users, MessageSquare, BarChart3, Activity,
  Eye, Trash2, ChevronRight, Search, Filter, TrendingUp,
  TrendingDown, Minus, AlertCircle, CheckCircle, Clock,
  UserCheck, ArrowLeft, RefreshCw, Flag, Settings,
  Info, FileText, Globe, Video, PhoneOff, PhoneMissed, PhoneCall
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import {
  adminStats, adminListUsers, adminReports, adminUpdateReport,
  adminCommunityMembers, adminCommunityPosts, adminDeletePost,
  adminDeleteCommunity, adminCreateCommunity, adminActivityFeed,
  adminMemberProfile, adminMemberInsights, adminCommunityInsights,
  adminCallHistory, initiateCall, updateCallStatus,
  listCommunities,
  type AdminStats, type AdminUser, type Community, type AdminPost,
  type AdminCommunityMember, type ActivityFeedItem,
  type MemberInsight, type CommunityInsight, type AdminMemberProfile,
  type VideoCall,
} from "@/lib/api";
import { VideoCallModal } from "@/components/calls/VideoCallModal";

// ─── colour helpers ────────────────────────────────────────────────────────

const TREND_CONFIG = {
  improving:         { label: "Improving",         icon: TrendingUp,   color: "text-green-600",  bg: "bg-green-50 dark:bg-green-950",  badge: "default" as const },
  stable:            { label: "Stable",             icon: Minus,        color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950",    badge: "secondary" as const },
  declining:         { label: "Declining",          icon: TrendingDown, color: "text-red-600",    bg: "bg-red-50 dark:bg-red-950",      badge: "destructive" as const },
  insufficient_data: { label: "Insufficient Data",  icon: Info,         color: "text-gray-500",   bg: "bg-gray-50 dark:bg-gray-900",    badge: "outline" as const },
};

const REPORT_LEVEL_COLOR: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  registration: UserCheck,
  post: MessageSquare,
  connection: Users,
  report: Flag,
  moderation: ShieldAlert,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function initials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── stat card ────────────────────────────────────────────────────────────

function StatCard({ title, value, icon: Icon, gradient, sub }: {
  title: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  gradient: string; sub?: string;
}) {
  return (
    <Card className="shadow-soft hover:shadow-glow transition-smooth">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${gradient}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────

function OverviewTab({ stats, communities, loading }: {
  stats: AdminStats | null;
  communities: Community[];
  loading: boolean;
}) {
  const communityEngagement = communities.map(c => ({
    name: c.name.length > 12 ? c.name.slice(0, 12) + "…" : c.name,
    members: c.member_count,
  }));

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total Members" value={stats?.total_users ?? "…"} icon={Users}
          gradient="bg-gradient-wellness" sub="Registered accounts" />
        <StatCard title="Active Members" value={stats?.active_users ?? "…"} icon={Activity}
          gradient="bg-gradient-soft" sub="With recorded activity" />
        <StatCard title="Communities" value={stats?.total_communities ?? "…"} icon={Globe}
          gradient="bg-accent" sub="Total communities" />
        <StatCard title="Total Posts" value={stats?.total_posts ?? "…"} icon={MessageSquare}
          gradient="bg-gradient-wellness" sub="Community discussions" />
        <StatCard title="Interactions" value={stats?.total_interactions ?? "…"} icon={Users}
          gradient="bg-gradient-soft" sub="Connections & messages" />
        <StatCard title="Pending Reports" value={stats?.pending_reports ?? "…"} icon={ShieldAlert}
          gradient={stats?.pending_reports ? "bg-red-500" : "bg-green-500"}
          sub="Awaiting review" />
      </div>

      {/* Community engagement chart */}
      {communityEngagement.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Community Membership Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={communityEngagement} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="members" radius={[4, 4, 0, 0]}>
                  {communityEngagement.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--accent))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Activity ratio */}
      {stats && (
        <Card className="shadow-soft">
          <CardHeader><CardTitle className="text-base">Platform Health</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Active member ratio</span>
                <span>{stats.total_users > 0 ? Math.round((stats.active_users / stats.total_users) * 100) : 0}%</span>
              </div>
              <Progress value={stats.total_users > 0 ? (stats.active_users / stats.total_users) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Posts per community</span>
                <span>{stats.total_communities > 0 ? (stats.total_posts / stats.total_communities).toFixed(1) : 0}</span>
              </div>
              <Progress value={Math.min(100, (stats.total_posts / Math.max(1, stats.total_communities)) * 10)} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Open reports</span>
                <span className={stats.pending_reports > 5 ? "text-red-600 font-medium" : ""}>{stats.pending_reports}</span>
              </div>
              <Progress value={Math.min(100, stats.pending_reports * 10)} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── COMMUNITY MANAGEMENT TAB ─────────────────────────────────────────────

function CommunityTab({
  communities, onSelectCommunity, onDeleteCommunity, onCreateCommunity, loading
}: {
  communities: Community[];
  onSelectCommunity: (c: Community) => void;
  onDeleteCommunity: (c: Community) => void;
  onCreateCommunity: () => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = communities.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search communities…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={onCreateCommunity} size="sm">+ New Community</Button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid gap-3">
          {filtered.map(c => (
            <Card key={c.id} className="shadow-soft hover:shadow-glow transition-smooth cursor-pointer"
              onClick={() => onSelectCommunity(c)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-wellness flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.category} • {c.member_count} members</p>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">{c.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onSelectCommunity(c); }}>
                      <Eye className="w-3 h-3 mr-1" /> Manage
                    </Button>
                    <Button size="sm" variant="destructive" onClick={e => { e.stopPropagation(); onDeleteCommunity(c); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No communities found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── COMMUNITY DETAIL ─────────────────────────────────────────────────────

function CommunityDetail({
  community, onBack, onDeletePost
}: {
  community: Community;
  onBack: () => void;
  onDeletePost: (communityId: string, postId: string) => void;
}) {
  const [members, setMembers] = useState<AdminCommunityMember[]>([]);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [tab, setTab] = useState<"members" | "posts">("members");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminCommunityMembers(community.id),
      adminCommunityPosts(community.id),
    ]).then(([m, p]) => { setMembers(m); setPosts(p); }).finally(() => setLoading(false));
  }, [community.id]);

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPosts = posts.filter(p =>
    p.content.toLowerCase().includes(search.toLowerCase()) ||
    p.author_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h3 className="font-semibold">{community.name}</h3>
          <p className="text-xs text-muted-foreground">{community.category} • {community.member_count} members</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button variant={tab === "members" ? "default" : "outline"} size="sm"
          onClick={() => setTab("members")}>
          <Users className="w-3 h-3 mr-1" /> Members ({members.length})
        </Button>
        <Button variant={tab === "posts" ? "default" : "outline"} size="sm"
          onClick={() => setTab("posts")}>
          <MessageSquare className="w-3 h-3 mr-1" /> Posts ({posts.length})
        </Button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {tab === "members" && (
            <div className="space-y-2">
              {filteredMembers.map(m => (
                <div key={m.user_id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-wellness flex items-center justify-center text-white text-xs font-bold">
                      {initials(m.name)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{timeAgo(m.joined_at)}</span>
                </div>
              ))}
              {filteredMembers.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No members found.</p>}
            </div>
          )}
          {tab === "posts" && (
            <div className="space-y-2">
              {filteredPosts.map(p => (
                <div key={p.id} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{p.author_name}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(p.created_at)}</span>
                      </div>
                      <p className="text-sm text-foreground/80 break-words">{p.content}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => onDeletePost(community.id, p.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredPosts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No posts found.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── MEMBERS TAB ──────────────────────────────────────────────────────────

function MembersTab({ users, onSelectUser, loading }: {
  users: AdminUser[];
  onSelectUser: (u: AdminUser) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search members by name or email…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/10 transition-colors cursor-pointer"
              onClick={() => onSelectUser(u)}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-wellness flex items-center justify-center text-white text-sm font-bold">
                  {initials(u.name)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{u.name}</p>
                    {u.role === "admin" && (
                      <Badge variant="secondary" className="text-xs py-0">Admin</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:block">{timeAgo(u.created_at)}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No members found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MEMBER PROFILE DETAIL ────────────────────────────────────────────────

function MemberProfileDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<AdminMemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<VideoCall | null>(null);
  const [callLoading, setCallLoading] = useState(false);
  const [callHistory, setCallHistoryState] = useState<VideoCall[]>([]);

  useEffect(() => {
    adminMemberProfile(userId)
      .then(setProfile)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    adminCallHistory(20)
      .then(calls => setCallHistoryState(calls.filter(c => c.callee_id === userId)))
      .catch(() => { /* non-critical */ });
  }, [userId]);

  const handleStartCall = async () => {
    if (!profile) return;
    setCallLoading(true);
    try {
      const call = await initiateCall(userId);
      if (call.status === "missed") {
        toast.info(`${profile.name} is offline. A missed call notification has been sent.`);
      } else {
        setActiveCall(call);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to initiate call");
    } finally {
      setCallLoading(false);
    }
  };

  const callStatusIcon = (status: string) => {
    if (status === "accepted" || status === "ended") return <PhoneCall className="w-3 h-3 text-green-500" />;
    if (status === "declined") return <PhoneOff className="w-3 h-3 text-red-500" />;
    if (status === "missed") return <PhoneMissed className="w-3 h-3 text-orange-500" />;
    return <Video className="w-3 h-3 text-muted-foreground" />;
  };

  if (loading) return <div className="space-y-4"><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button><LoadingSpinner /></div>;
  if (error || !profile) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
      <p className="text-sm text-red-600">{error ?? "Failed to load profile"}</p>
    </div>
  );

  const moodChartData = [...profile.recent_moods].reverse().map((m, i) => ({
    day: i + 1,
    energy: m.energy_level ?? 0,
    mood: m.mood,
  }));

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back to Members</Button>

      {/* Video call modal */}
      {activeCall && (
        <VideoCallModal
          call={activeCall}
          role="caller"
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* Header */}
      <Card className="shadow-soft">
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-wellness flex items-center justify-center text-white text-2xl font-bold shrink-0">
              {initials(profile.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold">{profile.name}</h3>
                {profile.role === "admin" && <Badge variant="secondary">Admin</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              {profile.location && <p className="text-xs text-muted-foreground mt-0.5">📍 {profile.location}</p>}
              {profile.bio && <p className="text-sm mt-2 text-foreground/80">{profile.bio}</p>}

              {/* Start Video Call button */}
              {profile.role !== "admin" && (
                <Button
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={handleStartCall}
                  disabled={callLoading}
                >
                  <Video className="w-4 h-4" />
                  {callLoading ? "Connecting…" : "Start Video Call"}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Posts", value: profile.total_posts },
              { label: "Mood Entries", value: profile.total_mood_entries },
              { label: "Activities", value: profile.total_activities },
              { label: "Reports Filed", value: profile.moderation_reports },
            ].map(s => (
              <div key={s.label} className="text-center p-2 rounded-lg bg-muted/40">
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Communities */}
      {profile.communities.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Communities</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.communities.map(c => (
                <Badge key={c} variant="outline">{c}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mood trend chart */}
      {moodChartData.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Self-Reported Mood & Energy (last {moodChartData.length} entries)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Data shown is self-reported by the member. No inference made beyond what is recorded.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={moodChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} label={{ value: "Entry #", position: "insideRight", offset: 10, fontSize: 10 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [v, name === "energy" ? "Energy" : name]} />
                <Line type="monotone" dataKey="energy" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent posts */}
      {profile.recent_posts.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Recent Posts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {profile.recent_posts.map(p => (
              <div key={p.id} className="p-2 rounded border text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground/70">{p.community_name}</span>
                  <span>•</span>
                  <span>{timeAgo(p.created_at)}</span>
                </div>
                <p className="text-foreground/80">{p.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Call history with this member */}
      {callHistory.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Video className="w-4 h-4 text-primary" />Call History</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {callHistory.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded border text-sm">
                <div className="flex items-center gap-2">
                  {callStatusIcon(c.status)}
                  <span className="capitalize font-medium">{c.status}</span>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(c.started_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 text-xs">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Private journals and direct messages are not accessible from the admin view. Only public community posts and self-reported wellness data (with consent) are shown.</p>
      </div>
    </div>
  );
}

// ─── ACTIVITY FEED TAB ───────────────────────────────────────────────────

function ActivityFeedTab({ loading: initLoading }: { loading: boolean }) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(initLoading);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    adminActivityFeed(100).then(setItems).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(item => {
    const matchSearch =
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.actor_name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || item.event_type === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search activity…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", "registration", "post", "connection", "report"].map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)} className="capitalize text-xs">
              {f}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {filtered.map(item => {
            const Icon = EVENT_ICON[item.event_type] ?? Activity;
            return (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <div className={`p-1.5 rounded-full shrink-0 mt-0.5 ${
                  item.event_type === "report" ? "bg-red-100 dark:bg-red-900 text-red-600" :
                  item.event_type === "registration" ? "bg-green-100 dark:bg-green-900 text-green-600" :
                  "bg-primary/10 text-primary"
                }`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.description}</p>
                  {item.community_name && (
                    <p className="text-xs text-muted-foreground">{item.community_name}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{timeAgo(item.created_at)}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No activity found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── REPORTS TAB ─────────────────────────────────────────────────────────

function ReportsTab() {
  const [reports, setReports] = useState<{ id: string; concern_level: string; description: string; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    adminReports().then(setReports).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id: string, status: string) => {
    try {
      await adminUpdateReport(id, status);
      toast.success("Report status updated.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update report");
    }
  };

  const filtered = reports.filter(r => filter === "all" || r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {["all", "open", "reviewed", "resolved"].map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)} className="capitalize text-xs">
            {f}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3 h-3" /></Button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {filtered.map(r => (
            <Card key={r.id} className="shadow-soft">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${REPORT_LEVEL_COLOR[r.concern_level] ?? ""}`}>
                      {r.concern_level}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      r.status === "open" ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" :
                      r.status === "reviewed" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    }`}>{r.status}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.created_at)}</span>
                </div>
                <p className="text-sm">{r.description}</p>
                <div className="flex gap-2">
                  {(["open", "reviewed", "resolved"] as const).map(s => (
                    <Button key={s} size="sm"
                      variant={r.status === s ? "default" : "outline"}
                      className="capitalize text-xs"
                      onClick={() => handleStatus(r.id, s)}>
                      {s === "open" && <AlertCircle className="w-3 h-3 mr-1" />}
                      {s === "reviewed" && <Clock className="w-3 h-3 mr-1" />}
                      {s === "resolved" && <CheckCircle className="w-3 h-3 mr-1" />}
                      {s}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No reports found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI INSIGHTS TAB ─────────────────────────────────────────────────────

function InsightsTab() {
  const [memberInsights, setMemberInsights] = useState<MemberInsight[]>([]);
  const [communityInsights, setCommunityInsights] = useState<CommunityInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"members" | "communities">("members");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([adminMemberInsights(), adminCommunityInsights()])
      .then(([m, c]) => { setMemberInsights(m); setCommunityInsights(c); })
      .finally(() => setLoading(false));
  }, []);

  const trendCounts = memberInsights.reduce((acc, m) => {
    acc[m.mood_trend] = (acc[m.mood_trend] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredMembers = memberInsights.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredCommunities = communityInsights.filter(c =>
    c.community_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-xs">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          <strong>AI Insights are statistical, not diagnostic.</strong>{" "}
          Trends are derived from self-reported mood and energy data only.
          No psychological conclusions are drawn. No facial or message data is used.
          Insights require a minimum of 4 data points to generate a trend.
        </p>
      </div>

      {/* Summary cards */}
      {!loading && view === "members" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(TREND_CONFIG) as [keyof typeof TREND_CONFIG, typeof TREND_CONFIG[keyof typeof TREND_CONFIG]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <div key={key} className={`p-3 rounded-lg ${cfg.bg} flex items-center gap-2`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <div>
                  <p className="text-sm font-semibold">{trendCounts[key] ?? 0}</p>
                  <p className={`text-xs ${cfg.color}`}>{cfg.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        <Button variant={view === "members" ? "default" : "outline"} size="sm"
          onClick={() => setView("members")}>
          <Users className="w-3 h-3 mr-1" /> Member Insights
        </Button>
        <Button variant={view === "communities" ? "default" : "outline"} size="sm"
          onClick={() => setView("communities")}>
          <Globe className="w-3 h-3 mr-1" /> Community Insights
        </Button>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 w-48" placeholder="Search…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {view === "members" && (
            <div className="space-y-2">
              {filteredMembers.map(insight => {
                const cfg = TREND_CONFIG[insight.mood_trend] ?? TREND_CONFIG.insufficient_data;
                const Icon = cfg.icon;
                return (
                  <Card key={insight.user_id} className={`shadow-soft ${cfg.bg}`}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-wellness flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {initials(insight.name)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{insight.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Icon className={`w-3 h-3 ${cfg.color}`} />
                              <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                              {insight.avg_energy !== null && insight.avg_energy !== undefined && (
                                <span className="text-xs text-muted-foreground">• avg energy: {insight.avg_energy.toFixed(1)}/10</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{insight.data_points} data pts</p>
                          {insight.last_active && (
                            <p className="text-xs text-muted-foreground">Last: {timeAgo(insight.last_active)}</p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-foreground/70">{insight.explanation}</p>
                      {insight.suggested_action && (
                        <div className="flex items-start gap-1.5 text-xs font-medium">
                          <FileText className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                          <span>{insight.suggested_action}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {filteredMembers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No insights available.</p>}
            </div>
          )}

          {view === "communities" && (
            <div className="space-y-2">
              {filteredCommunities.map(c => {
                const isIncreasing = c.engagement_trend === "increasing";
                const isDecreasing = c.engagement_trend === "decreasing";
                return (
                  <Card key={c.community_id} className={`shadow-soft ${c.needs_attention ? "border-orange-300 dark:border-orange-700" : ""}`}>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{c.community_name}</p>
                            {c.needs_attention && (
                              <Badge variant="destructive" className="text-xs py-0">Needs Attention</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{c.member_count} members</p>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-medium ${
                          isIncreasing ? "text-green-600" : isDecreasing ? "text-red-600" : "text-blue-600"
                        }`}>
                          {isIncreasing ? <TrendingUp className="w-3 h-3" /> :
                           isDecreasing ? <TrendingDown className="w-3 h-3" /> :
                           <Minus className="w-3 h-3" />}
                          <span className="capitalize">{c.engagement_trend.replace("_", " ")}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-muted/40 rounded p-2">
                          <p className="font-semibold">{c.post_count_7d}</p>
                          <p className="text-muted-foreground">Posts (7d)</p>
                        </div>
                        <div className="bg-muted/40 rounded p-2">
                          <p className="font-semibold">{c.post_count_prev_7d}</p>
                          <p className="text-muted-foreground">Posts (prior 7d)</p>
                        </div>
                        <div className={`rounded p-2 ${c.pending_reports > 0 ? "bg-red-50 dark:bg-red-950" : "bg-muted/40"}`}>
                          <p className={`font-semibold ${c.pending_reports > 0 ? "text-red-600" : ""}`}>{c.pending_reports}</p>
                          <p className="text-muted-foreground">Open Reports</p>
                        </div>
                      </div>

                      <p className="text-xs text-foreground/70">{c.explanation}</p>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredCommunities.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No community insights available.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── LOADING SPINNER ─────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── CREATE COMMUNITY MODAL ──────────────────────────────────────────────

function CreateCommunityForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("health");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Community name is required."); return; }
    setLoading(true);
    try {
      await adminCreateCommunity({ name, description, category });
      toast.success("Community created.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create community");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader><CardTitle className="text-base">Create Community</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium">Name *</label>
          <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="Community name" />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <Input className="mt-1" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" />
        </div>
        <div>
          <label className="text-sm font-medium">Category</label>
          <select className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
            value={category} onChange={e => setCategory(e.target.value)}>
            {["health", "anxiety", "depression", "stress", "relationships", "general"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={submit} disabled={loading} size="sm">
            {loading ? "Creating…" : "Create"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── MAIN ADMIN PANEL ────────────────────────────────────────────────────

export function AdminPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // navigation state
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u, c] = await Promise.all([
        adminStats(),
        adminListUsers(),
        listCommunities(),
      ]);
      setStats(s);
      setUsers(u);
      setCommunities(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteCommunity = async (c: Community) => {
    if (!window.confirm(`Delete community "${c.name}"? This action cannot be undone.`)) return;
    try {
      await adminDeleteCommunity(c.id);
      toast.success("Community deleted.");
      setSelectedCommunity(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete community");
    }
  };

  const handleDeletePost = async (communityId: string, postId: string) => {
    if (!window.confirm("Remove this post?")) return;
    try {
      await adminDeletePost(communityId, postId);
      toast.success("Post removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove post");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            Admin Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">Monitor communities, members, and platform health</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={v => {
        setActiveTab(v);
        setSelectedCommunity(null);
        setSelectedUser(null);
        setShowCreateCommunity(false);
      }}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1 rounded-lg">
          <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm">
            <BarChart3 className="w-3 h-3" /> Overview
          </TabsTrigger>
          <TabsTrigger value="communities" className="gap-1 text-xs sm:text-sm">
            <Globe className="w-3 h-3" /> Communities
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1 text-xs sm:text-sm">
            <Users className="w-3 h-3" /> Members
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1 text-xs sm:text-sm">
            <Activity className="w-3 h-3" /> Activity
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1 text-xs sm:text-sm">
            <Flag className="w-3 h-3" />
            Reports
            {stats?.pending_reports ? (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {stats.pending_reports > 9 ? "9+" : stats.pending_reports}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1 text-xs sm:text-sm">
            <TrendingUp className="w-3 h-3" /> AI Insights
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-5">
          <OverviewTab stats={stats} communities={communities} loading={loading} />
        </TabsContent>

        {/* ── Communities ── */}
        <TabsContent value="communities" className="mt-5">
          {selectedCommunity ? (
            <CommunityDetail
              community={selectedCommunity}
              onBack={() => setSelectedCommunity(null)}
              onDeletePost={handleDeletePost}
            />
          ) : showCreateCommunity ? (
            <CreateCommunityForm
              onDone={() => { setShowCreateCommunity(false); load(); }}
              onCancel={() => setShowCreateCommunity(false)}
            />
          ) : (
            <CommunityTab
              communities={communities}
              onSelectCommunity={setSelectedCommunity}
              onDeleteCommunity={handleDeleteCommunity}
              onCreateCommunity={() => setShowCreateCommunity(true)}
              loading={loading}
            />
          )}
        </TabsContent>

        {/* ── Members ── */}
        <TabsContent value="members" className="mt-5">
          {selectedUser ? (
            <MemberProfileDetail userId={selectedUser.id} onBack={() => setSelectedUser(null)} />
          ) : (
            <MembersTab users={users} onSelectUser={setSelectedUser} loading={loading} />
          )}
        </TabsContent>

        {/* ── Activity Feed ── */}
        <TabsContent value="activity" className="mt-5">
          <ActivityFeedTab loading={loading} />
        </TabsContent>

        {/* ── Reports ── */}
        <TabsContent value="reports" className="mt-5">
          <ReportsTab />
        </TabsContent>

        {/* ── AI Insights ── */}
        <TabsContent value="insights" className="mt-5">
          <InsightsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
