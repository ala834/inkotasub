import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Send, MessageCircle, User, Clock, CheckCircle2, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  last_message_at: string;
  assigned_admin_id: string | null;
  user_name?: string;
  user_email?: string;
  last_message?: string;
  unread_count?: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

const AdminSupportChatTab = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("admin-support-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_conversations" },
        () => fetchConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!selectedConvo) return;

    loadMessages(selectedConvo.id);

    const channel = supabase
      .channel(`admin-messages-${selectedConvo.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${selectedConvo.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConvo?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const { data: convos } = await supabase
        .from("support_conversations")
        .select("*")
        .order("last_message_at", { ascending: false });

      if (!convos) { setLoading(false); return; }

      // Get user profiles
      const userIds = [...new Set(convos.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      // Get emails
      let emailMap: Record<string, string> = {};
      try {
        const { data: emailData } = await supabase.functions.invoke("admin-get-user-emails", {
          body: { userIds },
        });
        if (emailData?.emails) emailMap = emailData.emails;
      } catch {}

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      // Get last message for each conversation
      const enriched: Conversation[] = await Promise.all(
        convos.map(async (c) => {
          const { data: lastMsg } = await supabase
            .from("support_messages")
            .select("message, sender_type")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1);

          return {
            ...c,
            user_name: profileMap.get(c.user_id)?.full_name || "Unknown User",
            user_email: emailMap[c.user_id] || "",
            last_message: lastMsg?.[0]?.message || "",
          } as Conversation;
        })
      );

      setConversations(enriched);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (data) setMessages(data as Message[]);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedConvo || sending) return;

    setSending(true);
    const msg = newMessage.trim();
    setNewMessage("");

    await supabase.from("support_messages").insert({
      conversation_id: selectedConvo.id,
      sender_id: user.id,
      sender_type: "admin",
      message: msg,
    });

    await supabase
      .from("support_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        assigned_admin_id: selectedConvo.assigned_admin_id || user.id,
      })
      .eq("id", selectedConvo.id);

    setSending(false);
  };

  const handleCloseConversation = async (convoId: string) => {
    await supabase
      .from("support_conversations")
      .update({ status: "closed" })
      .eq("id", convoId);

    if (selectedConvo?.id === convoId) {
      setSelectedConvo(null);
      setMessages([]);
    }
    fetchConversations();
  };

  const filteredConvos = conversations.filter(
    (c) =>
      !searchQuery ||
      c.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openConvos = filteredConvos.filter((c) => c.status === "open");
  const closedConvos = filteredConvos.filter((c) => c.status === "closed");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* Conversation List */}
      <Card className="lg:col-span-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Conversations
            <Badge variant="secondary" className="ml-auto">{openConvos.length} open</Badge>
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {openConvos.length === 0 && closedConvos.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8 px-4">
                  No conversations yet
                </div>
              )}

              {openConvos.map((convo) => (
                <button
                  key={convo.id}
                  onClick={() => setSelectedConvo(convo)}
                  className={cn(
                    "w-full text-left p-3 transition-colors hover:bg-muted/50",
                    selectedConvo?.id === convo.id && "bg-muted"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm truncate">{convo.user_name}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0 ml-1 border-green-500/50 text-green-600">
                          Open
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{convo.user_email}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{convo.last_message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {new Date(convo.last_message_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {closedConvos.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                    Closed ({closedConvos.length})
                  </div>
                  {closedConvos.map((convo) => (
                    <button
                      key={convo.id}
                      onClick={() => setSelectedConvo(convo)}
                      className={cn(
                        "w-full text-left p-3 transition-colors hover:bg-muted/50 opacity-60",
                        selectedConvo?.id === convo.id && "bg-muted opacity-100"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{convo.user_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{convo.last_message}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat Area */}
      <Card className="lg:col-span-2 flex flex-col overflow-hidden">
        {selectedConvo ? (
          <>
            {/* Chat Header */}
            <CardHeader className="pb-3 shrink-0 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{selectedConvo.user_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{selectedConvo.user_email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedConvo.status === "open" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCloseConversation(selectedConvo.id)}
                      className="text-xs gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Messages */}
            <CardContent className="flex-1 overflow-hidden p-0">
              <div
                ref={scrollRef}
                className="h-full overflow-y-auto p-4 space-y-3"
              >
                {messages.map((msg) => {
                  const isAdmin = msg.sender_type === "admin";
                  const isSystem = msg.sender_type === "system";

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="text-center">
                        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                          {msg.message}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={cn("flex", isAdmin ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                          isAdmin
                            ? "gradient-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        )}
                      >
                        <p className="break-words">{msg.message}</p>
                        <p
                          className={cn(
                            "text-[10px] mt-1",
                            isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}
                        >
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>

            {/* Input */}
            {selectedConvo.status === "open" && (
              <div className="p-3 border-t border-border shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a reply..."
                    className="flex-1 h-10 text-sm"
                    disabled={sending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    disabled={!newMessage.trim() || sending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            )}
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start replying</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default AdminSupportChatTab;
