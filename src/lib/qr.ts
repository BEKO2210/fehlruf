import { useEffect, useState } from "react";

/** QR-Code als SVG-Markup, schwarz auf weiß. Leer, bis das Paket nachgeladen ist. */
export function useQrSvg(url: string, width: number) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then(async (mod) => {
      const api = typeof mod.toString === "function" ? mod : mod.default;
      const out = await api.toString(url, {
        type: "svg",
        margin: 1,
        width,
        errorCorrectionLevel: "M",
        color: { dark: "#121417", light: "#ffffff" },
      });
      if (!cancelled) setSvg(out);
    });
    return () => {
      cancelled = true;
    };
  }, [url, width]);

  return svg;
}
