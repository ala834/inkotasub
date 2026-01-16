import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  contact_method: "whatsapp" | "email" | "call";
  user_email?: string;
  user_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { contact_method, user_email, user_name }: NotifyRequest = await req.json();

    console.log(`Support contact notification: ${contact_method} from ${user_email || "unknown user"}`);

    // Get all admin users
    const { data: adminRoles, error: adminError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminError) {
      console.error("Error fetching admin roles:", adminError);
      throw adminError;
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admins found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const methodLabels = {
      whatsapp: "WhatsApp",
      email: "Email",
      call: "Phone Call",
    };

    const notificationTitle = "New Support Contact";
    const notificationMessage = `${user_name || user_email || "A user"} initiated contact via ${methodLabels[contact_method]}`;

    // Create notifications for all admins
    const notifications = adminRoles.map((admin) => ({
      user_id: admin.user_id,
      title: notificationTitle,
      message: notificationMessage,
      type: "support",
      read: false,
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Error inserting notifications:", insertError);
      throw insertError;
    }

    console.log(`Successfully notified ${adminRoles.length} admin(s)`);

    return new Response(
      JSON.stringify({ success: true, admins_notified: adminRoles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-admin-support:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
