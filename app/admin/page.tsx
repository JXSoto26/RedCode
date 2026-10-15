import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";

export default async function AdminHome() {
  await requireAdmin();
  redirect("/admin/solicitudes");
}
