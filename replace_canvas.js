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

        const particles: { rBase: number; angleBase: number; size: number; color: string; speed: number; }[] = [];
        const themeColors = colors || ['#e879f9', '#818cf8', '#38bdf8', '#c084fc', '#ffffff', '#2dd4bf'];
        
        const particleCount = 2800; // Ultra dense, premium fluid look
        const maxRBase = Math.hypot(width, height) * 1.5;
        
        for (let i = 0; i < particleCount; i++) {
            // More particles clustered at the core
            const rDist = Math.pow(Math.random(), 3); 
            const r = rDist * maxRBase;
            
            // Generate elegant spiral arms
            const armCount = 5;
            const baseArmAngle = (Math.PI * 2 / armCount) * (i % armCount);
            const spiralWrap = -rDist * Math.PI * 5; // The further out, the more it wraps back
            
            // Random scatter around the arms, tighter near core, looser near edges
            const dispersion = (1 - rDist) * 1.5; 
            const angleScatter = (Math.random() - 0.5) * dispersion;
            
            const angle = baseArmAngle + spiralWrap + angleScatter;
            
            particles.push({
                rBase: Math.max(2, r), 
                angleBase: angle,
                size: Math.max(0.5, (1 - rDist) * 2.5 + Math.random() * 2), // Core particles are bigger
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                speed: (2.5 - rDist) * 0.00015, // Core rotates faster
            });
        }

        const startTime = Date.now();
        const render = () => {
            const time = Date.now() - startTime;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter'; 
            
            // Initial expansion animation: fast explosion, very smooth landing
            const expandProgress = Math.min(1, time / 8000);
            const easeExpand = 1 - Math.pow(1 - expandProgress, 4); 
            
            const globalRot = time * 0.0003;
            
            // Origin at TOP RIGHT
            const originX = width;
            const originY = 0;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                const currentAngle = p.angleBase + globalRot + time * p.speed;
                const r = p.rBase * Math.max(0.01, easeExpand);
                
                const finalX = originX + Math.cos(currentAngle) * r;
                const finalY = originY + Math.sin(currentAngle) * r;
                
                // Opacity falls off slightly near extreme edges, and fades in gracefully during expansion
                const alpha = Math.min(1, easeExpand * 2) * Math.max(0, 1 - r / (maxRBase * 1.2));
                
                ctx.beginPath();
                ctx.arc(finalX, finalY, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, alpha * 0.85); // 0.85 gives it that super soft gossamer look
                ctx.fill();
            }

            // Draw a deeply saturated core at top right to anchor the visual
            const gradient = ctx.createRadialGradient(originX, originY, 0, originX, originY, width * 0.4);
            gradient.addColorStop(0, 'rgba(232, 121, 249, 0.4)');
            gradient.addColorStop(0.3, 'rgba(129, 140, 248, 0.15)');
            gradient.addColorStop(1, 'rgba(129, 140, 248, 0)');
            
            ctx.beginPath();
            ctx.arc(originX, originY, width * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = easeExpand;
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

// Replace the JSX back
const jsxRegex = /\{\/\* GLOBAL FULL SCREEN SPHERE ANIMATION \(Removed for previewing previous version\) \*\/\}\n\s*<AnimatePresence>\n\s*\{\/\* \{isGenerating && <CanvasBreathingParticles key="breathing-sphere" \/>\} \*\/\}\n\s*<\/AnimatePresence>/g;

content = content.replace(jsxRegex, `{/* GLOBAL FULL SCREEN SPIRAL GALAXY ANIMATION */}
                    <AnimatePresence>
                        {isGenerating && <CanvasBreathingParticles key="breathing-sphere" colors={['#38bdf8', '#fde047', '#f472b6', '#c084fc', '#ffffff']} />}
                    </AnimatePresence>`);

const textReplacementRegex = /<div className="relative h-32 w-32 flex items-center justify-center">[\s\S]*?<\/div>\n\s*<div className="space-y-4 relative z-30">/g;

content = content.replace(textReplacementRegex, `<div className="space-y-4 relative z-30">`);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully replaced standard spherical canvas with top-right premium rotating spiral canvas!');
