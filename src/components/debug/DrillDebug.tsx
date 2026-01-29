
import { useState } from 'react';
import { Dices } from 'lucide-react';

interface DrillDebugProps {
    onTriggerBoss: (type: string) => void;
}

export function DrillDebug({ onTriggerBoss }: DrillDebugProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleRoulette = () => {
        // 1/6 Chance of Death
        // We simulate a 6-chamber revolver.
        const bullet = Math.floor(Math.random() * 6);

        console.log(`[Russian Roulette] Spun chamber: ${bullet} (0 = LIVE ROUND)`);

        if (bullet === 0) {
            // LIVE ROUND -> EXECUTION
            // Play gun cocking sound if possible (frontend responsibility)
            onTriggerBoss('roulette_execution');
        } else {
            // EMPTY -> LUCKY
            // Play click sound
            onTriggerBoss('roulette');
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 min-w-[32px] h-8 flex items-center justify-center bg-black/50 hover:bg-black/80 text-white/50 hover:text-white rounded-full text-[10px] font-mono z-[9999] transition-all backdrop-blur-sm"
                title="Open Debug Panel"
            >
                DBG
            </button>
        )
    }

    return (
        <div className="fixed bottom-4 left-4 p-4 bg-black/90 text-white rounded-xl z-[9999] border border-stone-800 w-64 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-xs tracking-widest text-stone-400">DRILL DEBUGGER</h3>
                <button onClick={() => setIsOpen(false)} className="text-[10px] text-stone-500 hover:text-white">CLOSE</button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => onTriggerBoss('reaper')} className="p-2 bg-red-950/40 border border-red-900/30 hover:border-red-500/50 rounded hover:bg-red-900/40 text-[10px] font-mono transition-all text-red-200">Reaper (HP)</button>
                <button onClick={() => onTriggerBoss('lightning')} className="p-2 bg-yellow-950/40 border border-yellow-900/30 hover:border-yellow-500/50 rounded hover:bg-yellow-900/40 text-[10px] font-mono transition-all text-yellow-200">Lightning (30s)</button>
                <button onClick={() => onTriggerBoss('blind')} className="p-2 bg-stone-800/40 border border-stone-700/30 hover:border-stone-500/50 rounded hover:bg-stone-700/40 text-[10px] font-mono transition-all text-stone-300">Blind (No Text)</button>
                <button onClick={() => onTriggerBoss('echo')} className="p-2 bg-cyan-950/40 border border-cyan-900/30 hover:border-cyan-500/50 rounded hover:bg-cyan-900/40 text-[10px] font-mono transition-all text-cyan-200">Echo (Memory)</button>
                <button onClick={() => onTriggerBoss('reverser')} className="p-2 bg-purple-950/40 border border-purple-900/30 hover:border-purple-500/50 rounded hover:bg-purple-900/40 text-[10px] font-mono transition-all text-purple-200">Reverser (Back)</button>
            </div>

            <div className="pt-3 border-t border-stone-800">
                <div className="text-[10px] text-stone-500 font-mono mb-2 uppercase tracking-tight text-center">Experimental Modes</div>
                <button
                    onClick={handleRoulette}
                    className="group w-full p-3 bg-gradient-to-r from-stone-900 to-red-950 border border-red-900/20 hover:border-red-600/50 rounded-lg flex items-center justify-center gap-3 hover:brightness-125 active:scale-95 transition-all shadow-lg hover:shadow-red-900/20"
                >
                    <Dices className="w-4 h-4 text-red-500 group-hover:rotate-180 transition-transform duration-500" />
                    <span className="font-bold text-xs text-red-100">Spin Roulette (1/6)</span>
                </button>
            </div>
        </div>
    );
}
