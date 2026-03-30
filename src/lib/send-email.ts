import { supabase } from "@/integrations/supabase/client";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Reusable email sending utility.
 * Uses the send-email edge function which calls Resend API.
 * 
 * Usage:
 *   import { sendEmail } from "@/lib/send-email";
 *   const result = await sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" });
 */
export const sendEmail = async (params: SendEmailParams): Promise<SendEmailResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: params,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.success) {
      return { success: true, messageId: data.messageId };
    }

    return { success: false, error: data?.error || 'Unknown error' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send email' };
  }
};

/**
 * Send an email using a saved template from the database.
 * Fetches the template, replaces placeholders, then sends.
 * 
 * @param templateKey - The template_key from email_templates table
 * @param to - Recipient email
 * @param variables - Key-value pairs to replace {{KEY}} placeholders
 */
export const sendTemplateEmail = async (
  templateKey: string,
  to: string,
  variables: Record<string, string> = {}
): Promise<SendEmailResult> => {
  try {
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('subject, html_content')
      .eq('template_key', templateKey)
      .single();

    if (error || !template) {
      return { success: false, error: `Template "${templateKey}" not found` };
    }

    let { subject, html_content } = template;
    
    // Replace all {{VARIABLE}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      html_content = html_content.replace(regex, value);
    }

    return sendEmail({ to, subject, html: html_content });
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send template email' };
  }
};
