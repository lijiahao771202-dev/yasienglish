import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { requireAdminUser } from "@/lib/admin-auth";

export default async function AdminPage() {
    const auth = await requireAdminUser();
    if (!auth.ok) {
        redirect("/");
    }

    return <AdminDashboard adminEmail={auth.user.email ?? ""} />;
}
