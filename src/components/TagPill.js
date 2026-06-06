import React from "react";
import "./TagPill.css";

// Convert hex -> rgb
const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");

  const bigint = parseInt(clean, 16);

  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

// rgb -> hex
const rgbToHex = (r, g, b) =>
  "#" +
  [r, g, b]
    .map((x) => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    })
    .join("");

// Lighten or darken a color
const adjustColor = (hex, percent) => {
  const { r, g, b } = hexToRgb(hex);

  const adjust = (channel) => {
    if (percent < 0) {
      // Darken proportionally
      return Math.round(channel * (1 + percent));
    }

    // Lighten proportionally
    return Math.round(channel + (255 - channel) * percent);
  };

  return rgbToHex(
    adjust(r),
    adjust(g),
    adjust(b)
  );
};

// Determine brightness
const getLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const TagPill = ({
  tag,
  className = "",
  style = {},
  title,
}) => {
  const baseColor = tag.color || "#555";
  const luminance = getLuminance(baseColor);

  // Light tag => darker border
  // Dark tag => lighter border
  const borderColor = adjustColor(baseColor, -0.45);

  // Slightly tinted white text
  const textColor =
  luminance > 150
    ? adjustColor(baseColor, -0.95)
    : "#f5f5f5";

  return (
    <span
      className={`tag-pill ${className}`}
      title={title ?? tag.description ?? ""}
      style={{
        backgroundColor: baseColor,
        outlineColor: borderColor,
        color: textColor,
        ...style,
      }}
    >
      {tag.name}
    </span>
  );
};

export default TagPill;