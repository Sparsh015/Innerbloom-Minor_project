import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminPanel } from "@/components/admin/admin-panel";

const AdminDashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-soft">
      <AdminNavigation />
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4 max-w-7xl">
          <AdminPanel />
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
