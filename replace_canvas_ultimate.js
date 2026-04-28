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
        
        // 4-7-8 Breathing Cycle
        const INHALE = 4000;
        const HOLD = 7000;
        const EXHALE = 8000;
        const CYCLE_TOTAL = INHALE + HOLD + EXHALE; 

        const particleCount = 1500; // Optimal density for large particles
        // Fibonacci map
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const angleIncrement = Math.PI * 2 * goldenRatio;

        const particles: any[] = [];
        
        const initParticle = (i: number, freshSpawn: boolean) => {
            const t = i / particleCount;
            const phi = Math.acos(1 - 2 * t);
            const theta = angleIncrement * i;

            return {
                id: i,
                theta,
                phi,
                baseSize: Math.max(1.5, Math.random() * 4.5), // Larger particles
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                
                state: 'FLYING_IN',
                spawnTime: Date.now() + (freshSpawn ? 0 : Math.random() * 4000), // Randomize initial spray
                flightDuration: 2000 + Math.random() * 1500,
                
                // Sucking animation params
                suckStartTime: 0,
                suckDuration: 800 + Math.random() * 600,
            };
        };

        for (let i = 0; i < particleCount; i++) {
            particles.push(initParticle(i, false));
        }

        let startTime = Date.now();
        
        const render = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            ctx.clearRect(0, 0, width, height);

            ctx.globalCompositeOperation = 'lighter'; 
            
            // Generate cycle phase
            const cycleTime = elapsed % CYCLE_TOTAL;
            let breathFactor = 0; 
            let absorbTrigger = false;
            
            if (cycleTime < INHALE) {
                // Inhale: massive expansion
                const p = cycleTime / INHALE;
                breathFactor = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                
                // Allow particles to be sucked in smoothly during inhale phase
                if (p > 0.1 && p < 0.9) absorbTrigger = true;
            } else if (cycleTime < INHALE + HOLD) {
                breathFactor = 1;
            } else {
                const p = (cycleTime - INHALE - HOLD) / EXHALE;
                breathFactor = 1 - (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
            }

            // Radius parameters (expands massively off screen)
            const minRadius = Math.min(width, height) * 0.4;
            const maxRadius = Math.max(width, height) * 1.5; // Huge overflow
            const currentRadius = minRadius + (maxRadius - minRadius) * breathFactor;

            // Global rotation
            const rotX = elapsed * 0.00015;
            const rotY = elapsed * 0.0003 + breathFactor * 0.4; // Rotates heavily as it breathes
            
            const fov = 1200;
            const renderList = [];

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                
                // Calculate ideal 3D orbiting point
                let rOrbit = currentRadius;
                
                // SUCK logic
                if (p.state === 'ORBITING') {
                    if (absorbTrigger && Math.random() < 0.005) {
                        p.state = 'SUCKED';
                        p.suckStartTime = now;
                    }
                }

                let alphaMod = 1;
                
                if (p.state === 'SUCKED') {
                    const prog = Math.min(1, (now - p.suckStartTime) / p.suckDuration);
                    const easeIn = prog * prog * prog;
                    // Shrink radius to 0 (core)
                    rOrbit = currentRadius * (1 - easeIn);
                    
                    if (prog >= 1) {
                        // Reached center, respawn to stream out of bottom right again
                        particles[i] = initParticle(p.id, true);
                        continue;
                    }
                }

                const x3d = rOrbit * Math.sin(p.phi) * Math.cos(p.theta);
                const y3d = rOrbit * Math.cos(p.phi);
                const z3d = rOrbit * Math.sin(p.phi) * Math.sin(p.theta);

                // Rotate X
                const x1 = x3d;
                const y1 = y3d * Math.cos(rotX) - z3d * Math.sin(rotX);
                const z1 = y3d * Math.sin(rotX) + z3d * Math.cos(rotX);
                
                // Rotate Y
                const x2 = x1 * Math.cos(rotY) + z1 * Math.sin(rotY);
                const y2 = y1;
                const z2 = -x1 * Math.sin(rotY) + z1 * Math.cos(rotY);

                const scale = fov / (fov + z2);
                let targetX = width / 2 + x2 * scale;
                let targetY = height / 2 + y2 * scale;

                let currentX = targetX;
                let currentY = targetY;

                // FLYING IN logic: Bezier tracking to target point
                if (p.state === 'FLYING_IN') {
                    if (now < p.spawnTime) continue; // wait for delay
                    
                    let flyProg = (now - p.spawnTime) / p.flightDuration;
                    if (flyProg >= 1) {
                        p.state = 'ORBITING';
                    } else {
                        // Smooth cubic ease out
                        const t = 1 - Math.pow(1 - flyProg, 3);
                        const invT = 1 - t;
                        
                        // Bezier starting at bottom-right
                        const bStartX = width;
                        const bStartY = height;
                        
                        // Control point pulled outwards and left to arc across screen
                        const bCtrlX = width * 0.7;
                        const bCtrlY = height + 100;

                        currentX = invT * invT * bStartX + 2 * invT * t * bCtrlX + t * t * targetX;
                        currentY = invT * invT * bStartY + 2 * invT * t * bCtrlY + t * t * targetY;
                        
                        alphaMod = t; // Fade in as it flies
                    }
                }

                renderList.push({
                    x: currentX, y: currentY, z: z2, p, scale, alphaMod
                });
            }

            // Painter's algorithm
            renderList.sort((a, b) => b.z - a.z);

            for (let i = 0; i < renderList.length; i++) {
                const { x, y, z, p, scale, alphaMod } = renderList[i];
                
                const depthAlpha = Math.max(0.1, 1 - (z + currentRadius) / (2 * currentRadius));
                // Pulsate lightly with breath
                const breathGlow = 0.6 + 0.4 * breathFactor;

                ctx.beginPath();
                ctx.arc(x, y, p.baseSize * scale * breathGlow, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = depthAlpha * alphaMod * breathGlow * 0.9;
                ctx.fill();
            }

            // Subtle glowing energy core acting as the sucking sink
            if (absorbTrigger) {
                const coreGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width*0.1);
                coreGlow.addColorStop(0, \`rgba(255, 255, 255, \${0.1 * breathFactor})\`);
                coreGlow.addColorStop(1, \`rgba(192, 132, 252, 0)\`);
                ctx.beginPath();
                ctx.arc(width/2, height/2, width*0.1, 0, Math.PI * 2);
                ctx.fillStyle = coreGlow;
                ctx.globalCompositeOperation = 'screen';
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
console.log('Restored the ultimate generation component: bottom-right spray, massive 3d rotation, 4-7-8 breathing overflow, and center-hit gravity sink!');
