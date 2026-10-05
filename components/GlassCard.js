import React from 'react';
import GlassSurface from './GlassSurface';

// Совместимость со старым именем: GlassCard теперь тонкая обёртка над
// GlassSurface (заливка 22%, блик, кромка). Новый код использует GlassSurface.
export default function GlassCard({ children, style, intensity, radius, padding = 20 }) {
  return (
    <GlassSurface style={style} blur={intensity} radius={radius} padding={padding}>
      {children}
    </GlassSurface>
  );
}
