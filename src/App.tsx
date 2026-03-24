import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import PWAInstallPrompt from "@/components/common/PWAInstallPrompt";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import PhoneAuth from "./pages/PhoneAuth";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import History from "./pages/History";
import FundWallet from "./pages/FundWallet";
import Airtime from "./pages/Airtime";
import Data from "./pages/Data";
import Electricity from "./pages/Electricity";
import CableTV from "./pages/CableTV";
import ExamCards from "./pages/ExamCards";
import Transfer from "./pages/Transfer";
import Referrals from "./pages/Referrals";
import Notifications from "./pages/Notifications";
import Support from "./pages/Support";
import AdminDashboard from "./pages/admin/AdminDashboard";
import PaymentCallback from "./pages/PaymentCallback";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import RefundPolicy from "./pages/RefundPolicy";
import FAQ from "./pages/FAQ";
import ResetPassword from "./pages/ResetPassword";
import MyDevices from "./pages/MyDevices";
import KYCVerification from "./pages/KYCVerification";
import BulkAirtime from "./pages/BulkAirtime";
import BulkData from "./pages/BulkData";
import InternetServices from "./pages/InternetServices";
import ProfitCalculator from "./pages/ProfitCalculator";
import TransactionReceipt from "./pages/TransactionReceipt";
import RechargeCard from "./pages/RechargeCard";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<PhoneAuth />} />
              <Route path="/auth/email" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
              <Route path="/fund-wallet" element={<ProtectedRoute><FundWallet /></ProtectedRoute>} />
              <Route path="/airtime" element={<ProtectedRoute><Airtime /></ProtectedRoute>} />
              <Route path="/data" element={<ProtectedRoute><Data /></ProtectedRoute>} />
              <Route path="/electricity" element={<ProtectedRoute><Electricity /></ProtectedRoute>} />
              <Route path="/cable-tv" element={<ProtectedRoute><CableTV /></ProtectedRoute>} />
              <Route path="/exam-cards" element={<ProtectedRoute><ExamCards /></ProtectedRoute>} />
              <Route path="/transfer" element={<ProtectedRoute><Transfer /></ProtectedRoute>} />
              <Route path="/referrals" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
              <Route path="/my-devices" element={<ProtectedRoute><MyDevices /></ProtectedRoute>} />
              <Route path="/kyc" element={<ProtectedRoute><KYCVerification /></ProtectedRoute>} />
              <Route path="/bulk-airtime" element={<ProtectedRoute><BulkAirtime /></ProtectedRoute>} />
              <Route path="/bulk-data" element={<ProtectedRoute><BulkData /></ProtectedRoute>} />
              <Route path="/internet-services" element={<ProtectedRoute><InternetServices /></ProtectedRoute>} />
              <Route path="/recharge-card" element={<ProtectedRoute><RechargeCard /></ProtectedRoute>} />
              <Route path="/calculator" element={<ProtectedRoute><ProfitCalculator /></ProtectedRoute>} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/payment-callback" element={<ProtectedRoute><PaymentCallback /></ProtectedRoute>} />
              <Route path="/receipt/:id" element={<ProtectedRoute><TransactionReceipt /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
