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

        const themeColors = colors || ['#0ea5e9', '#38bdf8', '#818cf8', '#a78bfa', '#e2e8f0', '#ffffff'];
        
        // 4-7-8 Breathing Cycle
        const INHALE = 4000;
        const HOLD = 7000;
        const EXHALE = 8000;
        const CYCLE_TOTAL = INHALE + HOLD + EXHALE; // 19 seconds
        const ENTRANCE_DURATION = 1500; // 1.5s chaotic dust to perfect sphere

        const particleCount = 1800;
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const angleIncrement = Math.PI * 2 * goldenRatio;

        interface Particle {
            theta: number;
            phi: number;
            baseSize: number;
            color: string;
            wThetaOffset: number;
            wPhiOffset: number;
            wSpeed: number;
            initX: number;
            initY: number;
            initZ: number;
        }

        const particles: Particle[] = [];
        
        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount;
            const phi = Math.acos(1 - 2 * t);
            const theta = angleIncrement * i;

            // Give them a completely random origin in a HUGE spherical volume for the "diffuse" look
            const dist = Math.max(width, height) * (0.8 + Math.random() * 1.5);
            const randomPhi = Math.acos(1 - 2 * Math.random());
            const randomTheta = Math.random() * Math.PI * 2;

            particles.push({
                theta,
                phi,
                baseSize: Math.max(2.5, Math.random() * 5.0), 
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                wThetaOffset: Math.random() * Math.PI * 2,
                wPhiOffset: Math.random() * Math.PI * 2,
                wSpeed: 0.0005 + Math.random() * 0.0008,
                initX: dist * Math.sin(randomPhi) * Math.cos(randomTheta),
                initY: dist * Math.cos(randomPhi),
                initZ: dist * Math.sin(randomPhi) * Math.sin(randomTheta),
            });
        }

        let startTime = Date.now();
        
        const render = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter'; 
            
            const minRadius = Math.min(width, height) * 0.35;
            const maxRadius = Math.min(width, height) * 0.8; 
            
            let breathFactor = 0; 
            let entranceAlphaMod = 1;
            let currentRadius = minRadius;
            let easeT = 1;

            if (elapsed < ENTRANCE_DURATION) {
                // 1.5s Phase: Condense from massive chaotic cloud directly into the sphere matrix
                const t = elapsed / ENTRANCE_DURATION;
                entranceAlphaMod = t < 0.3 ? (t / 0.3) : 1; 
                // Using an explosive ease-out for snapping into place
                easeT = 1 - Math.pow(1 - t, 4); 
            } else {
                // 4-7-8 Breathing Phase (Starts smoothly after ENTRANCE)
                const cycleTime = (elapsed - ENTRANCE_DURATION) % CYCLE_TOTAL;
                
                if (cycleTime < INHALE) {
                    const p = cycleTime / INHALE;
                    breathFactor = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                } else if (cycleTime < INHALE + HOLD) {
                    breathFactor = 1;
                } else {
                    const p = (cycleTime - INHALE - HOLD) / EXHALE;
                    breathFactor = 1 - (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
                }
                currentRadius = minRadius + (maxRadius - minRadius) * breathFactor;
            }

            // Deep Rotation Logic
            const rotX = elapsed * 0.0001;
            const rotY = elapsed * 0.00025 + breathFactor * 0.5;
            
            const fov = 1500;
            const renderList = [];

            // Compute 3D transforms
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                const wTheta = p.theta + Math.sin(elapsed * p.wSpeed + p.wThetaOffset) * 0.03;
                const wPhi = p.phi + Math.cos(elapsed * p.wSpeed + p.wPhiOffset) * 0.03;

                // The majestic Fibonacci target coordinate
                const tX = currentRadius * Math.sin(wPhi) * Math.cos(wTheta);
                const tY = currentRadius * Math.cos(wPhi);
                const tZ = currentRadius * Math.sin(wPhi) * Math.sin(wTheta);

                // Interpolate from chaotic diffuse cloud -> perfect target coordinate
                let x3d = p.initX * (1 - easeT) + tX * easeT;
                let y3d = p.initY * (1 - easeT) + tY * easeT;
                let z3d = p.initZ * (1 - easeT) + tZ * easeT;

                const x1 = x3d;
                const y1 = y3d * Math.cos(rotX) - z3d * Math.sin(rotX);
                const z1 = y3d * Math.sin(rotX) + z3d * Math.cos(rotX);
                
                const x2 = x1 * Math.cos(rotY) + z1 * Math.sin(rotY);
                const y2 = y1;
                const z2 = -x1 * Math.sin(rotY) + z1 * Math.cos(rotY);
                
                if (fov + z2 <= 20) continue; 

                const scale = fov / (fov + z2);
                const currentX = width / 2 + x2 * scale;
                const currentY = height / 2 + y2 * scale;

                renderList.push({
                    x: currentX, y: currentY, z: z2, p, scale
                });
            }

            renderList.sort((a, b) => b.z - a.z);

            // Render
            for (let i = 0; i < renderList.length; i++) {
                const { x, y, z, p, scale } = renderList[i];
                
                const depthAlpha = Math.max(0.05, 1 - (z + currentRadius) / (2 * currentRadius));
                const breathGlow = 0.5 + 0.5 * breathFactor;

                ctx.beginPath();
                ctx.arc(x, y, p.baseSize * scale * breathGlow, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = depthAlpha * breathGlow * 0.9 * entranceAlphaMod;
                ctx.fill();
            }

            const coreOpacity = (0.05 + 0.1 * breathFactor) * entranceAlphaMod;
            if (coreOpacity > 0.01) {
                const coreGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, currentRadius * 0.8);
                coreGlow.addColorStop(0, \`rgba(139, 92, 246, \${coreOpacity})\`);
                coreGlow.addColorStop(0.5, \`rgba(56, 189, 248, \${coreOpacity * 0.4})\`);
                coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalCompositeOperation = 'source-over';
                ctx.beginPath();
                ctx.arc(width/2, height/2, currentRadius * 0.8, 0, Math.PI * 2);
                ctx.fillStyle = coreGlow;
                ctx.fill();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', setCanvasSize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    // Astonishing Exit Animation via Framer Motion 
    return (
        <motion.canvas 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 3.5, filter: "blur(30px)", transition: { duration: 1.2, ease: [0.32, 0, 0.67, 0] } }}
            ref={canvasRef} 
            className="fixed inset-0 z-0 pointer-events-none" 
        />
    );
};`;

content = content.replace(regexCanvas, newCanvasContent);
fs.writeFileSync(path, content, 'utf8');
console.log('Restored entrance matrix locking logic.');
