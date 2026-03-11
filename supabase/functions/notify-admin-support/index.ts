import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  contact_method: "whatsapp" | "email" | "call";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;
    const userEmail = claims.claims.email;

    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get user profile for name
    const { data: profileData } = await adminSupabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    const { contact_method }: NotifyRequest = await req.json();

    console.log(`Support contact notification: ${contact_method} from ${userEmail || userId}`);

    // Get all admin users
    const { data: adminRoles, error: adminError } = await adminSupabase
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

    const userName = profileData?.full_name || userEmail || "A user";
    const notificationTitle = "New Support Contact";
    const notificationMessage = `${userName} initiated contact via ${methodLabels[contact_method]}`;

    // Create notifications for all admins
    const notifications = adminRoles.map((admin) => ({
      user_id: admin.user_id,
      title: notificationTitle,
      message: notificationMessage,
      type: "support",
      read: false,
    }));

    const { error: insertError } = await adminSupabase
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
