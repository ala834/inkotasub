import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, X, Minus, Bot, User, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isAI?: boolean;
}

interface DBMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

type ChatMode = "ai" | "human";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-support-chat`;

const SupportChatWidget = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<ChatMode>("ai");
  const [unreadCount, setUnreadCount] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [humanMessages, setHumanMessages] = useState<DBMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, humanMessages]);

  // Load existing human conversation
  useEffect(() => {
    if (user && mode === "human") {
      loadHumanConversation();
    }
  }, [user, mode]);

  // Realtime for human mode
  useEffect(() => {
    if (!conversationId || mode !== "human") return;
    const channel = supabase
      .channel(`support-messages-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const msg = payload.new as DBMessage;
        setHumanMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (!isOpen && msg.sender_type === "admin") {
          setUnreadCount((c) => c + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, mode, isOpen]);

  const loadHumanConversation = async () => {
    if (!user) return;
    const { data: convos } = await supabase
      .from("support_conversations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1);

    if (convos && convos.length > 0) {
      setConversationId(convos[0].id);
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", convos[0].id)
        .order("created_at", { ascending: true });
      if (data) setHumanMessages(data as DBMessage[]);
    }
  };

  const startHumanConversation = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("support_conversations")
      .insert({ user_id: user.id, subject: "Escalated from AI Support" })
      .select()
      .single();
    if (!error && data) {
      setConversationId(data.id);
      await supabase.from("support_messages").insert({
        conversation_id: data.id,
        sender_id: user.id,
        sender_type: "system",
        message: "User was connected from AI support. A human agent will respond shortly.",
      });
      // Forward AI conversation context
      const context = messages
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");
      if (context) {
        await supabase.from("support_messages").insert({
          conversation_id: data.id,
          sender_id: user.id,
          sender_type: "system",
          message: `--- Previous AI conversation ---\n${context}\n--- End of AI conversation ---`,
        });
      }
      const { data: msgs } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", data.id)
        .order("created_at", { ascending: true });
      if (msgs) setHumanMessages(msgs as DBMessage[]);
      return data.id;
    }
    return null;
  };

  const escalateToHuman = async () => {
    setMode("human");
    if (!conversationId) {
      await startHumanConversation();
    }
    toast.info("Connected to human support. An agent will respond shortly.");
  };

  // Stream AI response
  const sendAIMessage = useCallback(async (userText: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
      timestamp: new Date(),
    };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setSending(true);

    const aiMsgId = crypto.randomUUID();
    let assistantContent = "";

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      const displayContent = assistantContent
        .replace(/\[RESOLVED\]/g, "")
        .replace(/\[ESCALATE\]/g, "")
        .trim();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id === aiMsgId) {
          return prev.map((m) => m.id === aiMsgId ? { ...m, content: displayContent } : m);
        }
        return [...prev, { id: aiMsgId, role: "assistant", content: displayContent, timestamp: new Date(), isAI: true }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error("AI unavailable");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) updateAssistant(content);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Check if AI wants to escalate
      if (assistantContent.includes("[ESCALATE]")) {
        setTimeout(() => escalateToHuman(), 1500);
      }
    } catch (err) {
      console.error("AI chat error:", err);
      updateAssistant("I'm having trouble connecting. Let me transfer you to a human agent.");
      setTimeout(() => escalateToHuman(), 1500);
    } finally {
      setSending(false);
    }
  }, [messages]);

  // Send human message
  const sendHumanMessage = async (text: string) => {
    if (!user) return;
    setSending(true);
    let convId = conversationId;
    if (!convId) {
      convId = await startHumanConversation();
    }
    if (!convId) { setSending(false); return; }

    await supabase.from("support_messages").insert({
      conversation_id: convId,
      sender_id: user.id,
      sender_type: "user",
      message: text,
    });
    await supabase
      .from("support_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", convId);
    setSending(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !user || sending) return;
    setNewMessage("");
    if (mode === "ai") {
      await sendAIMessage(text);
    } else {
      await sendHumanMessage(text);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
    if (messages.length === 0 && mode === "ai") {
      setMessages([{
        id: "greeting",
        role: "assistant",
        content: "Hi! 👋 I'm INKOTA's AI assistant. I can help with questions about airtime, data, wallet, payments, and more. How can I help you today?",
        timestamp: new Date(),
        isAI: true,
      }]);
    }
  };

  if (!user) return null;

  return (
    <>
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

      {isOpen && (
        <div className="fixed bottom-20 right-3 left-3 sm:left-auto sm:w-[380px] z-50 animate-in slide-in-from-bottom-4 duration-300">
          <Card className="shadow-2xl border border-border/50 overflow-hidden">
            <CardHeader className="py-3 px-4 gradient-primary text-primary-foreground flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                {mode === "ai" ? <Bot className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                <CardTitle className="text-sm font-semibold">
                  {mode === "ai" ? "AI Support" : "Live Support"}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {mode === "ai" ? "AI" : "Human"}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setIsOpen(false)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setIsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div ref={scrollRef} className="h-[320px] overflow-y-auto p-3 space-y-3 bg-muted/30">
                {mode === "ai" ? (
                  <>
                    {messages.filter(m => m.role !== "system").map((msg) => (
                      <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                          msg.role === "user"
                            ? "gradient-primary text-primary-foreground rounded-br-md"
                            : "bg-card border border-border rounded-bl-md"
                        )}>
                          {msg.role === "assistant" && (
                            <div className="flex items-center gap-1 mb-1">
                              <Bot className="h-3 w-3 text-primary" />
                              <span className="text-[10px] font-medium text-primary">AI Assistant</span>
                            </div>
                          )}
                          <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                          <p className={cn("text-[10px] mt-1", msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {sending && (
                      <div className="flex justify-start">
                        <div className="bg-card border border-border rounded-2xl rounded-bl-md px-3.5 py-2">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {humanMessages.map((msg) => {
                      const isUser = msg.sender_type === "user";
                      const isSystem = msg.sender_type === "system";
                      if (isSystem) {
                        return (
                          <div key={msg.id} className="text-center">
                            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{msg.message}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                            isUser ? "gradient-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"
                          )}>
                            {!isUser && (
                              <div className="flex items-center gap-1 mb-1">
                                <User className="h-3 w-3 text-green-500" />
                                <span className="text-[10px] font-medium text-green-500">Support Agent</span>
                              </div>
                            )}
                            <p className="break-words">{msg.message}</p>
                            <p className={cn("text-[10px] mt-1", isUser ? "text-primary-foreground/60" : "text-muted-foreground")}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Escalate button in AI mode */}
              {mode === "ai" && messages.length > 1 && (
                <div className="px-3 py-2 border-t border-border bg-muted/50">
                  <button
                    onClick={escalateToHuman}
                    className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <User className="h-3 w-3" />
                    Talk to a human agent
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}

              <div className="p-3 border-t border-border bg-card">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={mode === "ai" ? "Ask me anything..." : "Type a message..."}
                    className="flex-1 h-10 rounded-full text-sm"
                    disabled={sending}
                  />
                  <Button type="submit" size="icon" className="h-10 w-10 rounded-full shrink-0" disabled={!newMessage.trim() || sending}>
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
