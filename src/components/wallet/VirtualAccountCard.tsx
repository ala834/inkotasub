import { useState } from "react";
import { Building2, Copy, Check, Loader2, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useVirtualAccount } from "@/hooks/useVirtualAccount";
import { cn } from "@/lib/utils";

const VirtualAccountCard = () => {
  const { virtualAccount, isLoading, isCreating, createVirtualAccount } = useVirtualAccount();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${field} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleCreateAccount = async () => {
    try {
      await createVirtualAccount();
      toast.success("Virtual account created successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!virtualAccount) {
    return (
      <Card className="glass-card border-dashed">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Get a Virtual Account</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a dedicated bank account for instant wallet funding
              </p>
            </div>
            <Button
              onClick={handleCreateAccount}
              disabled={isCreating}
              className="gradient-primary"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create Virtual Account"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Virtual Account
          </CardTitle>
          <span className={cn(
            "text-xs px-2 py-1 rounded-full",
            virtualAccount.is_active 
              ? "bg-green-500/10 text-green-600" 
              : "bg-destructive/10 text-destructive"
          )}>
            {virtualAccount.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bank Name */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div>
            <p className="text-xs text-muted-foreground">Bank</p>
            <p className="font-semibold">{virtualAccount.bank_name}</p>
          </div>
        </div>

        {/* Account Number */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div>
            <p className="text-xs text-muted-foreground">Account Number</p>
            <p className="font-mono font-bold text-lg tracking-wider">
              {virtualAccount.account_number}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleCopy(virtualAccount.account_number, "Account number")}
            className="h-10 w-10"
          >
            {copiedField === "Account number" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Account Name */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Account Name</p>
            <p className="font-semibold truncate">{virtualAccount.account_name}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleCopy(virtualAccount.account_name, "Account name")}
            className="h-10 w-10 flex-shrink-0"
          >
            {copiedField === "Account name" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Instructions */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How to Fund</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Transfer to the account number above</li>
              <li>Your wallet will be credited instantly</li>
              <li>No extra charges apply</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VirtualAccountCard;
