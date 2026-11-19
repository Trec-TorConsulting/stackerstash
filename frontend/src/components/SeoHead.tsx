import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeoToDocument, resolveSeoConfig } from "../lib/seo";

interface SeoHeadProps {
  pathname?: string;
}

export function SeoHead({ pathname }: SeoHeadProps) {
  const location = useLocation();
  const activePath = pathname ?? location.pathname;

  useEffect(() => {
    applySeoToDocument(resolveSeoConfig(activePath));
  }, [activePath]);

  return null;
}
