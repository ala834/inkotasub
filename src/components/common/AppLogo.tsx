import { useState, useCallback } from "react";
import inkotaLogo from "@/assets/inkota-logo.png";

interface AppLogoProps {
  className?: string;
  alt?: string;
}

const AppLogo = ({ className = "w-8 h-8", alt = "INKOTA SUB" }: AppLogoProps) => {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  if (hasError) {
    return (
      <div
        className={`${className} rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0`}
        role="img"
        aria-label={alt}
      >
        <span className="font-display font-bold text-primary text-xs">AK</span>
      </div>
    );
  }

  return (
    <img
      src={inkotaLogo}
      alt={alt}
      className={`${className} object-contain flex-shrink-0`}
      onError={handleError}
      loading="eager"
      decoding="async"
    />
  );
};

export default AppLogo;
