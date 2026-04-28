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

        const themeColors = colors || ['#f472b6', '#c084fc', '#38bdf8', '#818cf8', '#ffffff'];
        
        const particleCount = 2000;
        const particles: any[] = [];
        
        const maxDist = Math.hypot(width, height) * 1.5;
        
        // Initialize particle pool mapping lifetimes randomly to avoid initial bursts
        for (let i = 0; i < particleCount; i++) {
            particles.push(createParticle(true));
        }

        function createParticle(initial = false) {
            // Originates exactly at bottom right
            const p0x = width;
            const p0y = height;
            
            // Fires out in an angle covering the whole screen
            // Bottom right to upper left -> angle ranges from PI to 1.5 PI approximately. 
            // We expand it slightly beyond that for full diffusion.
            const angle = Math.PI + Math.random() * (Math.PI / 2); 
            const dist = maxDist * (0.5 + Math.random() * 0.8);
            
            const p2x = p0x + Math.cos(angle) * dist;
            const p2y = p0y + Math.sin(angle) * dist;
            
            // To create the 'bezier rotational motion', the control point is pulled heavily
            // perpendicular to the trajectory. Randomize polarity to weave and braid them.
            const dx = p2x - p0x;
            const dy = p2y - p0y;
            const linDist = Math.hypot(dx, dy);
            const midX = p0x + dx * 0.4; // control point slightly shifted closer to origin for explosive sweeping curves
            const midY = p0y + dy * 0.4;
            
            const nx = -dy / linDist;
            const ny = dx / linDist;
            
            // Stronger curve = more rotational feel
            const polarity = (Math.random() > 0.5 ? 1 : -1);
            const curveStrength = Math.random() * linDist * 0.8;
            
            const p1x = midX + nx * curveStrength * polarity;
            const p1y = midY + ny * curveStrength * polarity;

            const maxLife = 3000 + Math.random() * 4000;

            return {
                p0: { x: p0x, y: p0y },
                p1: { x: p1x, y: p1y },
                p2: { x: p2x, y: p2y },
                size: Math.random() * 1.5 + 0.5,
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                life: initial ? Math.random() * maxLife : 0, 
                maxLife,
                // Give particles their own spin logic if desired
                orbitPhase: Math.random() * Math.PI * 2,
                orbitSpeed: (Math.random() - 0.5) * 5
            };
        }

        let lastTime = Date.now();
        const startTime = lastTime;

        const render = () => {
            const now = Date.now();
            const delta = now - lastTime;
            lastTime = now;
            const elapsedGlobal = now - startTime;

            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';
            
            // Apply a slight global rotation effect to the bezier points over time to make the whole spray "wave/swirl"
            const swirlWaveX = Math.sin(elapsedGlobal * 0.0005) * width * 0.3;
            const swirlWaveY = Math.cos(elapsedGlobal * 0.0005) * height * 0.3;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.life += delta;
                
                if (p.life >= p.maxLife) {
                    particles[i] = createParticle();
                    continue;
                }

                // t is how far along the curve the particle is (0 to 1)
                // Use ease-out logic so it bursts from bottom-right, then gracefully slows down into the deep background
                let progress = p.life / p.maxLife;
                const t = 1 - Math.pow(1 - progress, 3); // cubic ease-out
                const invT = 1 - t;
                
                // Add the swirling global warp to control point (p1) to rotate the spray dynamically
                const warpedP1X = p.p1.x + swirlWaveX * progress;
                const warpedP1Y = p.p1.y + swirlWaveY * progress;

                // Bezier quadratic calculation
                const currentX = invT * invT * p.p0.x + 2 * invT * t * warpedP1X + t * t * p.p2.x;
                const currentY = invT * invT * p.p0.y + 2 * invT * t * warpedP1Y + t * t * p.p2.y;
                
                // Alpha logic: sharp fade in at start, slow fade out at end
                let alpha = 1;
                if (progress < 0.1) {
                    alpha = progress * 10;
                } else if (progress > 0.6) {
                    alpha = 1 - ((progress - 0.6) / 0.4);
                }
                
                // Optional orbital perturbation (贝塞尔旋转运动)
                p.orbitPhase += p.orbitSpeed * (delta / 1000);
                const orbitR = progress * 10; // orbit radius gets slightly wider
                const px = currentX + Math.cos(p.orbitPhase) * orbitR;
                const py = currentY + Math.sin(p.orbitPhase) * orbitR;

                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, alpha);
                ctx.fill();
            }

            // High aesthetic bottom-right origin glow
            const originPulse = 0.5 + 0.5 * Math.sin(elapsedGlobal * 0.002);
            const gradient = ctx.createRadialGradient(width, height, 0, width, height, 400);
            gradient.addColorStop(0, \`rgba(232, 121, 249, \${0.25 + 0.15 * originPulse})\`);
            gradient.addColorStop(0.3, \`rgba(129, 140, 248, \${0.1 + 0.05 * originPulse})\`);
            gradient.addColorStop(1, 'rgba(129, 140, 248, 0)');
            
            ctx.beginPath();
            ctx.arc(width, height, 400, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
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
            exit={{ opacity: 0, transition: { duration: 1.5 } }}
            ref={canvasRef} 
            className="fixed inset-0 z-0 pointer-events-none" 
        />
    );
};`;

content = content.replace(regexCanvas, newCanvasContent);
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully applied infinite bottom-right bezier spray engine!');
