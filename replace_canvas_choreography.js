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

        const particleCount = 1500; 
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
                baseSize: Math.max(1.5, Math.random() * 4.5),
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                
                state: 'FLYING_IN',
                spawnTime: freshSpawn ? Date.now() : Date.now() + Math.random() * 2000, 
                flightDuration: 1000 + Math.random() * 800,
                
                suckStartTime: 0,
                suckDuration: 800 + Math.random() * 600,
            };
        };

        for (let i = 0; i < particleCount; i++) {
            particles.push(initParticle(i, false));
        }

        let sysStartTime = Date.now();
        
        const render = () => {
            const now = Date.now();
            const elapsed = now - sysStartTime;
            ctx.clearRect(0, 0, width, height);

            ctx.globalCompositeOperation = 'lighter'; 
            
            const cycleTime = elapsed % CYCLE_TOTAL;
            let breathFactor = 0; 
            let absorbTrigger = false;
            
            if (cycleTime < INHALE) {
                const p = cycleTime / INHALE;
                breathFactor = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                if (p > 0.1 && p < 0.9) absorbTrigger = true;
            } else if (cycleTime < INHALE + HOLD) {
                breathFactor = 1;
            } else {
                const p = (cycleTime - INHALE - HOLD) / EXHALE;
                breathFactor = 1 - (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
            }

            const minRadius = Math.min(width, height) * 0.4;
            const maxRadius = Math.max(width, height) * 1.5; 
            const currentRadius = minRadius + (maxRadius - minRadius) * breathFactor;

            const rotX = elapsed * 0.00015;
            const rotY = elapsed * 0.0003 + breathFactor * 0.4; 
            
            const fov = 1200;
            const renderList = [];

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                let currentX = width / 2;
                let currentY = height / 2;
                let zCoord = 0;
                let pScale = 1;
                let alphaMod = 1;
                
                const age = now - p.spawnTime;
                
                if (age < 0) {
                    continue; // Pending spawn
                } else if (age < p.flightDuration) {
                    // PHAS 1: Spray from Bottom Right dynamically to Center
                    const t = age / p.flightDuration;
                    const easedT = 1 - Math.pow(1 - t, 3);
                    const invT = 1 - easedT;
                    
                    const p0X = width;
                    const p0Y = height;
                    const p2X = width / 2;
                    const p2Y = height / 2;
                    
                    // Arc trajectory 
                    const bCtrlX = width * 0.8;
                    const bCtrlY = height + 100;

                    currentX = invT * invT * p0X + 2 * invT * easedT * bCtrlX + easedT * easedT * p2X;
                    currentY = invT * invT * p0Y + 2 * invT * easedT * bCtrlY + easedT * easedT * p2Y;
                    
                    alphaMod = t; 
                    zCoord = 100; // Fly slightly in foreground
                } else {
                    // PHASE 2 & 3: Orbiting and Diffusing
                    if (p.state === 'FLYING_IN') p.state = 'ORBITING';
                    
                    let rOrbit = currentRadius;
                    
                    // State Transition logic
                    if (p.state === 'ORBITING' && absorbTrigger && Math.random() < 0.005) {
                        p.state = 'SUCKED';
                        p.suckStartTime = now;
                    }
                    
                    const diffuseAge = age - p.flightDuration;
                    const diffuseDuration = 1500;
                    
                    if (p.state === 'SUCKED') {
                        const suckProg = Math.min(1, (now - p.suckStartTime) / p.suckDuration);
                        const suckEase = suckProg * suckProg * suckProg;
                        rOrbit = currentRadius * (1 - suckEase);
                        
                        if (suckProg >= 1) {
                            particles[i] = initParticle(p.id, true);
                            continue;
                        }
                    } else {
                        // Smooth diffuse from center to their 3D shell radius
                        if (diffuseAge < diffuseDuration) {
                            const diffT = diffuseAge / diffuseDuration;
                            rOrbit = currentRadius * (1 - Math.pow(1 - diffT, 3));
                        }
                    }

                    // 3D calculation
                    const x3d = rOrbit * Math.sin(p.phi) * Math.cos(p.theta);
                    const y3d = rOrbit * Math.cos(p.phi);
                    const z3d = rOrbit * Math.sin(p.phi) * Math.sin(p.theta);

                    const x1 = x3d;
                    const y1 = y3d * Math.cos(rotX) - z3d * Math.sin(rotX);
                    const z1 = y3d * Math.sin(rotX) + z3d * Math.cos(rotX);
                    
                    const x2 = x1 * Math.cos(rotY) + z1 * Math.sin(rotY);
                    const y2 = y1;
                    const z2 = -x1 * Math.sin(rotY) + z1 * Math.cos(rotY);
                    
                    if (fov + z2 <= 10) continue; 

                    pScale = fov / (fov + z2);
                    currentX = width / 2 + x2 * pScale;
                    currentY = height / 2 + y2 * pScale;
                    zCoord = z2;
                }

                renderList.push({
                    x: currentX, y: currentY, z: zCoord, p, scale: pScale, alphaMod
                });
            }

            renderList.sort((a, b) => b.z - a.z);

            for (let i = 0; i < renderList.length; i++) {
                const { x, y, z, p, scale, alphaMod } = renderList[i];
                const depthAlpha = Math.max(0.1, 1 - (z + currentRadius) / (2 * currentRadius));
                const breathGlow = 0.6 + 0.4 * breathFactor;

                ctx.beginPath();
                ctx.arc(x, y, p.baseSize * scale * breathGlow, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = depthAlpha * alphaMod * breathGlow * 0.9;
                ctx.fill();
            }

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
console.log('Restored choreography: Base -> Spray to Center -> Bloom into 4-7-8 Breathing Sphere.');
