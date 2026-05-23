import "./LiquidBackground.css";

export function LiquidBackground() {
  return (
    <>
      {/* Container applying the SVG Gooey filter */}
      <div className="liquid-bg-container">
        <div className="bg-orb orb1"></div>
        <div className="bg-orb orb2"></div>
        <div className="bg-orb orb3"></div>
        <div className="bg-orb orb4"></div>
      </div>

      {/* Embedded SVG filter definitions */}
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
        <defs>
          {/* Gooey filter for merging floating liquid blobs organically */}
          <filter id="gooey-liquid-bg">
            <feGaussianBlur in="SourceGraphic" stdDeviation="55" result="blur" />
            <feColorMatrix 
              in="blur" 
              mode="matrix" 
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" 
              result="gooey" 
            />
            <feBlend in="SourceGraphic" in2="gooey" />
          </filter>
        </defs>
      </svg>
    </>
  );
}
