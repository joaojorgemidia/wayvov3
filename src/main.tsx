import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "leaflet/dist/leaflet.css";

if (import.meta.env.VITE_BUILD_TIME) {
  (window as any).__WAYVO_BUILD__ = import.meta.env.VITE_BUILD_TIME;
}

createRoot(document.getElementById("root")!).render(<App />);
