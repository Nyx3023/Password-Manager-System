import { useState } from "react";
import { getSubcategory } from "@/shared/catalog";
import { getBundledIconUrl } from "@/shared/iconCache";

interface ServiceIconProps {
  categoryId: string;
  subcategoryId: string;
  size?: "sm" | "md" | "lg";
}

export function ServiceIcon({
  categoryId,
  subcategoryId,
  size = "md",
}: ServiceIconProps) {
  const sub = getSubcategory(categoryId, subcategoryId);
  const logoUrl = getBundledIconUrl(subcategoryId) ?? null;
  const [failed, setFailed] = useState(false);

  const showLogo = logoUrl && !failed;
  const color = sub?.color ?? "333333";
  const emoji = sub?.emoji ?? "🔑";

  return (
    <span
      className={`service-icon service-icon--${size}${showLogo ? " service-icon--logo" : ""}`}
      style={showLogo ? undefined : { backgroundColor: `#${color}` }}
      aria-hidden
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="service-icon-emoji">{emoji}</span>
      )}
    </span>
  );
}

interface PersonAvatarProps {
  name: string;
  emoji?: string;
  color: string;
  size?: "sm" | "md" | "lg";
}

export function PersonAvatar({
  name,
  emoji,
  color,
  size = "md",
}: PersonAvatarProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span
      className={`person-avatar person-avatar--${size}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {emoji ? (
        <span className="person-avatar-emoji">{emoji}</span>
      ) : (
        <span className="person-avatar-initial">{initial}</span>
      )}
    </span>
  );
}
