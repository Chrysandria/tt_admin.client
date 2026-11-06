"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ApiError,
  apiAssetUrl,
  apiRequest,
  Order,
  OrderStatus,
  Product,
  User,
} from "@/lib/api";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Section = "dashboard" | "orders" | "products" | "users";
type DialogState =
  | { type: "user"; user?: User }
  | { type: "product"; product?: Product }
  | { type: "order" }
  | null;

const navigation: { id: Section; label: string; icon: "grid" | "bag" | "package" | "users" }[] = [
  { id: "dashboard", label: "Vue d’ensemble", icon: "grid" },
  { id: "orders", label: "Commandes", icon: "bag" },
  { id: "products", label: "Produits", icon: "package" },
];

const sectionPaths: Record<Section, string> = {
  dashboard: "/dashboard",
  orders: "/commandes",
  products: "/produits",
  users: "/utilisateurs",
};

function getSectionFromPath(pathname: string): Section {
  switch (pathname) {
    case sectionPaths.orders:
      return "orders";
    case sectionPaths.products:
      return "products";
    case sectionPaths.users:
      return "users";
    default:
      return "dashboard";
  }
}

const statusLabels: Record<OrderStatus, string> = {
  reserved: "En attente",
  payed: "Payée",
  canceled: "Annulée",
};

