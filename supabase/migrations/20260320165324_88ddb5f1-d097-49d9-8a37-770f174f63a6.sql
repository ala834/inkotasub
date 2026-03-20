
-- Support conversations table
CREATE TABLE public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Support Request',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_admin_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

-- Users can view their own conversations
CREATE POLICY "Users can view own conversations" ON public.support_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Users can create conversations
CREATE POLICY "Users can create conversations" ON public.support_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations" ON public.support_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Admins and moderators can view all conversations
CREATE POLICY "Admins can view all conversations" ON public.support_conversations
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- Admins and moderators can update all conversations
CREATE POLICY "Admins can update all conversations" ON public.support_conversations
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- Support messages table
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'user',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages in their conversations
CREATE POLICY "Users can view own messages" ON public.support_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.support_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

-- Users can insert messages in their conversations
CREATE POLICY "Users can send messages" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.support_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

-- Admins/moderators can view all messages
CREATE POLICY "Admins can view all messages" ON public.support_messages
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- Admins/moderators can insert messages
CREATE POLICY "Admins can send messages" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
    AND sender_id = auth.uid()
  );

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Updated at trigger for conversations
CREATE TRIGGER update_support_conversations_updated_at
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
