import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, Filter, Check } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { format } from "date-fns";
import BottomNav from "@/components/layout/BottomNav";

const Notifications = () => {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "read">("all");

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === "unread") return !n.read;
    if (activeFilter === "read") return n.read;
    return true;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success": return "bg-green-500";
      case "error": return "bg-red-500";
      case "warning": return "bg-amber-500";
      default: return "bg-blue-500";
    }
  };

  const filters = [
    { key: "all" as const, label: "All" },
    { key: "unread" as const, label: "Unread", count: unreadCount },
    { key: "read" as const, label: "Read" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Notifications</h1>
              <p className="text-xs text-white/70">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-xs text-white/90 bg-white/15 px-3 py-1.5 rounded-full flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> Read all
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeFilter === f.key
                  ? "bg-white text-green-700 shadow-sm"
                  : "bg-white/15 text-white/80"
              }`}
            >
              {f.label}
              {f.count ? ` (${f.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 -mt-2 space-y-2">
        {isLoading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Bell className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm font-medium">
              {activeFilter === "unread" ? "No unread notifications" : activeFilter === "read" ? "No read notifications" : "No notifications yet"}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification, i) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => { if (!notification.read) markAsRead(notification.id); }}
              className={`bg-white rounded-2xl p-4 shadow-sm cursor-pointer transition-all active:scale-[0.98] ${
                !notification.read ? "border-l-4 border-l-green-500" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!notification.read ? "bg-green-500" : "bg-transparent"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${getTypeColor(notification.type)}`} />
                    <h3 className="font-semibold text-sm text-gray-900 truncate">{notification.title}</h3>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{notification.message}</p>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    {format(new Date(notification.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Notifications;
