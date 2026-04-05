import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent } from "react";
import {
  Search,
  Package,
  Barcode,
  Boxes,
  Pencil,
  Save,
  X,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileDown,
  Plus,
  Trash2,
  Settings,
  ArrowLeftRight,
  Moon,
  Sun,
} from "lucide-react";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";

type StatoCassetto = "Occupato" | "Vuoto" | "Disattivato";

type Articolo = {
  id: number;
  codiceBarre: string;
  codiceInterno: string;
  articolo: string;
  quantita: number;
  um: string;
  quantitaMinima: number;
  note: string;
};

type Cassetto = {
  id?: number;
  cassetto: string;
  articoli: Articolo[];
  stato: StatoCassetto;
  ultimoAggiornamento: string;
  note: string;
};

type DrawerSummary = {
  countArticoli: number;
  quantitaTotale: number;
  sottoScorta: boolean;
  tuttiZero: boolean;
};

type ApiMode = "render" | "localhost";

const initialDrawers: Cassetto[] = Array.from({ length: 80 }, (_, i) => {
  const index = i + 1;
  const code = `C${String(index).padStart(2, "0")}`;

  const demo: Record<string, Cassetto> = {
    C01: {
      cassetto: "C01",
      articoli: [
        {
          id: 1,
          codiceBarre: "Demo",
          codiceInterno: "Demo-Demo",
          articolo: "Demo",
          quantita: 120,
          um: "pz",
          quantitaMinima: 30,
          note: "Demo",
        },
        {
          id: 2,
          codiceBarre: "Demo",
          codiceInterno: "Demo-Demo",
          articolo: "Demo",
          quantita: 80,
          um: "pz",
          quantitaMinima: 20,
          note: "Demo",
        },
      ],
      stato: "Occupato",
      ultimoAggiornamento: "2026-04-02 10:30",
      note: "Demo",
    },
  };

  return (
    demo[code] || {
      cassetto: code,
      articoli: [],
      stato: "Vuoto",
      ultimoAggiornamento: "",
      note: "",
    }
  );
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getDrawerSummary(item: Cassetto | null | undefined): DrawerSummary {
  const articoli = Array.isArray(item?.articoli) ? item.articoli : [];
  const countArticoli = articoli.length;
  const quantitaTotale = articoli.reduce((sum, a) => sum + (Number(a.quantita) || 0), 0);
  const sottoScorta = articoli.some(
    (a) => (Number(a.quantita) || 0) <= (Number(a.quantitaMinima) || 0)
  );
  const tuttiZero = articoli.length > 0 && articoli.every((a) => (Number(a.quantita) || 0) === 0);

  return { countArticoli, quantitaTotale, sottoScorta, tuttiZero };
}

function getDrawerColors(item: Cassetto): { border: string; background: string } {
  const { sottoScorta, tuttiZero } = getDrawerSummary(item);

  if (item.stato === "Disattivato") {
    return { border: "#fca5a5", background: "#fef2f2" };
  }
  if (tuttiZero) {
    return { border: "#fca5a5", background: "#fef2f2" };
  }
  if (item.stato === "Vuoto") {
    return { border: "#cbd5e1", background: "#f8fafc" };
  }
  if (sottoScorta) {
    return { border: "#fcd34d", background: "#fffbeb" };
  }
  return { border: "#6ee7b7", background: "#ecfdf5" };
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--page-bg)",
    padding: 24,
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "var(--text-main)",
  },
  container: {
    maxWidth: 1400,
    margin: "0 auto",
    display: "grid",
    gap: 24,
  },
  card: {
    background: "var(--surface-bg)",
    border: "1px solid var(--surface-border)",
    borderRadius: 20,
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
  },
  button: {
    borderRadius: 12,
    border: "1px solid var(--button-border)",
    background: "var(--button-bg)",
    color: "var(--button-fg)",
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  buttonPrimary: {
    borderRadius: 12,
    border: "1px solid var(--button-primary-border)",
    background: "var(--button-primary-bg)",
    color: "var(--button-primary-fg)",
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    fontSize: 14,
    boxSizing: "border-box",
    background: "var(--input-bg)",
    color: "var(--input-fg)",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
    fontSize: 14,
    color: "var(--muted-text)",
  },
  badge: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid var(--badge-border)",
    background: "var(--badge-bg)",
    color: "var(--badge-fg)",
    display: "inline-flex",
    alignItems: "center",
  },
};

type BasicButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
};

function BasicButton({ children, onClick, disabled, primary = false }: BasicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...(primary ? styles.buttonPrimary : styles.button),
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

type StatCardProps = {
  title: string;
  value: number;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onClick?: () => void;
};

function StatCard({ title, value, icon: Icon, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        ...styles.card,
        padding: 16,
        display: "flex",
        justifyContent: "space-between",
        cursor: onClick ? "pointer" : "default",
        transition: onClick ? "all 0.2s ease" : "none",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 20px rgba(15, 23, 42, 0.15)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 10px rgba(15, 23, 42, 0.06)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        }
      }}
    >
      <div>
        <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{value}</div>
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "white",
        }}
      >
        <Icon size={18} color="#334155" />
      </div>
    </div>
  );
}

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  exportButtonEnabled: boolean;
  onExportButtonEnabledChange: (value: boolean) => void;
  swapButtonEnabled: boolean;
  onSwapButtonEnabledChange: (value: boolean) => void;
  themeButtonEnabled: boolean;
  onThemeButtonEnabledChange: (value: boolean) => void;
  apiMode: ApiMode;
  onApiModeChange: (mode: ApiMode) => void;
  localApiPort: string;
  onLocalApiPortChange: (port: string) => void;
};

