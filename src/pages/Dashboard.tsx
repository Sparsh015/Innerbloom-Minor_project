import { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  createActivity,
  currentUser,
  getConversation,
  getMe,
  isLoggedIn,
  listActivities,
  listConversations,
  sendMessage,
  updateMe,
  type ActivityEntry,
  type Conversation,
  type Message,
} from "@/lib/api";
import { Navigation } from "@/components/ui/navigation";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { SocialFeed } from "@/components/dashboard/social-feed";
import { PeerMatching } from "@/components/matching/peer-matching";
import { CommunitiesSection } from "@/components/communities/communities-section";
import { AdminPanel } from "@/components/admin/admin-panel";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { IncomingCallListener } from "@/components/calls/IncomingCallListener";
import { HelpSection } from "@/components/support/help-section";
import { WellnessPage } from "@/components/wellness/wellness-page";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Smile, Calendar, Clock } from "lucide-react";
import AvatarCustomization from "@/components/avatar-customization";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import chooseYourAvatarRiv from "../assets/choose_your_avatar.riv";

function ProfilePage() {
  const lottieRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [interests, setInterests] = useState("");
  const [concerns, setConcerns] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  // Real profile from PostgreSQL.
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        setName(me.name);
        setEmail(me.email);
        setPhone(me.phone ?? "");
        setInterests(me.profile.interests);
        setConcerns(me.profile.concerns);
        setBio(me.profile.bio);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Unable to load profile");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const me = await updateMe({
        name,
        phone,
        interests,
        concerns,
        bio,
      });
      setName(me.name);
      setPhone(me.phone ?? "");
      setInterests(me.profile.interests);
      setConcerns(me.profile.concerns);
      setBio(me.profile.bio);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save profile");
    }
    setSaving(false);
  };

  useEffect(() => {
    if (lottieRef.current) {
      // Inject the script tag only once
      if (!document.querySelector('script[src*="dotlottie-wc"]')) {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://unpkg.com/@lottiefiles/dotlottie-wc@0.6.2/dist/dotlottie-wc.js';
        document.body.appendChild(script);
      }
      // Inject the dotlottie-wc element
      lottieRef.current.innerHTML = '';
      const lottie = document.createElement('dotlottie-wc');
      lottie.setAttribute('src', 'https://lottie.host/f96587cb-b1b3-4eed-82a4-366153612d0f/r64Iz3n8Df.lottie');
      lottie.setAttribute('style', 'width: 300px; height: 300px;');
      lottie.setAttribute('speed', '1');
      lottie.setAttribute('autoplay', '');
      lottie.setAttribute('loop', '');
      lottieRef.current.appendChild(lottie);
    }
  }, []);

  return (
    <div className="max-w-xl mx-auto mt-12 p-6 bg-white rounded-xl shadow-soft">
      <div className="flex flex-col items-center mb-4">
        <AvatarCustomization />
      </div>
      <h2 className="text-2xl font-bold mb-6 text-primary">Profile</h2>
      <div className="mb-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
          {name ? name[0] : "U"}
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">Theme:</span>
            <button
              className={`px-3 py-1 rounded-full border ${isDark ? 'bg-primary text-white' : 'bg-white text-primary'} transition`}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </div>
      {/* Profile fields */}
      {loading && <div className="text-sm text-muted-foreground">Loading your profile…</div>}
      {loadError && <div className="text-sm text-red-600">{loadError}</div>}
      {!loading && !loadError && (
      <>
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          className="w-full border border-primary/30 rounded px-3 py-2 focus:outline-none focus:border-primary"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!editing}
          placeholder="Enter your name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          className="w-full border border-primary/30 rounded px-3 py-2 focus:outline-none focus:border-primary"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled
          placeholder="Enter your email"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Phone</label>
        <input
          type="tel"
          className="w-full border border-primary/30 rounded px-3 py-2 focus:outline-none focus:border-primary"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          disabled={!editing}
          placeholder="Enter your phone number"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Interests (comma separated)</label>
        <input
          type="text"
          className="w-full border border-primary/30 rounded px-3 py-2 focus:outline-none focus:border-primary"
          value={interests}
          onChange={e => setInterests(e.target.value)}
          disabled={!editing}
          placeholder="e.g., Music, Reading, Yoga"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Support preferences</label>
        <input
          type="text"
          className="w-full border border-primary/30 rounded px-3 py-2 focus:outline-none focus:border-primary"
          value={concerns}
          onChange={e => setConcerns(e.target.value)}
          disabled={!editing}
          placeholder="e.g., Anxiety, Stress"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">About me</label>
        <textarea
          className="w-full border border-primary/30 rounded px-3 py-2 focus:outline-none focus:border-primary"
          value={bio}
          onChange={e => setBio(e.target.value)}
          disabled={!editing}
          placeholder="Share a little about yourself"
          rows={3}
        />
      </div>
      <div className="flex gap-2 pt-2">
        {editing ? (
          <button className="bg-primary text-white px-4 py-2 rounded disabled:opacity-50" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button className="bg-primary text-white px-4 py-2 rounded" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
      </>
      )}
      {saved && <div className="text-green-600 text-sm pt-2">Profile updated!</div>}
    </div>
  );
}

