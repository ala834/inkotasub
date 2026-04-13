import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Trash2, Phone, CreditCard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Beneficiary } from "@/hooks/useBeneficiaries";

interface BeneficiariesDialogProps {
  open: boolean;
  onClose: () => void;
  beneficiaries: Beneficiary[];
  onSelect: (identifier: string, label?: string, network?: string) => void;
  onRemove: (id: string) => void;
  title?: string;
  identifierLabel?: string;
}

const BeneficiariesDialog = ({
  open,
  onClose,
  beneficiaries,
  onSelect,
  onRemove,
  title = "Beneficiaries",
  identifierLabel = "Phone Number",
}: BeneficiariesDialogProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!open) return null;

  const handleSelect = (b: Beneficiary) => {
    onSelect(b.identifier, b.label || undefined, b.network || undefined);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    onRemove(id);
    setTimeout(() => setDeletingId(null), 300);
  };

  const icon = identifierLabel.toLowerCase().includes("phone") ? (
    <Phone className="h-4 w-4" />
  ) : (
    <CreditCard className="h-4 w-4" />
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[80vh] flex flex-col shadow-2xl"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {beneficiaries.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                <User className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">No saved beneficiaries</p>
              <p className="text-gray-400 text-sm">Complete a transaction to auto-save a beneficiary</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {beneficiaries.map((b) => (
                  <motion.button
                    key={b.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12, height: 0 }}
                    onClick={() => handleSelect(b)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-white hover:bg-green-50/50 hover:border-green-200 active:bg-green-50 transition-all text-left",
                      deletingId === b.id && "opacity-50"
                    )}
                  >
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                      {b.label ? (
                        <span className="text-green-700 font-bold text-sm">
                          {b.label
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-green-600">{icon}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {b.label && (
                        <p className="text-sm font-semibold text-gray-900 truncate">{b.label}</p>
                      )}
                      <p className={cn("text-sm truncate", b.label ? "text-gray-500" : "font-semibold text-gray-900")}>
                        {b.identifier}
                      </p>
                      {b.network && (
                        <p className="text-xs text-gray-400 capitalize">{b.network}</p>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={(e) => handleDelete(e, b.id)}
                      className="w-9 h-9 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default BeneficiariesDialog;