function SettingsModal({
  isOpen,
  onClose,
  exportButtonEnabled,
  onExportButtonEnabledChange,
  swapButtonEnabled,
  onSwapButtonEnabledChange,
  themeButtonEnabled,
  onThemeButtonEnabledChange,
  apiMode,
  onApiModeChange,
  localApiPort,
  onLocalApiPortChange,
}: SettingsModalProps) {
  const [versionClickCount, setVersionClickCount] = useState<number>(0);
  const [apiMenuVisible, setApiMenuVisible] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setVersionClickCount(0);
      setApiMenuVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 999,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        style={{
          background: "white",
          width: "min(500px, 90vw)",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Settings size={24} />
          <h2 style={{ margin: 0 }}>Impostazioni</h2>
        </div>

        <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
          <div style={{ ...styles.card, padding: 16 }}>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 10 }}>Pulsanti rapidi</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "#0f172a", fontWeight: 600 }}>Scarica inventario</span>
                <input
                  type="checkbox"
                  checked={exportButtonEnabled}
                  onChange={(e) => onExportButtonEnabledChange(e.target.checked)}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "#0f172a", fontWeight: 600 }}>Scambia cassetti</span>
                <input
                  type="checkbox"
                  checked={swapButtonEnabled}
                  onChange={(e) => onSwapButtonEnabledChange(e.target.checked)}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "#0f172a", fontWeight: 600 }}>Tema chiaro/scuro</span>
                <input
                  type="checkbox"
                  checked={themeButtonEnabled}
                  onChange={(e) => onThemeButtonEnabledChange(e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div
            style={{ ...styles.card, padding: 16, cursor: "pointer" }}
            onClick={() => {
              const next = versionClickCount + 1;
              setVersionClickCount(next);
              if (next >= 5) {
                setApiMenuVisible(true);
              }
            }}
          >
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>Versione</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>1.0.0</div>
            {!apiMenuVisible && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
              </div>
            )}
          </div>

          {apiMenuVisible && (
            <div style={{ ...styles.card, padding: 16 }}>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>API da usare</div>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="apiMode"
                    checked={apiMode === "render"}
                    onChange={() => onApiModeChange("render")}
                  />
                  Usa Render
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="apiMode"
                    checked={apiMode === "localhost"}
                    onChange={() => onApiModeChange("localhost")}
                  />
                  Usa localhost
                </label>
                {apiMode === "localhost" && (
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#475569" }}>
                      Porta localhost
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={localApiPort}
                        onChange={(e) => onLocalApiPortChange(e.target.value)}
                        style={{
                          ...styles.input,
                          width: "100%",
                          maxWidth: 160,
                          boxSizing: "border-box",
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      L’URL locale sarà http://localhost:{localApiPort}/api
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <BasicButton onClick={onClose}>Chiudi</BasicButton>
        </div>
      </motion.div>
    </div>
  );
}

type FilteredDrawersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  drawers: Cassetto[];
  onDrawerClick: (drawer: Cassetto) => void;
};

function FilteredDrawersModal({ isOpen, onClose, title, drawers, onDrawerClick }: FilteredDrawersModalProps) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 999,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        style={{
          background: "white",
          width: "min(700px, 90vw)",
          maxHeight: "80vh",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "auto",
        }}
      >
        <h2 style={{ margin: "0 0 20px 0" }}>{title}</h2>

        {drawers.length === 0 ? (
          <div style={{ ...styles.card, padding: 20, textAlign: "center", color: "#64748b" }}>
            Nessun cassetto trovato
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {drawers.map((drawer) => {
              const summary = getDrawerSummary(drawer);
              const colors = getDrawerColors(drawer);

              return (
                <motion.button
                  key={drawer.cassetto}
                  onClick={() => onDrawerClick(drawer)}
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${colors.border}`,
                    background: colors.background,
                    padding: 14,
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{drawer.cassetto}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                    {drawer.articoli.length > 0
                      ? drawer.articoli.map((a) => a.articolo || "Articolo senza nome").join(", ")
                      : "Cassetto vuoto"}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    Art: {summary.countArticoli} | Qtà: {summary.quantitaTotale}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <BasicButton onClick={onClose}>Chiudi</BasicButton>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const AUTH_TOKEN_STORAGE_KEY = "cassettiera_auth_token";

  const [drawers, setDrawers] = useState<Cassetto[]>(initialDrawers);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
  });
  const [loginUsername, setLoginUsername] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [selected, setSelected] = useState<Cassetto | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [form, setForm] = useState<Cassetto | null>(null);
  const [inventoryMode, setInventoryMode] = useState<boolean>(false);
  const [inventoryIndex, setInventoryIndex] = useState<number>(0);
  const [checkedDrawers, setCheckedDrawers] = useState<Set<string>>(() => new Set<string>());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [filterModal, setFilterModal] = useState<{ isOpen: boolean; type: string; title: string }>({
    isOpen: false,
    type: "",
    title: "",
  });
  const [swapMode, setSwapMode] = useState<boolean>(false);
  const [swapSelection, setSwapSelection] = useState<Cassetto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiMode, setApiMode] = useState<ApiMode>("render");
  const [localApiPort, setLocalApiPort] = useState<string>("5285");
  const [pendingApiMode, setPendingApiMode] = useState<ApiMode>("render");
  const [pendingLocalApiPort, setPendingLocalApiPort] = useState<string>("5285");
  const [exportButtonEnabled, setExportButtonEnabled] = useState<boolean>(() => {
    return window.localStorage.getItem("exportButtonEnabled") !== "false";
  });
  const [swapButtonEnabled, setSwapButtonEnabled] = useState<boolean>(() => {
    return window.localStorage.getItem("swapButtonEnabled") !== "false";
  });
  const [themeButtonEnabled, setThemeButtonEnabled] = useState<boolean>(() => {
    return window.localStorage.getItem("themeButtonEnabled") !== "false";
  });
  const [pendingExportButtonEnabled, setPendingExportButtonEnabled] = useState<boolean>(true);
  const [pendingSwapButtonEnabled, setPendingSwapButtonEnabled] = useState<boolean>(true);
  const [pendingThemeButtonEnabled, setPendingThemeButtonEnabled] = useState<boolean>(true);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("themeMode");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    window.localStorage.setItem("themeMode", themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem("exportButtonEnabled", String(exportButtonEnabled));
  }, [exportButtonEnabled]);

  useEffect(() => {
    window.localStorage.setItem("swapButtonEnabled", String(swapButtonEnabled));
  }, [swapButtonEnabled]);

  useEffect(() => {
    window.localStorage.setItem("themeButtonEnabled", String(themeButtonEnabled));
  }, [themeButtonEnabled]);

  useEffect(() => {
    document.body.style.backgroundColor = themeMode === "dark" ? "#0b1220" : "#f1f5f9";
    document.body.style.color = themeMode === "dark" ? "#e2e8f0" : "#0f172a";
  }, [themeMode]);

  const isDark = themeMode === "dark";
  const themeVars = (isDark
    ? {
        "--page-bg": "#0b1220",
        "--text-main": "#e2e8f0",
        "--surface-bg": "#111827",
        "--surface-border": "#334155",
        "--button-bg": "#1f2937",
        "--button-fg": "#e2e8f0",
        "--button-border": "#334155",
        "--button-primary-bg": "#e2e8f0",
        "--button-primary-fg": "#0f172a",
        "--button-primary-border": "#e2e8f0",
        "--input-bg": "#0f172a",
        "--input-fg": "#e2e8f0",
        "--input-border": "#334155",
        "--muted-text": "#cbd5e1",
        "--badge-bg": "#1f2937",
        "--badge-fg": "#cbd5e1",
        "--badge-border": "#334155",
      }
    : {
        "--page-bg": "#f1f5f9",
        "--text-main": "#0f172a",
        "--surface-bg": "#ffffff",
        "--surface-border": "#e2e8f0",
        "--button-bg": "#ffffff",
        "--button-fg": "#111827",
        "--button-border": "#d1d5db",
        "--button-primary-bg": "#111827",
        "--button-primary-fg": "#ffffff",
        "--button-primary-border": "#111827",
        "--input-bg": "#ffffff",
        "--input-fg": "#0f172a",
        "--input-border": "#d1d5db",
        "--muted-text": "#334155",
        "--badge-bg": "#ffffff",
        "--badge-fg": "#334155",
        "--badge-border": "#d1d5db",
      }) as CSSProperties;

  const renderApiUrl = "https://cassettiera.onrender.com/api";
  const localApiUrl = `http://localhost:${localApiPort || "5285"}/api`;
  const apiBaseUrl = apiMode === "localhost" ? localApiUrl : renderApiUrl;

  const openSettings = () => {
    setPendingApiMode(apiMode);
    setPendingLocalApiPort(localApiPort);
    setPendingExportButtonEnabled(exportButtonEnabled);
    setPendingSwapButtonEnabled(swapButtonEnabled);
    setPendingThemeButtonEnabled(themeButtonEnabled);
    setShowSettings(true);
  };

  const closeSettings = () => {
    const oldApiBaseUrl = apiBaseUrl;

    setShowSettings(false);
    setApiMode(pendingApiMode);
    setLocalApiPort(pendingLocalApiPort || "5285");
    setExportButtonEnabled(pendingExportButtonEnabled);
    setSwapButtonEnabled(pendingSwapButtonEnabled);
    setThemeButtonEnabled(pendingThemeButtonEnabled);

    if (!pendingSwapButtonEnabled) {
      setSwapMode(false);
      setSwapSelection([]);
    }

    const newLocalApiUrl = `http://localhost:${pendingLocalApiPort || "5285"}/api`;
    const newApiBaseUrl = pendingApiMode === "localhost" ? newLocalApiUrl : renderApiUrl;

    if (newApiBaseUrl !== oldApiBaseUrl) {
      loadDrawers(newApiBaseUrl);
    }
  };

  const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return response.json();
  };

  const loadDrawers = async (baseUrl = apiBaseUrl) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson<Cassetto[]>(`${baseUrl}/drawers`);
      setDrawers(data);
    } catch (fetchError) {
      console.error("Errore caricamento cassetti:", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Impossibile caricare i cassetti dal backend."
      );
      setDrawers(initialDrawers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadDrawers();
  }, [isAuthenticated]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drawers;

    return drawers.filter((d) => {
      const articleBlob = d.articoli
        .map((a) => [a.codiceBarre, a.codiceInterno, a.articolo, a.note].join(" "))
        .join(" ");

      return [d.cassetto, d.note, d.stato, articleBlob]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [drawers, search]);

  const stats = useMemo(() => {
    const occupati = drawers.filter((d) => d.stato === "Occupato").length;
    const vuoti = drawers.filter((d) => d.stato === "Vuoto").length;
    const sottoScorta = drawers.filter((d) => getDrawerSummary(d).sottoScorta).length;
    const articoliTotali = drawers.reduce((sum, d) => sum + d.articoli.length, 0);

    return {
      occupati,
      vuoti,
      sottoScorta,
      totale: drawers.length,
      articoliTotali,
    };
  }, [drawers]);

  const selectedSummary = form ? getDrawerSummary(form) : null;
  const inventoryProgress = checkedDrawers.size;
  const inventoryCurrentDrawer = drawers[inventoryIndex] ?? null;

  const openDrawer = (item: Cassetto) => {
    setSelected(item);
    setForm(clone(item));
    setEditing(false);
  };

  const openInventoryDrawer = (index: number) => {
    const boundedIndex = Math.max(0, Math.min(index, drawers.length - 1));
    setInventoryIndex(boundedIndex);
    const item = drawers[boundedIndex];
    setSelected(item);
    setForm(clone(item));
    setEditing(true);
  };

  const updateArticleField = <K extends keyof Articolo>(
    index: number,
    key: K,
    value: Articolo[K]
  ) => {
    setForm((prev) => {
      if (!prev) return prev;
      const articoli = [...prev.articoli];
      articoli[index] = { ...articoli[index], [key]: value };
      return { ...prev, articoli };
    });
  };

  const addArticle = () => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        articoli: [
          ...prev.articoli,
          {
            id: Date.now(),
            codiceBarre: "",
            codiceInterno: "",
            articolo: "",
            quantita: 0,
            um: "pz",
            quantitaMinima: 0,
            note: "",
          },
        ],
      };
    });
  };

  const removeArticle = (index: number) => {
    setForm((prev) => {
      if (!prev) return prev;
      const articoli = prev.articoli.filter((_, i) => i !== index);
      return {
        ...prev,
        articoli,
        stato:
          articoli.length === 0
            ? "Vuoto"
            : prev.stato === "Disattivato"
            ? "Disattivato"
            : "Occupato",
      };
    });
  };

  const swapDrawers = async (drawer1: Cassetto, drawer2: Cassetto) => {
    if (drawer1.id == null || drawer2.id == null) {
      setError("Non è possibile scambiare cassetti senza ID");
      return;
    }

    try {
      await fetchJson(`${apiBaseUrl}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id1: drawer1.id, id2: drawer2.id }),
      });

      // Ricarica i cassetti dal backend dopo lo scambio
      await loadDrawers();
    } catch (swapError) {
      console.error("Errore scambio cassetti:", swapError);
      setError(
        swapError instanceof Error
          ? swapError.message
          : "Errore durante lo scambio dei cassetti."
      );
    }
  };

  const handleSwapSelection = async (drawer: Cassetto) => {
    if (swapSelection.length === 0) {
      setSwapSelection([drawer]);
    } else if (swapSelection.length === 1) {
      if (swapSelection[0].cassetto === drawer.cassetto) {
        // Deseleziona se clicchi sullo stesso
        setSwapSelection([]);
      } else {
        // Scambia i due cassetti selezionati
        await swapDrawers(swapSelection[0], drawer);
        setSwapSelection([]);
        setSwapMode(false);
      }
    }
  };

  const normalizeDrawer = (value: Cassetto): Cassetto => {
    const cleanedArticles: Articolo[] = value.articoli.map((a, index) => ({
      ...a,
      id: a.id ?? Date.now() + index,
      quantita: Math.max(0, Number(a.quantita) || 0),
      quantitaMinima: Math.max(0, Number(a.quantitaMinima) || 0),
      um: a.um || "pz",
    }));

    return {
      ...value,
      articoli: cleanedArticles,
      stato:
        value.stato === "Disattivato"
          ? "Disattivato"
          : cleanedArticles.length === 0
          ? "Vuoto"
          : "Occupato",
      ultimoAggiornamento: new Date().toLocaleString("it-IT"),
    };
  };

  const persistDrawer = async (drawer: Cassetto): Promise<Cassetto> => {
    let nextDrawer = drawer;

    if (nextDrawer.id == null) {
      const response = await fetchJson<{
        id: number;
        codice: string;
        stato: StatoCassetto;
        note: string;
        ultimo_aggiornamento: string;
      }>(`${apiBaseUrl}/drawers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cassetto: nextDrawer.cassetto,
          stato: nextDrawer.stato,
          note: nextDrawer.note,
        }),
      });

      nextDrawer = {
        ...nextDrawer,
        id: response.id,
        cassetto: response.codice,
        stato: response.stato,
        note: response.note || "",
        ultimoAggiornamento: response.ultimo_aggiornamento || nextDrawer.ultimoAggiornamento,
      };
    }

    await fetchJson(`${apiBaseUrl}/drawers/${nextDrawer.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stato: nextDrawer.stato,
        note: nextDrawer.note,
        articoli: nextDrawer.articoli,
      }),
    });

    return nextDrawer;
  };

  const saveDrawer = async () => {
    if (!form) return;

    const updated = normalizeDrawer(form);

    try {
      const saved = await persistDrawer(updated);
      setDrawers((prev) => prev.map((d) => (d.cassetto === saved.cassetto ? saved : d)));
      setSelected(saved);
      setForm(clone(saved));
      setEditing(false);
    } catch (saveError) {
      console.error("Errore salvataggio cassetto:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Errore durante il salvataggio del cassetto."
      );
    }
  };

  const saveInventoryDrawer = async () => {
    if (!form) return;

    const updated = normalizeDrawer(form);

    try {
      const saved = await persistDrawer(updated);
      setDrawers((prev) => prev.map((d) => (d.cassetto === saved.cassetto ? saved : d)));
      setCheckedDrawers((prev) => {
        const next = new Set(prev);
        next.add(saved.cassetto);
        return next;
      });
      setSelected(saved);
      setForm(clone(saved));

      const nextIndex = inventoryIndex + 1;
      if (nextIndex < drawers.length) {
        const nextDrawer = drawers[nextIndex];
        setInventoryIndex(nextIndex);
        if (nextDrawer) {
          setSelected(nextDrawer);
          setForm(clone(nextDrawer));
          setEditing(true);
        }
      } else {
        setEditing(false);
        setInventoryMode(false);
      }
    } catch (saveError) {
      console.error("Errore salvataggio inventario:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Errore durante il salvataggio dell'inventario."
      );
    }
  };

  const exportInventoryPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    let y = 16;

    const writeLine = (text: string, x = margin, size = 9) => {
      if (y > pageHeight - 12) {
        doc.addPage();
        y = 16;
      }
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      doc.text(lines, x, y);
      y += lines.length * 4.5;
    };

    doc.setFontSize(16);
    doc.text("Inventario ferramenta", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`Generato il ${new Date().toLocaleString("it-IT")}`, margin, y);
    y += 8;

    drawers.forEach((drawer) => {
      const summary = getDrawerSummary(drawer);

      if (y > pageHeight - 24) {
        doc.addPage();
        y = 16;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${drawer.cassetto} - ${drawer.stato}`, margin, y);
      doc.setFont("helvetica", "normal");
      y += 5;

      writeLine(
        `Articoli: ${summary.countArticoli} | Quantità totale: ${summary.quantitaTotale}`,
        margin,
        9
      );

      if (drawer.note) {
        writeLine(`Note cassetto: ${drawer.note}`, margin, 9);
      }

      if (!drawer.articoli.length) {
        writeLine("Nessun articolo presente.", margin + 2, 9);
        y += 2;
        return;
      }

      drawer.articoli.forEach((articolo, idx) => {
        writeLine(
          `${idx + 1}. ${articolo.articolo || "Articolo senza nome"} | Barcode: ${
            articolo.codiceBarre || "-"
          } | Cod. interno: ${articolo.codiceInterno || "-"} | Quantità: ${
            articolo.quantita ?? 0
          } ${articolo.um || "pz"} | Min: ${articolo.quantitaMinima ?? 0}${
            articolo.note ? ` | Note: ${articolo.note}` : ""
          }`,
          margin + 2,
          8
        );
      });

      y += 3;
    });

    doc.save("inventario-ferramenta.pdf");
  };

  const closeModal = () => {
    setSelected(null);
    setForm(null);
    setEditing(false);
  };

  const addDrawer = async () => {
    const maxNum = Math.max(...drawers.map((d) => parseInt(d.cassetto.slice(1))));
    const newNum = maxNum + 1;
    const newCode = `C${String(newNum).padStart(2, "0")}`;

    try {
      const response = await fetchJson<{
        id: number;
        codice: string;
        stato: StatoCassetto;
        note: string;
        ultimo_aggiornamento: string;
      }>(`${apiBaseUrl}/drawers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cassetto: newCode, stato: "Vuoto", note: "" }),
      });

      const newDrawer: Cassetto = {
        id: response.id,
        cassetto: response.codice,
        articoli: [],
        stato: response.stato,
        ultimoAggiornamento: response.ultimo_aggiornamento || new Date().toLocaleString("it-IT"),
        note: response.note || "",
      };

      setDrawers((prev) => [...prev, newDrawer]);
    } catch (createError) {
      console.error("Errore creazione cassetto:", createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "Errore durante la creazione del cassetto."
      );
    }
  };

  const deleteDrawer = async () => {
    if (!selected) return;
    if (!window.confirm("Sei sicuro di voler eliminare questo cassetto?")) return;

    try {
      if (selected.id != null) {
        await fetchJson(`${apiBaseUrl}/drawers/${selected.id}`, {
          method: "DELETE",
        });
      }
      setDrawers((prev) => prev.filter((d) => d.cassetto !== selected.cassetto));
      closeModal();
    } catch (deleteError) {
      console.error("Errore eliminazione cassetto:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Errore durante l'eliminazione del cassetto."
      );
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetchJson<{ token: string }>(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
      setIsAuthenticated(true);
      setLoginError(null);
    } catch (loginFetchError) {
      setLoginError(
        loginFetchError instanceof Error
          ? loginFetchError.message
          : "Credenziali non valide."
      );
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setLoginUsername("");
    setLoginPassword("");
    setLoginError(null);
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  };

  if (!isAuthenticated) {
    return (
      <div
        style={{
          ...styles.page,
          ...themeVars,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ ...styles.card, width: "min(420px, 92vw)", padding: 24 }}>
          <h1 style={{ margin: "0 0 10px", fontSize: 28 }}>Accesso</h1>
          <p style={{ margin: "0 0 20px", color: "var(--muted-text)", fontSize: 14 }}>
            Inserisci le credenziali per entrare in magazzino.
          </p>

          <form onSubmit={handleLogin} style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={styles.label}>Username</label>
              <input
                style={styles.input}
                value={loginUsername}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginUsername(e.target.value)}
                placeholder="Username"
                autoComplete="username"
              />
            </div>

            <div>
              <label style={styles.label}>Password</label>
              <input
                style={styles.input}
                type="password"
                value={loginPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
            </div>

            {loginError && <div style={{ color: "#b91c1c", fontSize: 13 }}>{loginError}</div>}

            <button
              type="submit"
              style={{
                ...styles.buttonPrimary,
                justifyContent: "center",
              }}
            >
              Accedi
            </button>
          </form>

          <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted-text)" }}>
            Login collegato al backend Render/Postgres.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.page,
        ...themeVars,
        transition: "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      <div style={styles.container}>
        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 36 }}>Magazzino ferramenta</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted-text)" }}>
              Gestione locale di cassetti con ricerca per cassetto, articolo o codice a barre.
            </p>
            {loading && (
              <div
                style={{
                  ...styles.card,
                  marginTop: 12,
                  border: "1px solid #93c5fd",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                }}
              >
                Caricamento dati dal backend...
              </div>
            )}
            {error && (
              <div
                style={{
                  ...styles.card,
                  marginTop: 12,
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  color: "#991b1b",
                }}
              >
                Errore backend: {error}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {exportButtonEnabled && (
              <BasicButton onClick={exportInventoryPdf}>
                <FileDown size={16} />
                Scarica Inventario
              </BasicButton>
            )}

            {swapButtonEnabled && (
              <BasicButton
                primary={swapMode}
                onClick={() => {
                  if (swapMode) {
                    setSwapMode(false);
                    setSwapSelection([]);
                  } else {
                    setSwapMode(true);
                    setSwapSelection([]);
                  }
                }}
              >
                <ArrowLeftRight size={16} />
                {swapMode ? "Annulla swap" : "Scambia cassetti"}
              </BasicButton>
            )}

            {themeButtonEnabled && (
              <BasicButton
                onClick={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
                {isDark ? "Tema chiaro" : "Tema scuro"}
              </BasicButton>
            )}


            <BasicButton onClick={openSettings}>
              <Settings size={16} />
              Impostazioni
            </BasicButton>

            <BasicButton onClick={handleLogout}>Esci</BasicButton>

            <div
              style={{
                ...styles.card,
                width: 420,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Search size={16} color="#94a3b8" />
              <input
                ref={searchInputRef}
                style={{ ...styles.input, border: "none", padding: 0, outline: "none" }}
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder={isSearchFocused ? "" : "Cerca cassetto, barcode, codice interno o articolo"}
              />
              {search.trim().length > 0 && (
                <button
                  type="button"
                  aria-label="Cancella ricerca"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#94a3b8",
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {inventoryMode && inventoryCurrentDrawer && (
          <div
            style={{
              ...styles.card,
              border: "1px solid #93c5fd",
              background: "#eff6ff",
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <ClipboardList size={18} />
                Inventario in corso
              </div>
              <div style={{ color: "#475569", marginTop: 6 }}>
                Cassetto corrente: <b>{inventoryCurrentDrawer.cassetto}</b> · Controllati{" "}
                {inventoryProgress} su {drawers.length}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <BasicButton
                onClick={() => openInventoryDrawer(inventoryIndex - 1)}
                disabled={inventoryIndex === 0}
              >
                <ChevronLeft size={16} />
                Precedente
              </BasicButton>
              <BasicButton
                onClick={() => openInventoryDrawer(inventoryIndex + 1)}
                disabled={inventoryIndex === drawers.length - 1}
              >
                Successivo
                <ChevronRight size={16} />
              </BasicButton>
            </div>
          </div>
        )}

        {swapMode && (
          <div
            style={{
              ...styles.card,
              border: "1px solid #f59e0b",
              background: "#fef3c7",
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <ArrowLeftRight size={18} />
                Modalità scambio cassetti
              </div>
              <div style={{ color: "#92400e", marginTop: 6 }}>
                {swapSelection.length === 0
                  ? "Clicca su un cassetto per selezionarlo"
                  : swapSelection.length === 1
                  ? `Cassetto selezionato: ${swapSelection[0].cassetto}. Clicca su un secondo cassetto per scambiarli.`
                  : "Scambio completato!"
                }
              </div>
            </div>

            <BasicButton onClick={() => {
              setSwapMode(false);
              setSwapSelection([]);
            }}>
              Annulla
            </BasicButton>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          <StatCard title="Cassetti totali" value={stats.totale} icon={Boxes} />
          <StatCard
            title="Occupati"
            value={stats.occupati}
            icon={Package}
            onClick={() => {
              setFilterModal({
                isOpen: true,
                type: "occupati",
                title: "Cassetti Occupati",
              });
            }}
          />
          <StatCard
            title="Vuoti"
            value={stats.vuoti}
            icon={X}
            onClick={() => {
              setFilterModal({
                isOpen: true,
                type: "vuoti",
                title: "Cassetti Vuoti",
              });
            }}
          />
          <StatCard
            title="Sotto scorta"
            value={stats.sottoScorta}
            icon={Barcode}
            onClick={() => {
              setFilterModal({
                isOpen: true,
                type: "sottoScorta",
                title: "Cassetti Sotto Scorta",
              });
            }}
          />
          <StatCard title="Articoli totali" value={stats.articoliTotali} icon={Package} />
        </div>

        <div style={{ ...styles.card, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Griglia cassetti</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 12,
            }}
          >
            {filtered.map((item, index) => {
              const summary = getDrawerSummary(item);
              const colors = getDrawerColors(item);

              return (
                <motion.button
                  key={item.cassetto}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: index * 0.005 }}
                  onClick={() => {
                    if (swapMode) {
                      handleSwapSelection(item);
                    } else {
                      openDrawer(item);
                    }
                  }}
                  style={{
                    borderRadius: 18,
                    border: `2px solid ${
                      swapSelection.some(s => s.cassetto === item.cassetto)
                        ? "#3b82f6"
                        : colors.border
                    }`,
                    background: swapSelection.some(s => s.cassetto === item.cassetto)
                      ? "#dbeafe"
                      : colors.background,
                    padding: 14,
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{item.cassetto}</div>
                    <span style={styles.badge}>{item.stato}</span>
                  </div>

                  <div
                    style={{
                      color: "#475569",
                      fontSize: 12,
                      minHeight: 34,
                      overflow: "hidden",
                    }}
                  >
                    {item.articoli.length > 0
                      ? item.articoli.map((a) => a.articolo || "Articolo senza nome").join(", ")
                      : "Cassetto vuoto"}
                  </div>

                  <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>
                    Articoli: {summary.countArticoli}
                  </div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
                    Qtà totale: {summary.quantitaTotale}
                  </div>
                </motion.button>
              );
            })}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: filtered.length * 0.005 }}
              onClick={addDrawer}
              style={{
                borderRadius: 18,
                border: `1px solid #cbd5e1`,
                background: "#f8fafc",
                padding: 14,
                textAlign: "center",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={24} color="#334155" />
            </motion.button>
          </div>
        </div>

        <div style={{ ...styles.card, padding: 20, overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>Tabella rapida</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "12px 8px" }}>Cassetto</th>
                <th style={{ padding: "12px 8px" }}>N. articoli</th>
                <th style={{ padding: "12px 8px" }}>Barcode principali</th>
                <th style={{ padding: "12px 8px" }}>Articoli</th>
                <th style={{ padding: "12px 8px" }}>Quantità totale</th>
                <th style={{ padding: "12px 8px" }}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 80).map((item) => {
                const summary = getDrawerSummary(item);
                return (
                  <tr
                    key={`row-${item.cassetto}`}
                    onClick={() => {
                      if (swapMode) {
                        handleSwapSelection(item);
                      } else {
                        openDrawer(item);
                      }
                    }}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      cursor: "pointer",
                      backgroundColor: swapSelection.some(s => s.cassetto === item.cassetto)
                        ? "#dbeafe"
                        : "transparent"
                    }}
                  >
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{item.cassetto}</td>
                    <td style={{ padding: "12px 8px" }}>{summary.countArticoli}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.articoli
                        .map((a) => a.codiceBarre)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(", ") || "-"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.articoli
                        .map((a) => a.articolo)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(", ") || "-"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{summary.quantitaTotale}</td>
                    <td style={{ padding: "12px 8px" }}>{item.stato}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && form && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            style={{
              background: "white",
              width: "min(1200px, 96vw)",
              maxHeight: "90vh",
              overflow: "auto",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <h2 style={{ margin: 0 }}>Dettaglio {selected.cassetto}</h2>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {selectedSummary && (
                  <span style={styles.badge}>
                    {selectedSummary.countArticoli} articoli · {selectedSummary.quantitaTotale} pezzi
                    totali
                  </span>
                )}

                {inventoryMode ? (
                  <>
                    <BasicButton
                      onClick={() => openInventoryDrawer(inventoryIndex - 1)}
                      disabled={inventoryIndex === 0}
                    >
                      <ChevronLeft size={16} />
                      Precedente
                    </BasicButton>
                    <BasicButton primary onClick={saveInventoryDrawer}>
                      <CheckCircle2 size={16} />
                      Salva e prossimo
                    </BasicButton>
                  </>
                ) : !editing ? (
                  <>
                    <BasicButton onClick={() => setEditing(true)}>
                      <Pencil size={16} />
                      Modifica
                    </BasicButton>
                    <BasicButton onClick={deleteDrawer}>
                      <Trash2 size={16} />
                      Elimina
                    </BasicButton>
                  </>
                ) : (
                  <>
                    <BasicButton
                      onClick={() => {
                        setForm(selected ? clone(selected) : null);
                        setEditing(false);
                      }}
                    >
                      Annulla
                    </BasicButton>
                    <BasicButton primary onClick={saveDrawer}>
                      <Save size={16} />
                      Salva
                    </BasicButton>
                  </>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div>
                <label style={styles.label}>Cassetto</label>
                <input style={styles.input} value={form.cassetto} readOnly />
              </div>

              <div>
                <label style={styles.label}>Stato</label>
                <select
                  style={styles.input}
                  value={form.stato}
                  disabled={!editing}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setForm((prev) =>
                      prev ? { ...prev, stato: e.target.value as StatoCassetto } : prev
                    )
                  }
                >
                  <option value="Occupato">Occupato</option>
                  <option value="Vuoto">Vuoto</option>
                  <option value="Disattivato">Disattivato</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Ultimo aggiornamento</label>
                <input style={styles.input} value={form.ultimoAggiornamento ?? ""} readOnly />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={styles.label}>Note cassetto</label>
                <input
                  style={styles.input}
                  value={form.note ?? ""}
                  readOnly={!editing}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                  }
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Articoli contenuti</h3>
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                  Ogni cassetto può contenere uno o più articoli.
                </p>
              </div>

              {editing && (
                <BasicButton onClick={addArticle}>
                  <Plus size={16} />
                  Aggiungi articolo
                </BasicButton>
              )}
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {form.articoli.length === 0 && (
                <div
                  style={{
                    ...styles.card,
                    padding: 20,
                    borderStyle: "dashed",
                    color: "#64748b",
                  }}
                >
                  Nessun articolo presente in questo cassetto.
                </div>
              )}

              {form.articoli.map((articolo, index) => (
                <div key={articolo.id ?? index} style={{ ...styles.card, padding: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Articolo {index + 1}</div>
                    {editing && (
                      <BasicButton onClick={() => removeArticle(index)}>
                        <Trash2 size={16} />
                        Rimuovi
                      </BasicButton>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div>
                      <label style={styles.label}>Codice a barre</label>
                      <input
                        style={styles.input}
                        value={articolo.codiceBarre ?? ""}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(index, "codiceBarre", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Codice interno</label>
                      <input
                        style={styles.input}
                        value={articolo.codiceInterno ?? ""}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(index, "codiceInterno", e.target.value)
                        }
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={styles.label}>Articolo</label>
                      <input
                        style={styles.input}
                        value={articolo.articolo ?? ""}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(index, "articolo", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Quantità</label>
                      <input
                        style={styles.input}
                        type="number"
                        min="0"
                        value={articolo.quantita ?? 0}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(index, "quantita", Math.max(0, Number(e.target.value) || 0))
                        }
                      />
                    </div>

                    <div>
                      <label style={styles.label}>UM</label>
                      <input
                        style={styles.input}
                        value={articolo.um ?? "pz"}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(index, "um", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Quantità minima</label>
                      <input
                        style={styles.input}
                        type="number"
                        min="0"
                        value={articolo.quantitaMinima ?? 0}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(
                            index,
                            "quantitaMinima",
                            Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Note</label>
                      <input
                        style={styles.input}
                        value={articolo.note ?? ""}
                        readOnly={!editing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateArticleField(index, "note", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              <BasicButton onClick={closeModal}>Chiudi</BasicButton>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={showSettings}
        onClose={closeSettings}
        exportButtonEnabled={pendingExportButtonEnabled}
        onExportButtonEnabledChange={setPendingExportButtonEnabled}
        swapButtonEnabled={pendingSwapButtonEnabled}
        onSwapButtonEnabledChange={setPendingSwapButtonEnabled}
        themeButtonEnabled={pendingThemeButtonEnabled}
        onThemeButtonEnabledChange={setPendingThemeButtonEnabled}
        apiMode={pendingApiMode}
        onApiModeChange={setPendingApiMode}
        localApiPort={pendingLocalApiPort}
        onLocalApiPortChange={setPendingLocalApiPort}
      />

      <FilteredDrawersModal
        isOpen={filterModal.isOpen}
        onClose={() => setFilterModal({ ...filterModal, isOpen: false })}
        title={filterModal.title}
        drawers={
          filterModal.type === "occupati"
            ? drawers.filter((d) => d.stato === "Occupato")
            : filterModal.type === "vuoti"
            ? drawers.filter((d) => d.stato === "Vuoto")
            : filterModal.type === "sottoScorta"
            ? drawers.filter((d) => getDrawerSummary(d).sottoScorta)
            : []
        }
        onDrawerClick={(drawer) => {
          openDrawer(drawer);
          setFilterModal({ ...filterModal, isOpen: false });
        }}
      />
    </div>
  );
}