const fs = require('fs');
const path = 'src/components/reading/GenerationOverlay.tsx';
let content = fs.readFileSync(path, 'utf8');

const regexCanvas = /export const CanvasBreathingParticles = \(\{\s*colors\s*\}\s*:\s*\{\s*colors\?:\s*string\[\]\s*\}\) => \{[\s\S]*?\n\};/g;

const newCanvasContent = `export const CanvasBreathingParticles = () => {
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

        // Apple Intelligence / Liquid Aura style parameters
        const orbs = [
            { color: '217, 70, 239',  rMulti: 1.2, fX: 0.00032, fY: 0.00041, pX: 0.0, pY: 1.0, swing: 0.4 }, // Fuchsia
            { color: '99, 102, 241',  rMulti: 1.4, fX: 0.00021, fY: 0.00035, pX: 2.0, pY: 3.5, swing: 0.5 }, // Indigo
            { color: '56, 189, 248',  rMulti: 1.0, fX: 0.00045, fY: 0.00028, pX: 1.5, pY: 4.2, swing: 0.3 }, // Cyan
            { color: '139, 92, 246',  rMulti: 1.3, fX: 0.00038, fY: 0.00049, pX: 3.1, pY: 2.2, swing: 0.45}, // Violet
        ];

        const particleRings: any[] = [];
        for(let i=0; i<150; i++) {
            particleRings.push({
                angle: Math.random() * Math.PI * 2,
                radius: 0.4 + Math.random() * 0.4, // Percentage of screen
                speed: (Math.random() - 0.5) * 0.0005,
                size: Math.random() * 2,
                alphaPhase: Math.random() * Math.PI * 2,
            });
        }

        const startTime = Date.now();
        const render = () => {
            const time = Date.now() - startTime;
            ctx.clearRect(0, 0, width, height);
            
            // Tension pulse: a powerful "heartbeat" expansion every 4 seconds
            const cycle = (time % 4000) / 4000;
            const pulse = Math.pow(Math.sin(cycle * Math.PI), 12); // Extreme sharp spike
            const baseScale = 1 + pulse * 0.15; // Jumps 15% in size sharply, then decays smoothly

            const cx = width / 2;
            const cy = height / 2;
            const baseRadius = Math.min(width, height) * 0.4;

            ctx.globalCompositeOperation = 'lighter';

            // Draw the liquid, morphing core
            for (let i = 0; i < orbs.length; i++) {
                const orb = orbs[i];
                // Smooth Lissajous curve wandering
                const x = cx + Math.sin(time * orb.fX + orb.pX) * (baseRadius * orb.swing);
                const y = cy + Math.cos(time * orb.fY + orb.pY) * (baseRadius * orb.swing);
                
                const r = baseRadius * orb.rMulti * baseScale;
                
                // Opacity pulses slightly for extra organic tension
                const alpha = 0.5 + 0.3 * Math.sin(time * 0.001 + i);
                
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
                gradient.addColorStop(0, \`rgba(\${orb.color}, \${alpha})\`);
                gradient.addColorStop(0.5, \`rgba(\${orb.color}, \${alpha * 0.3})\`);
                gradient.addColorStop(1, \`rgba(\${orb.color}, 0)\`);
                
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
            }

            // Draw extremely sharp, minimal orbiting data dust
            ctx.globalCompositeOperation = 'screen';
            ctx.lineWidth = 1;
            
            // Central minimal geometric focal ring
            ctx.beginPath();
            ctx.arc(cx, cy, baseRadius * 0.8 * baseScale, 0, Math.PI * 2);
            ctx.strokeStyle = \`rgba(255, 255, 255, \${0.05 + pulse * 0.2})\`; // Flashes subtly with beat
            ctx.stroke();

            // Particles trapped in orbit
            for (let i = 0; i < particleRings.length; i++) {
                const p = particleRings[i];
                const currentAngle = p.angle + time * p.speed;
                // Dust breathes with the pulse
                const currentR = baseRadius * p.radius * baseScale * (1 + pulse * 0.05); 
                const px = cx + Math.cos(currentAngle) * currentR;
                const py = cy + Math.sin(currentAngle) * currentR;
                
                const pAlpha = 0.2 + 0.8 * Math.pow(Math.sin(time * 0.002 + p.alphaPhase), 4);
                
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = \`rgba(255, 255, 255, \${pAlpha})\`;
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
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 1.2, ease: "easeInOut" } }}
            ref={canvasRef} 
            className="fixed inset-0 z-0 pointer-events-none" 
        />
    );
};`;

content = content.replace(regexCanvas, newCanvasContent);
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully applied the highly tensioned Liquid Neural Core canvas animation.');
