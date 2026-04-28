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

        const themeColors = colors || ['#e879f9', '#818cf8', '#38bdf8', '#c084fc', '#ffffff', '#2dd4bf'];
        
        const particleCount = 2000;
        const particles: any[] = [];
        
        for (let i = 0; i < particleCount; i++) {
            const p0x = width;
            const p0y = height;
            
            // Random target spanning across the screen
            const p2x = Math.random() * width;
            const p2y = Math.random() * height;
            
            // Calculate a beautiful quadratic bezier curve control point
            const dx = p2x - p0x;
            const dy = p2y - p0y;
            const dist = Math.hypot(dx, dy);
            const midX = (p0x + p2x) / 2;
            const midY = (p0y + p2y) / 2;
            
            const nx = -dy / dist;
            const ny = dx / dist;
            
            // Randomly arc strongly outward to fill the screen gracefully
            const curveDirection = Math.random() > 0.5 ? 1 : -1;
            const curveMagnitude = (0.2 + Math.random() * 0.6) * dist;
            
            const p1x = midX + nx * curveMagnitude * curveDirection;
            const p1y = midY + ny * curveMagnitude * curveDirection;

            const delay = Math.random() * 4000; // Emit over 4 seconds
            const duration = 2500 + Math.random() * 2500; // Takes 2.5s to 5s to arrive

            particles.push({
                p0: { x: p0x, y: p0y },
                p1: { x: p1x, y: p1y },
                p2: { x: p2x, y: p2y },
                delay,
                duration,
                size: Math.random() * 2 + 0.5,
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                
                // Floating post-arrival mechanics
                floatAngle: Math.random() * Math.PI * 2,
                floatSpeed: (Math.random() - 0.5) * 0.001,
                floatRadius: Math.random() * 40 + 10,
                
                // Track state
                arrived: false
            });
        }

        const startTime = Date.now();
        const render = () => {
            const time = Date.now() - startTime;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';
            
            const globalRot = time * 0.0001; // slow full-screen rotation

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (time < p.delay) continue;
                
                let currentX, currentY;
                let alpha = 0;
                
                const t = (time - p.delay) / p.duration;
                
                if (t >= 1) {
                    p.arrived = true;
                }
                
                if (!p.arrived) {
                    // Easing out the movement so they decelerate nicely at their destination
                    const easedT = 1 - Math.pow(1 - t, 3);
                    const invT = 1 - easedT;
                    
                    // Quadratic bezier
                    currentX = invT * invT * p.p0.x + 2 * invT * easedT * p.p1.x + easedT * easedT * p.p2.x;
                    currentY = invT * invT * p.p0.y + 2 * invT * easedT * p.p1.y + easedT * easedT * p.p2.y;
                    
                    // Fade in while moving
                    alpha = Math.min(1, t * 5); 
                } else {
                    // arrived phase: float and rotate gently
                    const postArrivalT = time - p.delay - p.duration;
                    const cAngle = p.floatAngle + postArrivalT * p.floatSpeed + globalRot;
                    
                    currentX = p.p2.x + Math.cos(cAngle) * p.floatRadius;
                    currentY = p.p2.y + Math.sin(cAngle) * p.floatRadius;
                    
                    alpha = 1;
                    
                    // Optional gentle breathing in opacity/size
                    alpha = 0.6 + 0.4 * Math.sin(postArrivalT * 0.002 + p.floatAngle);
                }

                ctx.beginPath();
                ctx.arc(currentX, currentY, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha;
                ctx.fill();
            }

            // Optional: Draw a core glow in the bottom right while particles emit
            if (time < 6000) {
                const emitProgress = Math.max(0, 1 - time / 6000);
                const gradient = ctx.createRadialGradient(width, height, 0, width, height, 300);
                gradient.addColorStop(0, \`rgba(232, 121, 249, \${0.3 * emitProgress})\`);
                gradient.addColorStop(1, 'rgba(129, 140, 248, 0)');
                
                ctx.beginPath();
                ctx.arc(width, height, 300, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.globalAlpha = emitProgress;
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
            exit={{ opacity: 0, transition: { duration: 1.5 } }}
            ref={canvasRef} 
            className="fixed inset-0 z-0 pointer-events-none" 
        />
    );
};`;

content = content.replace(regexCanvas, newCanvasContent);
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully replaced canvas with bottom-right bezier curved expanding particles!');
