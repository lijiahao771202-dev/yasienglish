"use client";

import React, { useState } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function PaywallDemoPage() {
    const [isPaywallOpen, setIsPaywallOpen] = useState(true);

    if (!isPaywallOpen) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
                <p className="mb-4 text-slate-500">You bypassed or completed the onboarding payment flow.</p>
                <button
                    onClick={() => setIsPaywallOpen(true)}
                    className="rounded-full bg-indigo-600 px-6 py-2 pb-2.5 font-bold text-white shadow-sm hover:bg-indigo-500 focus:outline-none"
                >
                    Reopen Onboarding Paywall
                </button>
            </div>
        );
    }

    return (
        <OnboardingWizard
            onClose={() => setIsPaywallOpen(false)}
            onStartTrial={(planId) => {
                alert(`Starting 7-day trial for plan: ${planId}`);
                setIsPaywallOpen(false);
            }}
        />
    );
}
