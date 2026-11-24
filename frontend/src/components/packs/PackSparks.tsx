import React from 'react';

export type SparkTone = 'gold' | 'rainbow' | 'shard';

export interface SparkBurst {
  id: number;
  tone: SparkTone;
  bits: { left: number; top: number; dx: number; dy: number; delay: number }[];
}

/** Sparks flying out from a box on screen. `from` picks how far down the box they start (0 top, 0.5 middle). */
export function makeBurst(id: number, box: DOMRect, tone: SparkTone, count: number, distance: number, from = 0.5): SparkBurst {
  const bits = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const reach = distance * (0.35 + Math.random() * 0.65);
    return {
      left: box.left + box.width * (0.2 + Math.random() * 0.6),
      top: box.top + box.height * from,
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach,
      delay: Math.random() * 0.12,
    };
  });
  return { id, tone, bits };
}

// Colours come from the tone (PackOpening.css); only positions are set here.
const PackSparks: React.FC<{ bursts: SparkBurst[] }> = ({ bursts }) => (
  <div className="pack-opening__sparks" aria-hidden="true">
    {bursts.map(burst => (
      <div key={burst.id} className="pack-opening__burst" data-tone={burst.tone}>
        {burst.bits.map((bit, i) => (
          <i
            key={i}
            style={{
              left: bit.left,
              top: bit.top,
              animationDelay: `${bit.delay}s`,
              ['--dx' as string]: `${bit.dx}px`,
              ['--dy' as string]: `${bit.dy}px`,
            }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default PackSparks;