function isAdmin(user: User) {
  return user.type === "admin";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export default function AdminApp() {
  const pathname = usePathname();
  const router = useRouter();
  const section = pathname === "/" ? "dashboard" : getSectionFromPath(pathname);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const reloadData = useCallback(async (activeUser: User) => {
    const [nextProducts, nextOrders, nextUsers] = await Promise.all([
      apiRequest<Product[]>("/products"),
      apiRequest<Order[]>("/orders"),
      isAdmin(activeUser) ? apiRequest<User[]>("/users") : Promise.resolve([]),
    ]);
    setProducts(nextProducts);
    setOrders(nextOrders);
    setUsers(nextUsers);
  }, []);

  function navigateToSection(nextSection: Section) {
    setQuery("");
    setError("");
    setNotice("");
    router.push(sectionPaths[nextSection]);
  }

  useEffect(() => {
    let active = true;
    apiRequest<User>("/auth/me")
      .then(async (currentUser) => {
        if (!active) return;
        setUser(currentUser);
        await reloadData(currentUser);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Impossible de joindre le serveur.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadData]);

  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== "/") {
      router.replace("/");
      return;
    }
    if (user && pathname === "/") {
      router.replace(sectionPaths.dashboard);
      return;
    }
    if (user && section === "users" && !isAdmin(user)) {
      router.replace(sectionPaths.dashboard);
    }
  }, [loading, pathname, router, section, user]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const visibleNavigation = useMemo(
    () =>
      user && isAdmin(user)
        ? [...navigation, { id: "users" as const, label: "Utilisateurs", icon: "users" as const }]
        : navigation,
    [user],
  );

  const filteredOrders = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value
      ? orders.filter(
          (order) =>
            order.id.toLocaleLowerCase().includes(value) ||
            order.product?.nom.toLocaleLowerCase().includes(value),
        )
      : orders;
  }, [orders, query]);

  const filteredProducts = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value
      ? products.filter((product) => product.nom.toLocaleLowerCase().includes(value))
      : products;
  }, [products, query]);

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value
      ? users.filter(
          (account) =>
            account.nom.toLocaleLowerCase().includes(value) ||
            account.email.toLocaleLowerCase().includes(value) ||
            account.type.toLocaleLowerCase().includes(value),
        )
      : users;
  }, [users, query]);

  async function handleLogin(email: string, password: string, stayConnected: boolean) {
    setSigningIn(true);
    setError("");
    try {
      const result = await apiRequest<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, stayConnected }),
      });
      setUser(result.user);
      await reloadData(result.user);
      router.push(sectionPaths.dashboard);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La connexion a échoué. Vérifiez vos identifiants.",
      );
    } finally {
      setSigningIn(false);
      setLoading(false);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
      setUser(null);
      setProducts([]);
      setOrders([]);
      setUsers([]);
      setNotice("");
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La déconnexion a échoué.");
    }
  }

  async function saveUser(values: UserFormValues) {
    if (!dialog || dialog.type !== "user" || !user) return;
    setSaving(true);
    setError("");
    try {
      let activeUser = user;
      if (dialog.user) {
        const updatedUser = await apiRequest<User>(`/users/${dialog.user.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        if (dialog.user.id === user.id) {
          activeUser = updatedUser;
          setUser(updatedUser);
          if (!isAdmin(updatedUser)) router.replace(sectionPaths.dashboard);
        }
      } else {
        await apiRequest<User>("/users", {
          method: "POST",
          body: JSON.stringify(values),
        });
      }
      await reloadData(activeUser);
      setDialog(null);
      setNotice(
        dialog.user
          ? "Le compte a été mis à jour."
          : `Le compte a été créé. Le mot de passe provisoire a été envoyé à ${values.email}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer ce compte.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(account: User) {
    if (
      !window.confirm(`Supprimer le compte de ${account.nom} ?`) ||
      !user
    ) {
      return;
    }
    setError("");
    try {
      await apiRequest<void>(`/users/${account.id}`, { method: "DELETE" });
      await reloadData(user);
      setNotice("Le compte a été supprimé.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer ce compte.");
    }
  }

  async function saveProduct(values: ProductFormValues) {
    if (!dialog || dialog.type !== "product" || !user) return;
    setSaving(true);
    setError("");
    try {
      const body: BodyInit =
        values.image || values.removeImage
          ? (() => {
              const form = new FormData();
              form.set("nom", values.nom);
              form.set("prix", values.prix);
              form.set("initial", String(values.initial));
              if (values.available !== undefined) {
                form.set("available", String(values.available));
              }
              if (values.image) form.set("image", values.image);
              if (values.removeImage) form.set("removeImage", "true");
              return form;
            })()
          : JSON.stringify({
              nom: values.nom,
              prix: values.prix,
              initial: values.initial,
              ...(values.available === undefined
                ? {}
                : { available: values.available }),
            });
      if (dialog.product) {
        await apiRequest<Product>(`/products/${dialog.product.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        await apiRequest<Product>("/products", {
          method: "POST",
          body,
        });
      }
      await reloadData(user);
      setDialog(null);
      setNotice(dialog.product ? "Le produit a été mis à jour." : "Le produit a été ajouté.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer ce produit.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder(values: OrderFormValues) {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest<Order>("/orders", {
        method: "POST",
        body: JSON.stringify(values),
      });
      await reloadData(user);
      setDialog(null);
      setNotice("La commande a été créée.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de créer la commande.");
    } finally {
      setSaving(false);
    }
  }

  async function updateOrderStatus(order: Order, status: OrderStatus) {
    if (!user || order.status === status) return;
    setError("");
    try {
      await apiRequest<Order>(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await reloadData(user);
      setNotice("Le statut de la commande a été mis à jour.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de modifier la commande.");
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <Image src="/Logo.jfif.jpg" alt="Tiako dia Tiako" width={76} height={76} priority />
        <span className="loading-dot" />
        <p>Préparation de votre espace…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        busy={signingIn}
        error={error}
        onSubmit={handleLogin}
      />
    );
  }

  const currentSection = visibleNavigation.find((item) => item.id === section);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <Image
            src="/Logo.jfif.jpg"
            alt="Tiako dia Tiako"
            width={56}
            height={56}
            className="brand-logo"
            priority
          />
          <div>
            <p className="brand-name">Tiako dia Tiako</p>
            <span className="brand-caption">ESPACE ADMIN</span>
          </div>
        </div>
        <div className="nav-label">MENU PRINCIPAL</div>
        <nav className="side-nav" aria-label="Navigation principale">
          {visibleNavigation.map((item) => (
            <button
              className={`nav-item ${section === item.id ? "nav-item-active" : ""}`}
              key={item.id}
              onClick={() => navigateToSection(item.id)}
              type="button"
            >
              <Icon name={item.icon} className="nav-icon" />
              <span>{item.label}</span>
              {section === item.id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon"><Icon name="sparkle" /></span>
          <div>
            <strong>Tout en douceur</strong>
            <p>Gérez votre boutique en un clin d’œil.</p>
          </div>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{initials(user.nom)}</span>
          <span className="account-copy">
            <strong>{user.nom}</strong>
            <small>{isAdmin(user) ? "Administrateur" : "Équipe"}</small>
          </span>
          <button className="icon-button logout-button" onClick={handleLogout} type="button" aria-label="Se déconnecter" title="Se déconnecter">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="mobile-topbar">
        <div className="mobile-topbar-head">
          <div className="brand-lockup">
            <Image src="/Logo.jfif.jpg" alt="" width={42} height={42} className="brand-logo" />
            <div><p className="brand-name">Tiako dia Tiako</p><span className="brand-caption">ESPACE ADMIN</span></div>
          </div>
          <button className="icon-button" onClick={handleLogout} type="button" aria-label="Se déconnecter"><Icon name="logout" /></button>
        </div>
        <nav className="mobile-nav" aria-label="Navigation principale">
          {visibleNavigation.map((item) => (
            <button
              aria-current={section === item.id ? "page" : undefined}
              className={`mobile-nav-item ${section === item.id ? "mobile-nav-item-active" : ""}`}
              key={item.id}
              onClick={() => navigateToSection(item.id)}
              type="button"
            >
              <Icon name={item.icon} />{item.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Boutique</span><Icon name="chevron" /><strong>{currentSection?.label ?? "Vue d’ensemble"}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-field">
              <Icon name="search" />
              <input
                aria-label="Rechercher"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher..."
                ref={searchRef}
                value={query}
              />
              <kbd>⌘ K</kbd>
            </label>
            <span className="topbar-divider" />
            <div className="topbar-user">
              <span className="avatar avatar-small">{initials(user.nom)}</span>
              <div><strong>{user.nom}</strong><small>{isAdmin(user) ? "Admin" : "Équipe"}</small></div>
            </div>
          </div>
        </header>

        <div className="page-content">
          {(error || notice) && (
            <div className={`notice-banner ${error ? "notice-error" : "notice-success"}`} role={error ? "alert" : "status"}>
              <span>{error || notice}</span>
              <button type="button" className="notice-dismiss" onClick={() => { setError(""); setNotice(""); }} aria-label="Fermer"><Icon name="close" /></button>
            </div>
          )}

          {section === "dashboard" && (
            <DashboardSection
              orders={orders}
              products={products}
              users={users}
              user={user}
              onNavigate={navigateToSection}
              onUpdateStatus={updateOrderStatus}
            />
          )}
          {section === "orders" && (
            <OrdersSection
              orders={filteredOrders}
              onAdd={() => setDialog({ type: "order" })}
              onUpdateStatus={updateOrderStatus}
            />
          )}
          {section === "products" && (
            <ProductsSection
              products={filteredProducts}
              onAdd={() => setDialog({ type: "product" })}
              onEdit={(product) => setDialog({ type: "product", product })}
            />
          )}
          {section === "users" && isAdmin(user) && (
            <UsersSection
              currentUser={user}
              users={filteredUsers}
              onAdd={() => setDialog({ type: "user" })}
              onDelete={deleteUser}
              onEdit={(account) => setDialog({ type: "user", user: account })}
            />
          )}
        </div>
      </main>

      {dialog?.type === "user" && (
        <UserDialog
          busy={saving}
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSave={saveUser}
        />
      )}
      {dialog?.type === "product" && (
        <ProductDialog
          busy={saving}
          product={dialog.product}
          onClose={() => setDialog(null)}
          onSave={saveProduct}
        />
      )}
      {dialog?.type === "order" && (
        <OrderDialog
          busy={saving}
          products={products.filter((product) => product.available > 0)}
          onClose={() => setDialog(null)}
          onSave={saveOrder}
        />
      )}
    </div>
  );
}

function LoginScreen({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onSubmit: (email: string, password: string, stayConnected: boolean) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayConnected, setStayConnected] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(email.trim(), password, stayConnected);
  }

  return (
    <main className="login-layout">
      <section className="login-brand-panel">
        <div className="login-brand">
          <Image src="/Logo.jfif.jpg" alt="Logo Tiako dia Tiako" width={92} height={92} priority />
          <span>Tiako dia Tiako</span>
        </div>
        <div className="login-promo">
          <span className="eyebrow"><Icon name="sparkle" /> VOTRE BOUTIQUE, EN HARMONIE</span>
          <h1>Une belle histoire<br />se gère <em>simplement.</em></h1>
          <p>Retrouvez vos commandes, vos produits et votre équipe dans un espace pensé pour vous.</p>
          <div className="promo-decoration" aria-hidden="true">
            <span className="promo-circle" /><span className="promo-line" />
            <span className="promo-stat"><strong>♡</strong><small>Fait avec amour</small></span>
          </div>
        </div>
        <span className="login-footer-copy">© {new Date().getFullYear()} Tiako dia Tiako · Votre coup de cœur</span>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="mobile-login-brand">
            <Image src="/Logo.jfif.jpg" alt="Logo Tiako dia Tiako" width={66} height={66} />
            <span>Tiako dia Tiako</span>
          </div>
          <span className="login-kicker">RAVIE DE VOUS REVOIR</span>
          <h2>Bon retour <span>♡</span></h2>
          <p className="login-intro">Connectez-vous pour retrouver votre espace de gestion.</p>
          <form onSubmit={submit} className="login-form">
            <label className="form-label" htmlFor="login-email">Adresse e-mail</label>
            <div className="input-with-icon">
              <Icon name="mail" />
              <input
                autoComplete="email"
                id="login-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vous@exemple.com"
                required
                type="email"
                value={email}
              />
            </div>
            <label className="form-label password-label" htmlFor="login-password">Mot de passe</label>
            <div className="input-with-icon">
              <Icon name="lock" />
              <input
                autoComplete="current-password"
                id="login-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Votre mot de passe"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button className="password-toggle" type="button" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword(!showPassword)}>
                <Icon name={showPassword ? "eyeOff" : "eye"} />
              </button>
            </div>
            <label className="remember-check">
              <input checked={stayConnected} onChange={(event) => setStayConnected(event.target.checked)} type="checkbox" />
              <span className="custom-checkbox"><Icon name="check" /></span>
              <span>Rester connecté·e</span>
            </label>
            {error && <div className="login-error" role="alert">{error}</div>}
            <Button className="login-submit" disabled={busy} type="submit">
              {busy ? <><span className="button-spinner" /> Connexion en cours…</> : <>Se connecter <span>→</span></>}
            </Button>
          </form>
          <p className="login-help">Besoin d’aide ? <a href="mailto:support@tiakodiatiako.com">Contactez votre administrateur</a></p>
        </div>
        <div className="login-form-bottom"><span>♡</span> Un espace à votre image</div>
      </section>
    </main>
  );
}

function DashboardSection({
  orders,
  products,
  users,
  user,
  onNavigate,
  onUpdateStatus,
}: {
  orders: Order[];
  products: Product[];
  users: User[];
  user: User;
  onNavigate: (section: Section) => void;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
}) {
  const paidOrders = orders.filter((order) => order.status === "payed");
  const waitingOrders = orders.filter((order) => order.status === "reserved");
  const soldUnits = paidOrders.reduce((total, order) => total + order.quantity, 0);
  const lowStock = products.filter((product) => product.available <= 5);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() - (5 - index));
    const count = orders.filter((order) => {
      const date = new Date(order.createdAt);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    }).length;
    return { label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(month), count };
  });
  const peak = Math.max(...trend.map((item) => item.count), 1);
  const greetingName = user.nom.trim().split(/\s+/)[0];

  return (
    <>
      <div className="page-heading heading-dashboard">
        <div>
          <div className="date-line">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</div>
          <h1>Bonjour, {greetingName} <span className="wave">✦</span></h1>
          <p>Voici ce qui se passe dans votre boutique aujourd’hui.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("orders")} type="button"><Icon name="bag" /> Voir les commandes</button>
      </div>

      <section className="stats-grid" aria-label="Indicateurs clés">
        <StatCard label="Commandes totales" value={formatNumber(orders.length)} note={`${formatNumber(waitingOrders.length)} en attente`} icon="bag" tone="pink" />
        <StatCard label="Commandes payées" value={formatNumber(paidOrders.length)} note={`${formatNumber(soldUnits)} article${soldUnits === 1 ? "" : "s"} vendu${soldUnits === 1 ? "" : "s"}`} icon="check" tone="gold" />
        <StatCard label="Produits en boutique" value={formatNumber(products.length)} note={`${formatNumber(lowStock.length)} stock${lowStock.length === 1 ? "" : "s"} à surveiller`} icon="package" tone="lavender" />
        <StatCard label="Comptes équipe" value={formatNumber(isAdmin(user) ? users.length : 1)} note={isAdmin(user) ? "Comptes actifs" : "Votre compte"} icon="users" tone="peach" />
      </section>

      <section className="dashboard-grid">
        <div className="panel trend-panel">
          <div className="panel-header">
            <div><h2>Activité des commandes</h2><p>Les six derniers mois</p></div>
            <span className="chart-legend"><i /> Commandes</span>
          </div>
          <div className="chart-area">
            <div className="chart-y-labels"><span>{peak}</span><span>{Math.ceil(peak / 2)}</span><span>0</span></div>
            <div className="bar-chart">
              {trend.map((item, index) => (
                <div className="bar-column" key={`${item.label}-${index}`}>
                  <div className="bar-value">{item.count || ""}</div>
                  <div className={`bar-track ${index === trend.length - 1 ? "bar-track-current" : ""}`}>
                    <span style={{ height: `${Math.max(7, (item.count / peak) * 100)}%` }} />
                  </div>
                  <span className="bar-month">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="panel stock-panel">
          <div className="panel-header">
            <div><h2>Stock à surveiller</h2><p>Produits presque épuisés</p></div>
            <button className="text-link" onClick={() => onNavigate("products")} type="button">Tout voir <Icon name="chevron" /></button>
          </div>
          {lowStock.length === 0 ? (
            <div className="empty-mini"><span className="empty-check"><Icon name="check" /></span><strong>Tout va bien !</strong><p>Aucun stock faible pour le moment.</p></div>
          ) : (
            <div className="stock-list">
              {lowStock.slice(0, 4).map((product) => (
                <div className="stock-row" key={product.id}>
                  <span className="product-initial">{initials(product.nom)}</span>
                  <span className="stock-name"><strong>{product.nom}</strong><small>Stock disponible</small></span>
                  <span className={`stock-count ${product.available === 0 ? "stock-empty" : ""}`}>{product.available} <small>unité{product.available === 1 ? "" : "s"}</small></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-header">
          <div><h2>Commandes récentes</h2><p>Suivez les dernières commandes de votre boutique.</p></div>
          <button className="text-link" onClick={() => onNavigate("orders")} type="button">Toutes les commandes <Icon name="chevron" /></button>
        </div>
        <OrdersTable orders={orders.slice(0, 5)} onUpdateStatus={onUpdateStatus} compact />
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: "bag" | "check" | "package" | "users";
  tone: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon name={icon} /></span></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </article>
  );
}

function OrdersSection({
  orders,
  onAdd,
  onUpdateStatus,
}: {
  orders: Order[];
  onAdd: () => void;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">SUIVI &amp; ORGANISATION</span><h1>Commandes</h1><p>Gardez un œil sur chaque commande de votre boutique.</p></div>
        <button className="btn btn-primary" onClick={onAdd} type="button"><Icon name="plus" /> Nouvelle commande</button>
      </div>
      <div className="table-summary"><span><strong>{formatNumber(orders.length)}</strong> commande{orders.length === 1 ? "" : "s"}</span><span className="table-filter-label"><Icon name="filter" /> Résultats</span></div>
      <section className="panel table-panel"><OrdersTable orders={orders} onUpdateStatus={onUpdateStatus} /></section>
    </>
  );
}

function OrdersTable({
  orders,
  onUpdateStatus,
  compact = false,
}: {
  orders: Order[];
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
  compact?: boolean;
}) {
  if (orders.length === 0) {
    return <EmptyState title="Aucune commande pour le moment" text="Les commandes apparaîtront ici dès leur création." />;
  }
  return (
    <div className="table-scroll">
      <table className="data-table orders-table">
        <thead><tr><th>Référence</th><th>Produit</th><th>Date</th><th>Quantité</th><th>Statut</th>{!compact && <th>Action</th>}</tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td><span className="order-reference">#{order.id.slice(0, 8).toLocaleUpperCase()}</span></td>
              <td><span className="table-product"><span className="product-initial">{initials(order.product?.nom ?? "?")}</span><strong>{order.product?.nom ?? "Produit supprimé"}</strong></span></td>
              <td className="muted-cell">{formatDate(order.createdAt)}</td>
              <td><span className="quantity-cell">{order.quantity}</span></td>
              <td><StatusBadge status={order.status} /></td>
              {!compact && (
                <td>
                  <select
                    aria-label={`Modifier le statut de la commande ${order.id}`}
                    className="status-select"
                    onChange={(event) => onUpdateStatus(order, event.target.value as OrderStatus)}
                    value={order.status}
                  >
                    {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge status-${status}`}><i />{statusLabels[status] ?? status}</span>;
}

function ProductsSection({
  products,
  onAdd,
  onEdit,
}: {
  products: Product[];
  onAdd: () => void;
  onEdit: (product: Product) => void;
}) {
  const availableUnits = products.reduce((sum, product) => sum + product.available, 0);
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">CATALOGUE &amp; INVENTAIRE</span><h1>Produits</h1><p>Suivez vos articles et gardez votre stock à jour.</p></div>
        <button className="btn btn-primary" onClick={onAdd} type="button"><Icon name="plus" /> Ajouter un produit</button>
      </div>
      <div className="product-overview">
        <div className="product-overview-card"><span className="stat-icon stat-pink"><Icon name="package" /></span><div><span>Références actives</span><strong>{formatNumber(products.length)}</strong></div></div>
        <div className="product-overview-card"><span className="stat-icon stat-gold"><Icon name="check" /></span><div><span>Unités disponibles</span><strong>{formatNumber(availableUnits)}</strong></div></div>
        <div className="product-overview-card"><span className="stat-icon stat-peach"><Icon name="clock" /></span><div><span>Stocks faibles</span><strong>{formatNumber(products.filter((product) => product.available <= 5).length)}</strong></div></div>
      </div>
      <section className="panel table-panel">
        <div className="panel-header table-panel-heading"><div><h2>Catalogue produits</h2><p>Inventaire et disponibilité en temps réel.</p></div><span className="table-count">{products.length} produit{products.length === 1 ? "" : "s"}</span></div>
        {products.length === 0 ? <EmptyState title="Votre catalogue est vide" text="Ajoutez votre premier produit pour commencer." /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Produit</th><th>Prix</th><th>Stock disponible</th><th>Stock initial</th><th>État</th><th /></tr></thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td><span className="table-product">{product.imageUrl ? <Image alt="" className="product-image-thumbnail" height={40} src={apiAssetUrl(product.imageUrl)!} unoptimized width={40} /> : <span className="product-initial product-initial-large">{initials(product.nom)}</span>}<span className="product-title"><strong>{product.nom}</strong><small>Ajouté le {formatDate(product.createdAt)}</small></span></span></td>
                    <td className="price-cell">{product.prix || "—"}</td>
                    <td><span className={`inventory-number ${product.available <= 5 ? "inventory-low" : ""}`}>{product.available}</span> <span className="muted-cell">unités</span></td>
                    <td className="muted-cell">{product.initial}</td>
                    <td><span className={`inventory-badge ${product.available === 0 ? "inventory-none" : product.available <= 5 ? "inventory-warning" : "inventory-ok"}`}><i />{product.available === 0 ? "Épuisé" : product.available <= 5 ? "Stock faible" : "En stock"}</span></td>
                    <td><button className="icon-button row-action" type="button" onClick={() => onEdit(product)} aria-label={`Modifier ${product.nom}`} title="Modifier"><Icon name="edit" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function UsersSection({
  currentUser,
  users,
  onAdd,
  onDelete,
  onEdit,
}: {
  currentUser: User;
  users: User[];
  onAdd: () => void;
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">ÉQUIPE &amp; ACCÈS</span><h1>Utilisateurs</h1><p>Gérez les comptes et les accès à votre espace.</p></div>
        <button className="btn btn-primary" onClick={onAdd} type="button"><Icon name="plus" /> Ajouter un compte</button>
      </div>
      <div className="user-overview">
        <div className="user-overview-icon"><Icon name="users" /></div>
        <div><strong>{formatNumber(users.length)} compte{users.length === 1 ? "" : "s"} utilisateur{users.length === 1 ? "" : "s"}</strong><span>Seuls les administrateurs peuvent gérer les accès.</span></div>
        <span className="admin-access-chip"><Icon name="lock" /> Accès administrateur</span>
      </div>
      <section className="panel table-panel">
        <div className="panel-header table-panel-heading"><div><h2>Comptes actifs</h2><p>Les mots de passe ne sont jamais affichés.</p></div><span className="table-count">{users.length} compte{users.length === 1 ? "" : "s"}</span></div>
        {users.length === 0 ? <EmptyState title="Aucun compte utilisateur" text="Créez un compte pour inviter une personne dans l’équipe." /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Utilisateur</th><th>Profil</th><th>Créé le</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.id}>
                    <td><span className="table-product"><span className={`avatar table-avatar ${isAdmin(account) ? "avatar-admin" : ""}`}>{initials(account.nom)}</span><span className="product-title"><strong>{account.nom}{account.id === currentUser.id && <span className="you-label">Vous</span>}</strong><small>{account.email}</small></span></span></td>
                    <td><span className={`role-badge ${isAdmin(account) ? "role-admin" : "role-user"}`}><i />{isAdmin(account) ? "Administrateur" : "Utilisateur"}</span></td>
                    <td className="muted-cell">{formatDate(account.createdAt)}</td>
                    <td><span className="inventory-badge inventory-ok"><i />Actif</span></td>
                    <td><div className="row-actions">
                      <button className="icon-button row-action" type="button" onClick={() => onEdit(account)} title="Modifier" aria-label={`Modifier ${account.nom}`}><Icon name="edit" /></button>
                      <button className="icon-button row-action row-action-danger" type="button" onClick={() => onDelete(account)} disabled={account.id === currentUser.id} title={account.id === currentUser.id ? "Vous ne pouvez pas supprimer votre propre compte" : "Supprimer"} aria-label={`Supprimer ${account.nom}`}><Icon name="trash" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon name="sparkle" /></span><strong>{title}</strong><p>{text}</p></div>;
}

interface UserFormValues {
  email: string;
  type: "admin" | "user";
  nom?: string;
}

function UserDialog({
  busy,
  user,
  onClose,
  onSave,
}: {
  busy: boolean;
  user?: User;
  onClose: () => void;
  onSave: (values: UserFormValues) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = form.get("type");
    if (type !== "admin" && type !== "user") return;
    onSave({
      email: String(form.get("email") ?? "").trim(),
      type,
      ...(user
        ? {
            nom: String(form.get("nom") ?? "").trim(),
          }
        : {}),
    });
  }
  return (
    <DialogFrame
      onClose={onClose}
      title={user ? "Modifier un compte" : "Créer un compte"}
      subtitle={user ? "Modifiez le nom ou le type de ce compte." : "Saisissez l’adresse e-mail et choisissez le type de compte."}
    >
      <form className="dialog-form" onSubmit={submit}>
        <label className="form-label" htmlFor="user-email">Adresse e-mail</label><Input defaultValue={user?.email} id="user-email" name="email" placeholder="vous@exemple.com" required type="email" />
        <label className="form-label" htmlFor="user-type">Type de compte</label>
        <select className="field-control" defaultValue={user?.type ?? ""} id="user-type" name="type" required>
          {!user && <option disabled value="">Choisir un type de compte</option>}
          <option value="user">Utilisateur</option><option value="admin">Administrateur</option>
        </select>
        {user ? (
          <>
            <label className="form-label" htmlFor="user-name">Nom complet</label><Input defaultValue={user.nom} id="user-name" name="nom" placeholder="Ex. Marie Dupont" required />
          </>
        ) : <p className="dialog-hint"><Icon name="mail" /> Un mot de passe provisoire sera généré et envoyé par e-mail.</p>}
        <DialogActions busy={busy} onClose={onClose} submitLabel={user ? "Enregistrer" : "Créer le compte"} />
      </form>
    </DialogFrame>
  );
}

interface ProductFormValues {
  nom: string;
  prix: string;
  initial: number;
  available?: number;
  image?: File;
  removeImage?: boolean;
}

function ProductDialog({
  busy,
  product,
  onClose,
  onSave,
}: {
  busy: boolean;
  product?: Product;
  onClose: () => void;
  onSave: (values: ProductFormValues) => void;
}) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    apiAssetUrl(product?.imageUrl ?? null),
  );

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      nom: String(form.get("nom") ?? "").trim(),
      prix: String(form.get("prix") ?? "").trim(),
      initial: Number(form.get("initial")),
      ...(product ? { available: Number(form.get("available")) } : {}),
      ...(selectedImage ? { image: selectedImage } : {}),
      ...(removeImage ? { removeImage: true } : {}),
    });
  }
  return (
    <DialogFrame onClose={onClose} title={product ? "Modifier le produit" : "Ajouter un produit"} subtitle="Les informations seront visibles dans votre catalogue.">
      <form className="dialog-form" onSubmit={submit}>
        <label className="form-label" htmlFor="product-name">Nom du produit</label><Input defaultValue={product?.nom} id="product-name" name="nom" placeholder="Ex. Sac en raphia" required />
        <label className="form-label" htmlFor="product-price">Prix</label><Input defaultValue={product?.prix} id="product-price" name="prix" placeholder="Ex. 25 000" />
        <div className="form-two-columns">
          <div><label className="form-label" htmlFor="product-initial">Stock initial</label><Input defaultValue={product?.initial ?? 0} id="product-initial" min="0" name="initial" required type="number" /></div>
          {product && <div><label className="form-label" htmlFor="product-available">Stock disponible</label><Input defaultValue={product.available} id="product-available" min="0" name="available" required type="number" /></div>}
        </div>
        <label className="form-label" htmlFor="product-image">Image du produit</label>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="field-control image-file-input"
          id="product-image"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setSelectedImage(file);
            if (file) {
              setRemoveImage(false);
              setPreviewUrl(URL.createObjectURL(file));
            } else {
              setPreviewUrl(removeImage ? null : apiAssetUrl(product?.imageUrl ?? null));
            }
          }}
          type="file"
        />
        {previewUrl && <Image alt="Aperçu du produit" className="product-image-preview" height={96} src={previewUrl} unoptimized width={96} />}
        {product?.imageUrl && !removeImage && (
          <button className="remove-image-button" onClick={() => { setRemoveImage(true); setSelectedImage(null); setPreviewUrl(null); }} type="button">Retirer l’image actuelle</button>
        )}
        <DialogActions busy={busy} onClose={onClose} submitLabel={product ? "Enregistrer" : "Ajouter le produit"} />
      </form>
    </DialogFrame>
  );
}

interface OrderFormValues {
  product_id: string;
  quantity: number;
  status: OrderStatus;
}

function OrderDialog({
  busy,
  products,
  onClose,
  onSave,
}: {
  busy: boolean;
  products: Product[];
  onClose: () => void;
  onSave: (values: OrderFormValues) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      product_id: String(form.get("productId") ?? ""),
      quantity: Number(form.get("quantity")),
      status: String(form.get("status") ?? "reserved") as OrderStatus,
    });
  }
  return (
    <DialogFrame onClose={onClose} title="Nouvelle commande" subtitle="Enregistrez une commande et réservez le stock correspondant.">
      <form className="dialog-form" onSubmit={submit}>
        <label className="form-label" htmlFor="order-product">Produit</label>
        <select className="field-control" defaultValue="" id="order-product" name="productId" required>
          <option disabled value="">Choisir un produit</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.nom} · {product.available} disponible{product.available === 1 ? "" : "s"}</option>)}
        </select>
        {products.length === 0 && <p className="dialog-hint">Aucun produit n’a de stock disponible.</p>}
        <label className="form-label" htmlFor="order-quantity">Quantité</label><Input defaultValue={1} id="order-quantity" min="1" name="quantity" required type="number" />
        <label className="form-label" htmlFor="order-status">Statut initial</label>
        <select className="field-control" defaultValue="reserved" id="order-status" name="status"><option value="reserved">En attente</option><option value="payed">Payée</option><option value="canceled">Annulée</option></select>
        <DialogActions busy={busy} disabled={products.length === 0} onClose={onClose} submitLabel="Créer la commande" />
      </form>
    </DialogFrame>
  );
}

function DialogFrame({
  children,
  onClose,
  subtitle,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="dialog-title" aria-modal="true" className="dialog-card" role="dialog">
        <div className="dialog-header"><div><span className="dialog-eyebrow">TIAKO DIA TIAKO</span><h2 id="dialog-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button dialog-close" onClick={onClose} type="button" aria-label="Fermer"><Icon name="close" /></button></div>
        {children}
      </section>
    </div>
  );
}

function DialogActions({
  busy,
  disabled = false,
  onClose,
  submitLabel,
}: {
  busy: boolean;
  disabled?: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="dialog-actions">
      <button className="btn btn-ghost" disabled={busy} onClick={onClose} type="button">Annuler</button>
      <button className="btn btn-primary" disabled={busy || disabled} type="submit">{busy ? <><span className="button-spinner" /> Enregistrement…</> : submitLabel}</button>
    </div>
  );
}
