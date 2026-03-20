import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

interface Conversation {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  last_message_at: string;
}

const SupportChatWidget = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      loadConversation();
    }
  }, [user]);

  useEffect(() => {
    if (!conversation) return;

    const channel = supabase
      .channel(`support-messages-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (!isOpen && newMsg.sender_type === "admin") {
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation, isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadConversation = async () => {
    if (!user) return;
    setLoading(true);

    // Find existing open conversation
    const { data: convos } = await supabase
      .from("support_conversations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1);

    if (convos && convos.length > 0) {
      setConversation(convos[0] as Conversation);
      await loadMessages(convos[0].id);
    }
    setLoading(false);
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (data) setMessages(data as Message[]);
  };

  const startConversation = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("support_conversations")
      .insert({ user_id: user.id, subject: "Support Request" })
      .select()
      .single();

    if (!error && data) {
      setConversation(data as Conversation);
      // Send initial greeting
      await supabase.from("support_messages").insert({
        conversation_id: data.id,
        sender_id: user.id,
        sender_type: "system",
        message: "Welcome! How can we help you today?",
      });
      await loadMessages(data.id);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !user || sending) return;

    if (!conversation) {
      await startConversation();
    }

    const convId = conversation?.id;
    if (!convId) return;

    setSending(true);
    const msg = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("support_messages").insert({
      conversation_id: convId,
      sender_id: user.id,
      sender_type: "user",
      message: msg,
    });

    if (!error) {
      await supabase
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", convId);
    }

    setSending(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
    if (!conversation && user) {
      startConversation();
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full gradient-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <MessageCircle className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-20 right-3 left-3 sm:left-auto sm:w-[380px] z-50 animate-in slide-in-from-bottom-4 duration-300">
          <Card className="shadow-2xl border border-border/50 overflow-hidden">
            {/* Header */}
            <CardHeader className="py-3 px-4 gradient-primary text-primary-foreground flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <CardTitle className="text-sm font-semibold">Live Support</CardTitle>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Online</Badge>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => setIsOpen(false)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            {/* Messages */}
            <CardContent className="p-0">
              <div
                ref={scrollRef}
                className="h-[320px] overflow-y-auto p-3 space-y-3 bg-muted/30"
              >
                {messages.length === 0 && !loading && (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>Start a conversation with our support team</p>
                  </div>
                )}

                {messages.map((msg) => {
                  const isUser = msg.sender_type === "user";
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
                      className={cn(
                        "flex",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                          isUser
                            ? "gradient-primary text-primary-foreground rounded-br-md"
                            : "bg-card border border-border rounded-bl-md"
                        )}
                      >
                        <p className="break-words">{msg.message}</p>
                        <p
                          className={cn(
                            "text-[10px] mt-1",
                            isUser
                              ? "text-primary-foreground/60"
                              : "text-muted-foreground"
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

              {/* Input */}
              <div className="p-3 border-t border-border bg-card">
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
                    placeholder="Type a message..."
                    className="flex-1 h-10 rounded-full text-sm"
                    disabled={sending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-10 w-10 rounded-full shrink-0"
                    disabled={!newMessage.trim() || sending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default SupportChatWidget;
