import { redirect } from "next/navigation";

import { ProfilePageClient } from "@/components/profile/ProfilePageClient";
import { getServerUserSafely } from "@/lib/supabase/server";

export default async function ProfilePage() {
    const { user } = await getServerUserSafely();

    if (!user) {
        redirect("/login");
    }

    return <ProfilePageClient />;
}
