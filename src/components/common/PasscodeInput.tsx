import { useEffect, useRef } from "react";
import { Delete } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PasscodeInputProps {
  value: string;
  onChange: (val: string) => void;
  length?: number;
  showKeypad?: boolean;
  autoFocus?: boolean;
  error?: boolean;
  className?: string;
}

/**
 * Secure 6-digit passcode input with on-screen numeric keypad (mobile-first).
 * Uses a hidden numeric input on devices that have a physical/system keyboard
 * and a custom secure keypad on touch devices.
 */
export const PasscodeInput = ({
  value,
  onChange,
  length = 6,
  showKeypad = true,
  autoFocus = false,
  error = false,
  className,
}: PasscodeInputProps) => {
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && hiddenRef.current) hiddenRef.current.focus();
  }, [autoFocus]);

  const handleKey = (key: string) => {
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    onChange((value + key).replace(/\D/g, "").slice(0, length));
  };

  const dots = Array.from({ length });

  return (
    <div className={cn("space-y-5 select-none", className)}>
      {/* Dot indicators */}
      <div
        className="flex justify-center gap-3"
        onClick={() => hiddenRef.current?.focus()}
      >
        {dots.map((_, i) => {
          const filled = i < value.length;
          return (
            <motion.div
              key={i}
              animate={filled ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.15 }}
              className={cn(
                "w-3.5 h-3.5 rounded-full border-2 transition-colors",
                filled
                  ? error
                    ? "bg-red-500 border-red-500"
                    : "bg-green-500 border-green-500"
                  : error
                  ? "border-red-300"
                  : "border-gray-300",
              )}
            />
          );
        })}
      </div>

      {/* Hidden input — keeps system keyboards working too */}
      <input
        ref={hiddenRef}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        className="sr-only"
        aria-label="Passcode"
      />

      {showKeypad && (
        <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, idx) => {
            if (k === "")
              return <div key={idx} />;
            const isDel = k === "del";
            return (
              <motion.button
                key={idx}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => handleKey(k)}
                className={cn(
                  "h-14 rounded-2xl bg-white border border-gray-200 shadow-sm",
                  "text-2xl font-semibold text-gray-900",
                  "active:bg-gray-100 transition-colors flex items-center justify-center",
                )}
              >
                {isDel ? <Delete className="h-5 w-5 text-gray-600" /> : k}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PasscodeInput;
