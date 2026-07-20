import { Outlet, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { getAccessToken } from "../../api/client";

export default function AppLayout() {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <main className="ml-[228px] px-8 py-8">
        <div className="mx-auto max-w-[1200px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
