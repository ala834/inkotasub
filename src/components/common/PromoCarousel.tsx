import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PromoBanner {
  id: string;
  image_url: string;
  title: string;
  description: string | null;
  target_link: string | null;
}

const AUTOPLAY_INTERVAL = 4000;

const PromoCarousel = () => {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("promo_banners")
        .select("id,image_url,title,description,target_link")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setBanners((data as PromoBanner[]) || []);
      setLoading(false);
    })();
  }, []);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Autoplay
  useEffect(() => {
    if (!emblaApi || banners.length <= 1) return;
    const id = setInterval(() => {
      emblaApi.scrollNext();
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(id);
  }, [emblaApi, banners.length]);

  const handleClick = (banner: PromoBanner) => {
    if (!banner.target_link) return;
    if (/^https?:\/\//i.test(banner.target_link)) {
      window.open(banner.target_link, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(banner.target_link);
    }
  };

  if (loading) {
    return (
      <div className="relative">
        <Skeleton className="w-full h-32 rounded-[20px]" />
      </div>
    );
  }

  if (banners.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      <div className="overflow-hidden rounded-[20px]" ref={emblaRef}>
        <div className="flex">
          {banners.map((banner) => (
            <button
              key={banner.id}
              onClick={() => handleClick(banner)}
              className="relative flex-[0_0_100%] min-w-0 group active:scale-[0.99] transition-transform text-left"
              aria-label={banner.title}
            >
              <div className="relative w-full h-32 sm:h-36 overflow-hidden rounded-[20px] bg-muted">
                <img
                  src={banner.image_url}
                  alt={banner.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h4 className="font-display font-semibold text-white text-base leading-tight">
                    {banner.title}
                  </h4>
                  {banner.description && (
                    <p className="text-white/85 text-xs mt-0.5 line-clamp-1">
                      {banner.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === selectedIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default PromoCarousel;
