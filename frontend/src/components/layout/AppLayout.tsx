import { Outlet, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./Sidebar";
import { getAccessToken } from "../../api/client";

export default function AppLayout() {
  const location = useLocation();

  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[200px] flex-1 px-8 py-8">
        {/* No AnimatePresence mode="wait" — that caused a black void between routes.
            Simple key-based fade keeps the old page visible until new one loads. */}
        <AnimatePresence>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
