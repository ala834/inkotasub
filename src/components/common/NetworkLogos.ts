import mtnLogo from "@/assets/networks/mtn.png";
import airtelLogo from "@/assets/networks/airtel.png";
import gloLogo from "@/assets/networks/glo.png";
import nineMobileLogo from "@/assets/networks/9mobile.png";

export const NETWORKS = [
  { id: "mtn", name: "MTN", logo: mtnLogo },
  { id: "airtel", name: "Airtel", logo: airtelLogo },
  { id: "glo", name: "Glo", logo: gloLogo },
  { id: "9mobile", name: "9mobile", logo: nineMobileLogo },
] as const;

export type NetworkId = (typeof NETWORKS)[number]["id"];

export function getNetworkLogo(id: string) {
  return NETWORKS.find((n) => n.id === id)?.logo;
}

export function getNetworkName(id: string) {
  return NETWORKS.find((n) => n.id === id)?.name || id;
}
