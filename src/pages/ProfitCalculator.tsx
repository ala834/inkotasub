import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calculator, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const services = [
  { id: "data", name: "Data Bundle", avgDiscount: 3 },
  { id: "airtime", name: "Airtime", avgDiscount: 2 },
  { id: "electricity", name: "Electricity", avgDiscount: 1.5 },
  { id: "cable", name: "Cable TV", avgDiscount: 2 },
];

const ProfitCalculator = () => {
  const navigate = useNavigate();
  const [service, setService] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customDiscount, setCustomDiscount] = useState("");

  const selectedService = services.find((s) => s.id === service);
  const discount = parseFloat(customDiscount) || selectedService?.avgDiscount || 0;
  const price = parseFloat(sellingPrice) || 0;
  const qty = parseInt(quantity) || 1;

  const costPrice = price * (1 - discount / 100);
  const profitPerUnit = price - costPrice;
  const totalProfit = profitPerUnit * qty;
  const dailyProfit = totalProfit;
  const monthlyProfit = totalProfit * 30;

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-lg font-display font-bold">Profit Calculator</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="glass-card rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Calculator className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium">Reseller Calculator</p>
                <p className="text-sm text-muted-foreground">Estimate your profits</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Service Type</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} (~{s.avgDiscount}% discount)</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Selling Price (₦)</Label>
              <Input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="e.g. 1000" className="h-12 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Daily Transactions</Label>
                <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" className="h-12 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Discount (%)</Label>
                <Input type="number" value={customDiscount} onChange={(e) => setCustomDiscount(e.target.value)} placeholder={`${selectedService?.avgDiscount || 0}`} className="h-12 rounded-xl" />
              </div>
            </div>
          </div>

          {price > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Profit Breakdown</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Selling Price</span><span>₦{price.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cost Price</span><span>₦{costPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Profit/Unit</span><span className="text-primary font-medium">₦{profitPerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card rounded-2xl p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Daily Profit</p>
                  <p className="text-xl font-bold text-primary">₦{dailyProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="glass-card rounded-2xl p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Monthly Profit</p>
                  <p className="text-xl font-bold text-primary">₦{monthlyProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default ProfitCalculator;