function Chats() {
  // Real conversations from PostgreSQL — generated from actual messages.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const myId = currentUser()?.id;

  const loadList = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
      setListError(null);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].user_id);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Unable to load conversations");
    }
    setLoadingList(false);
  }, [selectedId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingThread(true);
    getConversation(selectedId)
      .then((msgs) => {
        if (!cancelled) {
          setMessages(msgs);
          setLoadingThread(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Unable to load messages");
          setLoadingThread(false);
        }
      });
    const timer = window.setInterval(() => {
      getConversation(selectedId)
        .then((msgs) => {
          if (!cancelled) setMessages(msgs);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  const selected = conversations.find(c => c.user_id === selectedId) ?? null;

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(selectedId, chatInput.trim());
      setMessages((prev) => [...prev, msg]);
      setChatInput("");
      await loadList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send message");
    }
    setSending(false);
  };

  return (
    <div className="flex h-[70vh] bg-white rounded-xl shadow-soft overflow-hidden">
      {/* Chat List */}
      <div className="w-72 border-r bg-muted/30 p-4 flex flex-col">
        <h2 className="text-lg font-bold mb-4 text-primary">Chats</h2>
        <div className="flex-1 overflow-y-auto space-y-2">
          {loadingList && <div className="text-sm text-muted-foreground">Loading…</div>}
          {listError && <div className="text-sm text-red-600">{listError}</div>}
          {!loadingList && !listError && conversations.length === 0 && (
            <div className="text-sm text-muted-foreground">No conversations yet.</div>
          )}
          {conversations.map(chat => (
            <div
              key={chat.user_id}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${selectedId === chat.user_id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
              onClick={() => setSelectedId(chat.user_id)}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                {chat.name ? chat.name[0].toUpperCase() : "?"}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">{chat.name}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[120px]">{chat.last_message}</div>
              </div>
              {chat.unread_count > 0 && (
                <span className="text-xs bg-primary text-white rounded-full px-2 py-0.5">{chat.unread_count}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Chat Window */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            No conversations yet. Connect with a peer to start chatting.
          </div>
        ) : (
          <>
            <div className="border-b px-6 py-4 flex items-center gap-3 bg-gradient-to-r from-primary/10 to-white">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                {selected.name ? selected.name[0].toUpperCase() : "?"}
              </div>
              <div className="font-bold text-lg text-primary">{selected.name}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/10">
              {loadingThread && <div className="text-sm text-muted-foreground">Loading messages…</div>}
              {!loadingThread && messages.length === 0 && (
                <div className="text-sm text-muted-foreground">No messages yet. Say hello!</div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_id === myId ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[60%] px-4 py-2 rounded-2xl text-sm shadow ${msg.sender_id === myId ? "bg-primary text-white" : "bg-muted/50 text-foreground"}`}>
                    <div>{msg.content}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex gap-2 bg-white">
              <input
                className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:border-primary"
                placeholder="Type a message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
              <button
                className="bg-primary text-white px-4 py-2 rounded-full disabled:opacity-50"
                onClick={handleSend}
                disabled={sending || !chatInput.trim()}
              >{sending ? "…" : "Send"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Activities() {
  // Real wellness activity log from PostgreSQL (personal to the user).
  const [activeTab, setActiveTab] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newActivity, setNewActivity] = useState({
    title: "",
    category: "Wellness",
    description: "",
    date: "",
    time: "",
  });
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  const loadActivities = useCallback(async () => {
    try {
      const list = await listActivities();
      setActivities(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load activities");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const categories = ["All", ...Array.from(new Set(activities.map(a => a.activity_type)))];

  const filtered = activeTab === "All" ? activities : activities.filter(a => a.activity_type === activeTab);

  useEffect(() => {
    // Inject dotlottie-wc script only once
    if (!document.querySelector('script[src*="dotlottie-wc"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@lottiefiles/dotlottie-wc@0.6.2/dist/dotlottie-wc.js';
      document.body.appendChild(script);
    }
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createActivity({
        title: newActivity.title,
        activity_type: newActivity.category || "Wellness",
        description: newActivity.description,
        activity_date: newActivity.date,
        activity_time: newActivity.time,
      });
      setShowCreate(false);
      setNewActivity({ title: "", category: "Wellness", description: "", date: "", time: "" });
      await loadActivities();
      toast.success("Activity logged!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create activity");
    }
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">My Wellness Activities</h2>
          <p className="text-muted-foreground">Log personal wellness activities and track your history</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-primary text-white" onClick={() => setShowCreate(true)}>
            + Log Activity
          </Button>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <Button
            key={cat}
            variant={activeTab === cat ? "default" : "outline"}
            className={activeTab === cat ? "bg-primary text-white" : ""}
            onClick={() => setActiveTab(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading activities…</div>}
      {loadError && <div className="text-sm text-red-600">{loadError}</div>}
      {!loading && !loadError && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground">No activities yet. Log your first one!</div>
      )}
      <div className="space-y-6">
        {filtered.map(activity => (
          <div key={activity.id} className="bg-white rounded-xl shadow-soft p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border">
            <div className="flex items-start gap-4 flex-1">
              <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-center">
                <Smile className="w-7 h-7 text-primary" />
              </div>
              <div>
                <div className="font-bold text-lg text-foreground">{activity.title}</div>
                <div className="text-sm text-muted-foreground mb-1">{activity.activity_type}</div>
                {activity.description && <div className="mb-2 text-foreground">{activity.description}</div>}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                  <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {activity.activity_date}</span>
                  {activity.activity_time && (
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {activity.activity_time}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Create Activity Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative">
            <button className="absolute top-2 right-2 text-muted-foreground" onClick={() => setShowCreate(false)} title="Close">
              <X className="w-6 h-6" />
            </button>
            <div className="mb-4 text-lg font-bold text-primary">Log Activity</div>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input placeholder="Title" value={newActivity.title} onChange={e => setNewActivity({ ...newActivity, title: e.target.value })} required />
              <Input placeholder="Type (e.g., meditation, exercise)" value={newActivity.category} onChange={e => setNewActivity({ ...newActivity, category: e.target.value })} required />
              <Input placeholder="Description (optional)" value={newActivity.description} onChange={e => setNewActivity({ ...newActivity, description: e.target.value })} />
              <Input placeholder="Date (YYYY-MM-DD)" value={newActivity.date} onChange={e => setNewActivity({ ...newActivity, date: e.target.value })} required />
              <Input placeholder="Time (HH:MM, optional)" value={newActivity.time} onChange={e => setNewActivity({ ...newActivity, time: e.target.value })} />
              <Button type="submit" className="w-full bg-primary text-white" disabled={creating}>
                {creating ? "Saving…" : "Save"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const navigate = useNavigate();

  // Protected area: a valid JWT is required. No token → back to landing.
  useEffect(() => {
    if (!isLoggedIn()) navigate("/", { replace: true });
  }, [navigate]);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-8">
            <DashboardOverview />
            <div>
              <h3 className="text-xl font-semibold mb-4">Community Feed</h3>
              <SocialFeed />
            </div>
            <div>
              <NotificationsPanel />
            </div>
          </div>
        );
      case "matching":
        return <PeerMatching />;
      case "communities":
        return <CommunitiesSection />;
      case "activities":
        return <Activities />;
      case "wellness":
        return <WellnessPage />;
      case "help":
        return <HelpSection />;
      case "profile":
        return <ProfilePage />;
      case "chats":
        return <Chats />;
      case "admin":
        return currentUser()?.role === "admin" ? <AdminPanel /> : <DashboardOverview />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      {/* Global incoming call overlay — renders for all logged-in users */}
      <IncomingCallListener />
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4 max-w-7xl">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;