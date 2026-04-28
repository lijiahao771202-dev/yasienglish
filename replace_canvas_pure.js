const fs = require('fs');
const path = 'src/components/reading/GenerationOverlay.tsx';
let content = fs.readFileSync(path, 'utf8');

const regexCanvas = /export const CanvasBreathingParticles = \(\{\s*colors\s*\}\s*:\s*\{\s*colors\?:\s*string\[\]\s*\}\) => \{[\s\S]*?\n\};/g;

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
        
        // Pure 4-7-8 Rotating Breathing Engine
        const INHALE = 4000;
        const HOLD = 7000;
        const EXHALE = 8000;
        const CYCLE_TOTAL = INHALE + HOLD + EXHALE; // 19 seconds

        const particleCount = 1800;
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const angleIncrement = Math.PI * 2 * goldenRatio;

        interface Particle {
            theta: number;
            phi: number;
            baseSize: number;
            color: string;
            // Wobble offsets for organic non-rigid feel
            wThetaOffset: number;
            wPhiOffset: number;
            wSpeed: number;
        }

        const particles: Particle[] = [];
        
        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount;
            const phi = Math.acos(1 - 2 * t);
            const theta = angleIncrement * i;

            particles.push({
                theta,
                phi,
                baseSize: Math.max(1.0, Math.random() * 3.5),
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                wThetaOffset: Math.random() * Math.PI * 2,
                wPhiOffset: Math.random() * Math.PI * 2,
                wSpeed: 0.0005 + Math.random() * 0.0008,
            });
        }

        let startTime = Date.now();
        
        const render = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter'; 
            
            // Phase Mapping
            const cycleTime = elapsed % CYCLE_TOTAL;
            let breathFactor = 0; 
            
            if (cycleTime < INHALE) {
                const p = cycleTime / INHALE;
                breathFactor = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            } else if (cycleTime < INHALE + HOLD) {
                breathFactor = 1;
            } else {
                const p = (cycleTime - INHALE - HOLD) / EXHALE;
                breathFactor = 1 - (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
            }

            // High-End Massive Scale mapping
            // At breathFactor 0 it's comfortably inside the screen
            // At breathFactor 1 it spills heavily off-screen to immerse the user
            const minRadius = Math.min(width, height) * 0.35;
            const maxRadius = Math.max(width, height) * 1.5; 
            const currentRadius = minRadius + (maxRadius - minRadius) * breathFactor;

            // Deep Rotation Logic (Faster when expanding)
            const rotX = elapsed * 0.0001;
            const rotY = elapsed * 0.00025 + breathFactor * 0.5; // Spins into the breath
            
            const fov = 1500;
            const renderList = [];

            // Compute 3D transforms
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                
                // Add organic micro-wobble so it's not a rigid glass ball
                const wTheta = p.theta + Math.sin(elapsed * p.wSpeed + p.wThetaOffset) * 0.03;
                const wPhi = p.phi + Math.cos(elapsed * p.wSpeed + p.wPhiOffset) * 0.03;

                const x3d = currentRadius * Math.sin(wPhi) * Math.cos(wTheta);
                const y3d = currentRadius * Math.cos(wPhi);
                const z3d = currentRadius * Math.sin(wPhi) * Math.sin(wTheta);

                // Rotate around X
                const x1 = x3d;
                const y1 = y3d * Math.cos(rotX) - z3d * Math.sin(rotX);
                const z1 = y3d * Math.sin(rotX) + z3d * Math.cos(rotX);
                
                // Rotate around Y
                const x2 = x1 * Math.cos(rotY) + z1 * Math.sin(rotY);
                const y2 = y1;
                const z2 = -x1 * Math.sin(rotY) + z1 * Math.cos(rotY);
                
                // Depth clipping to prevent camera inversion and Math scale bugs
                if (fov + z2 <= 20) continue; 

                const scale = fov / (fov + z2);
                const currentX = width / 2 + x2 * scale;
                const currentY = height / 2 + y2 * scale;

                renderList.push({
                    x: currentX, y: currentY, z: z2, p, scale
                });
            }

            // Depth sorting (painter's algorithm)
            renderList.sort((a, b) => b.z - a.z);

            // Render
            for (let i = 0; i < renderList.length; i++) {
                const { x, y, z, p, scale } = renderList[i];
                
                const depthAlpha = Math.max(0.05, 1 - (z + currentRadius) / (2 * currentRadius));
                // Add slight luminesence tied to breath
                const breathGlow = 0.5 + 0.5 * breathFactor;

                ctx.beginPath();
                ctx.arc(x, y, p.baseSize * scale * breathGlow, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = depthAlpha * breathGlow * 0.9;
                ctx.fill();
            }

            // Elegant background core aura
            const coreGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, currentRadius * 0.8);
            coreGlow.addColorStop(0, \`rgba(192, 132, 252, \${0.08 + 0.1 * breathFactor})\`);
            coreGlow.addColorStop(0.5, \`rgba(129, 140, 248, \${0.03 + 0.05 * breathFactor})\`);
            coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath();
            ctx.arc(width/2, height/2, currentRadius * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = coreGlow;
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

content = content.replace(regexCanvas, newCanvasContent);
fs.writeFileSync(path, content, 'utf8');
console.log('Restored pure 4-7-8 rotating geometry without messy spray animations.');
