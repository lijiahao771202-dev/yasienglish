import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { GachaOverlay } from "./GachaOverlay";

describe("GachaOverlay", () => {
    it("renders the draw intro and hidden cards", () => {
        const html = renderToString(
            <GachaOverlay
                cards={[
                    { id: "1", tier: "high", rewardType: "coins", amount: 50, revealed: false, selected: false },
                    { id: "2", tier: "normal", rewardType: "capsule", amount: 1, revealed: false, selected: false },
                    { id: "3", tier: "normal", rewardType: "vocab_ticket", amount: 1, revealed: false, selected: false },
                    { id: "4", tier: "normal", rewardType: "audio_ticket", amount: 1, revealed: false, selected: false },
                    { id: "5", tier: "normal", rewardType: "coins", amount: 10, revealed: false, selected: false },
                ]}
                selectedCardId={null}
                claimTarget={null}
                onSelect={() => undefined}
                onComplete={() => undefined}
            />,
        );

        expect(html).toContain("Lucky Draw");
        expect(html).toContain("Fortune Unfolds");
        expect(html).toContain("Hidden Reward");
    });
});
