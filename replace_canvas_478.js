const fs = require('fs');
const path = 'src/components/reading/GenerationOverlay.tsx';
let content = fs.readFileSync(path, 'utf8');

const regexCanvas = /export const CanvasBreathingParticles = \(\) => \{[\s\S]*?\n\};/g;
if (!content.match(regexCanvas)) {
    // try matching the old signature just in case
    const regexCanvas2 = /export const CanvasBreathingParticles = \(\{\s*colors\s*\}\s*:\s*\{\s*colors\?:\s*string\[\]\s*\}\) => \{[\s\S]*?\n\};/g;
    content = content.replace(regexCanvas2, "/* PLACEHOLDER */");
} else {
    content = content.replace(regexCanvas, "/* PLACEHOLDER */");
}

const newCanvasContent = `export const CanvasBreathingParticles = ({ colors }: { colors?: string[] }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId = 0;
        let width = window.innerWidth;
        let height = window.innerHeight;
        let dpr = window.devicePixelRatio || 1;
        
        const setCanvasSize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
        };
        setCanvasSize();
        window.addEventListener('resize', setCanvasSize);

        const themeColors = colors || ['#e0e7ff', '#c7d2fe', '#818cf8', '#c084fc', '#f472b6', '#ffffff'];
        
        // 4-7-8 Breathing Cycle Logic
        const INHALE = 4000;
        const HOLD = 7000;
        const EXHALE = 8000;
        const CYCLE_TOTAL = INHALE + HOLD + EXHALE; // 19 seconds per breath

        interface ParticleParams {
            theta: number; // Horizontal angle around Y axis
            phi: number;   // Vertical angle from poles
            baseSize: number;
            color: string;
            speedOffset: number;
            wobbleSpeed: number;
            wobbleRadius: number;
        }

        const particles: ParticleParams[] = [];
        const particleCount = 1800; // Elegant density

        // Fibonacci sphere mapping for beautifully even 3D distribution
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const angleIncrement = Math.PI * 2 * goldenRatio;

        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount;
            const phi = Math.acos(1 - 2 * t);
            const theta = angleIncrement * i;
            
            particles.push({
                theta,
                phi,
                baseSize: Math.max(0.5, Math.random() * 2),
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                speedOffset: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.0005 + Math.random() * 0.001,
                wobbleRadius: Math.random() * 15,
            });
        }

        let startTime = Date.now();
        const render = () => {
            const time = Date.now() - startTime;
            ctx.clearRect(0, 0, width, height);
            
            ctx.globalCompositeOperation = 'lighter'; // Elegant glow blending
            
            // --- Determine 4-7-8 phase ---
            const cycleTime = time % CYCLE_TOTAL;
            let breathFactor = 0; // 0 (contracted) to 1 (expanded)
            let phaseBaseRotationSpeed = 0.0001; 
            
            if (cycleTime < INHALE) {
                // Inhale: smoothly expand
                const progress = cycleTime / INHALE;
                // Elegant cubic ease-in-out
                breathFactor = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                phaseBaseRotationSpeed += progress * 0.0002;
            } else if (cycleTime < INHALE + HOLD) {
                // Hold: stay expanded, vibrate gracefully
                breathFactor = 1;
                phaseBaseRotationSpeed = 0.0003;
            } else {
                // Exhale: deeply relax
                const progress = (cycleTime - INHALE - HOLD) / EXHALE;
                breathFactor = 1 - (progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2);
                phaseBaseRotationSpeed = 0.0003 - progress * 0.0002;
            }

            const maxRadiusBase = Math.min(width, height) * 0.35;
            const baseRadius = maxRadiusBase * 0.7; 
            // The radius physically expands based on the breath
            const currentRadius = baseRadius + (maxRadiusBase * 0.3 * breathFactor);

            // Global elegant slow rotation
            const globalRotX = time * 0.00015;
            const globalRotY = time * phaseBaseRotationSpeed;

            const renderList = [];
            const fov = 1200;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                
                // Add soft organic wobble to individual particles
                const wTheta = p.theta + Math.sin(time * p.wobbleSpeed + p.speedOffset) * 0.05;
                const wPhi = p.phi + Math.cos(time * p.wobbleSpeed + p.speedOffset) * 0.05;

                // Sphere coordinates
                const x3dRaw = currentRadius * Math.sin(wPhi) * Math.cos(wTheta);
                const y3dRaw = currentRadius * Math.cos(wPhi);
                const z3dRaw = currentRadius * Math.sin(wPhi) * Math.sin(wTheta);

                // Apply global rotation
                // Rotate around X
                const x1 = x3dRaw;
                const y1 = y3dRaw * Math.cos(globalRotX) - z3dRaw * Math.sin(globalRotX);
                const z1 = y3dRaw * Math.sin(globalRotX) + z3dRaw * Math.cos(globalRotX);
                
                // Rotate around Y
                const x2 = x1 * Math.cos(globalRotY) + z1 * Math.sin(globalRotY);
                const y2 = y1;
                const z2 = -x1 * Math.sin(globalRotY) + z1 * Math.cos(globalRotY);

                // 2D projection
                const scale = fov / (fov + z2);
                const x2d = width / 2 + x2 * scale;
                const y2d = height / 2 + y2 * scale;

                renderList.push({
                    x: x2d, y: y2d, z: z2, p, scale
                });
            }

            // Painter's algorithm for proper 3D depth and glow
            renderList.sort((a, b) => b.z - a.z);

            for (let i = 0; i < renderList.length; i++) {
                const { x, y, z, p, scale } = renderList[i];
                
                // Deep elegance: particles in the back are dimmer and blurrier (represented by opacity)
                // Particles in front are crisp
                const distanceFog = Math.max(0.05, 1 - (z + currentRadius) / (2 * currentRadius));
                
                // Particles glow brighter when fully inhaled
                const breathGlow = 0.5 + 0.5 * breathFactor;

                ctx.beginPath();
                ctx.arc(x, y, p.baseSize * scale * breathGlow, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = distanceFog * breathGlow * 0.8;
                ctx.fill();
            }

            // Central core aura that breathes
            const coreRadius = currentRadius * 0.9;
            const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, coreRadius);
            gradient.addColorStop(0, \`rgba(192, 132, 252, \${0.05 + breathFactor * 0.1})\`); // Gentle purple core
            gradient.addColorStop(0.5, \`rgba(129, 140, 248, \${0.02 + breathFactor * 0.05})\`); // Fades to indigo
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.arc(width/2, height/2, coreRadius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.globalCompositeOperation = 'source-over'; // render core aura naturally behind or over
            ctx.fill();

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', setCanvasSize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <motion.canvas 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1.5, ease: "easeInOut" } }}
            ref={canvasRef} 
            className="fixed inset-0 z-0 pointer-events-none" 
        />
    );
};`;

content = content.replace("/* PLACEHOLDER */", newCanvasContent);
fs.writeFileSync(path, content, 'utf8');
console.log('Restored 4-7-8 breathing canvas with maximum elegance and Fibonacci distribution.');
