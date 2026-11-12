"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ApiError,
  apiAssetUrl,
  apiRequest,
  FacebookPageSettings,
  Order,
  OrderStatus,
  Product,
  User,
} from "@/lib/api";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Section =
  | "dashboard"
  | "orders"
  | "products"
  | "users"
  | "facebook"
  | "security";
type DialogState =
  | { type: "user"; user?: User }
  | { type: "product"; product?: Product }
  | { type: "order"; order?: Order }
  | { type: "delete-product"; product: Product }
  | null;

const navigation: { id: Section; label: string; icon: "grid" | "bag" | "package" | "users" | "facebook" | "lock" }[] = [
  { id: "dashboard", label: "Vue d’ensemble", icon: "grid" },
  { id: "orders", label: "Commandes", icon: "bag" },
  { id: "products", label: "Produits", icon: "package" },
  { id: "security", label: "Sécurité", icon: "lock" },
];

const sectionPaths: Record<Section, string> = {
  dashboard: "/dashboard",
  orders: "/commandes",
  products: "/produits",
  users: "/utilisateurs",
  facebook: "/facebook",
  security: "/securite",
};

function getSectionFromPath(pathname: string): Section {
  switch (pathname) {
    case sectionPaths.orders:
      return "orders";
    case sectionPaths.products:
      return "products";
    case sectionPaths.users:
      return "users";
    case sectionPaths.facebook:
      return "facebook";
    case sectionPaths.security:
      return "security";
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

function parseAriaryPrice(value: string) {
  const normalized = value.trim().replace(/[^\d.,]/g, "");
  if (!normalized) return 0;

  const lastSeparator = Math.max(
    normalized.lastIndexOf("."),
    normalized.lastIndexOf(","),
  );
  if (lastSeparator === -1) return Number(normalized) || 0;

  const groups = normalized.split(/[.,]/);
  const wholePart = normalized.slice(0, lastSeparator);
  const fractionalPart = normalized.slice(lastSeparator + 1);
  const isThousandsSeparator =
    groups.length > 1 &&
    groups.slice(1).every((group) => group.length === 3);
  const amount = isThousandsSeparator
    ? Number(normalized.replace(/[.,]/g, ""))
    : Number(
        `${wholePart.replace(/[.,]/g, "")}.${fractionalPart}`,
      );

  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function formatAriary(value: number) {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(value)} Ar`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [facebookSettings, setFacebookSettings] = useState<FacebookPageSettings | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const reloadData = useCallback(async (activeUser: User) => {
    const [nextProducts, nextOrders, nextUsers, nextFacebookSettings] = await Promise.all([
      apiRequest<Product[]>("/products"),
      apiRequest<Order[]>("/orders"),
      isAdmin(activeUser) ? apiRequest<User[]>("/users") : Promise.resolve([]),
      isAdmin(activeUser)
        ? apiRequest<FacebookPageSettings>("/facebook/settings")
        : Promise.resolve(null),
    ]);
    setProducts(nextProducts);
    setOrders(nextOrders);
    setUsers(nextUsers);
    setFacebookSettings(nextFacebookSettings);
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
    if (user && (section === "users" || section === "facebook") && !isAdmin(user)) {
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
        ? [
            ...navigation,
            { id: "users" as const, label: "Utilisateurs", icon: "users" as const },
            { id: "facebook" as const, label: "Facebook", icon: "facebook" as const },
          ]
        : navigation,
    [user],
  );

  const filteredOrders = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value
      ? orders.filter(
          (order) =>
            order.id.toLocaleLowerCase().includes(value) ||
            order.items.some((item) =>
              item.product?.nom.toLocaleLowerCase().includes(value),
            ),
        )
      : orders;
  }, [orders, query]);

  const filteredProducts = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value
      ? products.filter(
          (product) =>
            product.nom.toLocaleLowerCase().includes(value) ||
            product.keywords.some((keyword) =>
              keyword.toLocaleLowerCase().includes(value),
            ),
        )
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
    setLoggingOut(true);
    setError("");
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
      setUser(null);
      setProducts([]);
      setOrders([]);
      setUsers([]);
      setFacebookSettings(null);
      setNotice("");
      setLogoutDialogOpen(false);
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La déconnexion a échoué.");
    } finally {
      setLoggingOut(false);
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
      const body = new FormData();
      const initial = values.colors.length
        ? values.colors.reduce((total, color) => total + color.initial, 0)
        : values.initial;
      body.set("nom", values.nom);
      body.set("description", values.description);
      body.set("keywords", values.keywords.join(", "));
      body.set("colors", JSON.stringify(values.colors));
      body.set("prix", values.prix);
      body.set("initial", String(initial));
      if (values.colors.length === 0 && values.available !== undefined) {
        body.set("available", String(values.available));
      }
      if (values.image) body.set("image", values.image);
      if (values.removeImage) body.set("removeImage", "true");

      let savedProduct: Product;
      if (dialog.product) {
        savedProduct = await apiRequest<Product>(`/products/${dialog.product.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        savedProduct = await apiRequest<Product>("/products", {
          method: "POST",
          body,
        });
      }
      await reloadData(user);
      setDialog(null);
      if (dialog.product) {
        setNotice("Le produit a été mis à jour.");
      } else if (values.publishOnFacebook) {
        const message =
          values.facebookMessage?.trim() ||
          `Nouveau produit : ${values.nom}${values.prix ? `\nPrix : ${values.prix}` : ""}`;
        try {
          await sendFacebookPost(
            message,
            values.image,
            true,
            savedProduct.id,
          );
          await reloadData(user);
          setNotice("Le produit a été enregistré et publié sur Facebook.");
        } catch (publicationCause) {
          setNotice("");
          setError(
            `Le produit a été enregistré, mais la publication Facebook a échoué : ${
              publicationCause instanceof Error
                ? publicationCause.message
                : "erreur inconnue"
            }`,
          );
        }
      } else {
        setNotice("Le produit a été ajouté.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer ce produit.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!user) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<Product>(`/products/${product.id}`, {
        method: "DELETE",
      });
      await reloadData(user);
      setDialog(null);
      setNotice(`Le produit « ${product.nom} » a été supprimé du catalogue.`);
    } catch (cause) {
      setDialog(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de supprimer ce produit.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishExistingProduct(product: Product) {
    if (!user || product.facebookPostId) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<{ published: boolean; postId: string }>(
        `/facebook/products/${product.id}/publish`,
        { method: "POST" },
      );
      await reloadData(user);
      setNotice(`« ${product.nom} » a été publié sur Facebook.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de publier ce produit sur Facebook.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendFacebookPost(
    message: string,
    image?: File,
    includeMessengerLink = false,
    productId?: string,
  ) {
    const form = new FormData();
    form.set("message", message);
    form.set("includeMessengerLink", String(includeMessengerLink));
    if (productId) form.set("productId", productId);
    if (image) form.set("image", image);
    return apiRequest<{ published: boolean; postId: string }>("/facebook/posts", {
      method: "POST",
      body: form,
    });
  }

  async function saveFacebookGreeting(
    greetingMessage: string,
  ): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const settings = await apiRequest<FacebookPageSettings>(
        "/facebook/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ greetingMessage }),
        },
      );
      setFacebookSettings(settings);
      setNotice("Le message automatique a été enregistré.");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d’enregistrer le message automatique.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishFacebookPost(
    message: string,
    image?: File,
    includeMessengerLink = false,
  ): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      await sendFacebookPost(message, image, includeMessengerLink);
      setNotice(
        includeMessengerLink
          ? "La publication a été envoyée avec son lien Messenger."
          : "La publication a été envoyée sur votre Page Facebook.",
      );
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de publier sur Facebook.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder(values: OrderFormValues) {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest<Order>(
        dialog?.type === "order" && dialog.order
          ? `/orders/${dialog.order.id}`
          : "/orders",
        {
          method:
            dialog?.type === "order" && dialog.order ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );
      await reloadData(user);
      setDialog(null);
      setNotice(
        dialog?.type === "order" && dialog.order
          ? "La commande a été mise à jour."
          : "La commande a été créée.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d’enregistrer la commande.",
      );
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

  async function markOrderDelivered(order: Order) {
    if (!user || order.deliveredAt || order.status === "canceled") return;
    setError("");
    try {
      await apiRequest<Order>(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ delivered: true }),
      });
      await reloadData(user);
      setNotice(`La commande #${order.id.slice(0, 8).toLocaleUpperCase()} a été marquée comme livrée.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d’enregistrer la livraison.",
      );
    }
  }

  async function requestPasswordOtp(
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<{ otpSent: boolean }>("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setNotice("Un code de confirmation a été envoyé à l’adresse de votre compte.");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de modifier votre mot de passe.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function confirmPasswordOtp(otp: string): Promise<boolean> {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<{ success: boolean }>("/auth/password/confirm-otp", {
        method: "POST",
        body: JSON.stringify({ otp }),
      });
      setNotice("Votre mot de passe a été modifié.");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de confirmer le changement de mot de passe.",
      );
      return false;
    } finally {
      setSaving(false);
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
          <button className="icon-button logout-button" onClick={() => setLogoutDialogOpen(true)} type="button" aria-label="Se déconnecter" title="Se déconnecter">
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
          <button className="icon-button" onClick={() => setLogoutDialogOpen(true)} type="button" aria-label="Se déconnecter"><Icon name="logout" /></button>
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
          {section === "facebook" && isAdmin(user) && (
            <FacebookSection
              key={facebookSettings?.updatedAt ?? "facebook-settings-loading"}
              busy={saving}
              greetingMessage={facebookSettings?.greetingMessage ?? ""}
              onSaveGreeting={saveFacebookGreeting}
            />
          )}
          {section === "security" && (
            <SecuritySection
              busy={saving}
              onConfirmOtp={confirmPasswordOtp}
              onRequestOtp={requestPasswordOtp}
            />
          )}

          {section === "dashboard" && (
            <DashboardSection
              orders={orders}
              products={products}
              users={users}
              user={user}
              onNavigate={navigateToSection}
              onUpdateDelivery={markOrderDelivered}
              onUpdateStatus={updateOrderStatus}
            />
          )}
          {section === "orders" && (
            <OrdersSection
              orders={filteredOrders}
              onAdd={() => setDialog({ type: "order" })}
              onEdit={(order) => setDialog({ type: "order", order })}
              onUpdateDelivery={markOrderDelivered}
              onUpdateStatus={updateOrderStatus}
            />
          )}
          {section === "products" && (
            <>
              <ProductsSection
                products={filteredProducts}
                canPublish={isAdmin(user)}
                busy={saving}
                onAdd={() => setDialog({ type: "product" })}
                onDelete={(product) =>
                  setDialog({ type: "delete-product", product })
                }
                onEdit={(product) => setDialog({ type: "product", product })}
                onPublish={publishExistingProduct}
              />
              {isAdmin(user) && (
                <FacebookPostComposer
                  busy={saving}
                  onPublish={publishFacebookPost}
                />
              )}
            </>
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
          canPublish={isAdmin(user)}
          product={dialog.product}
          onClose={() => setDialog(null)}
          onSave={saveProduct}
        />
      )}
      {dialog?.type === "order" && (
        <OrderDialog
          key={dialog.order?.id ?? "new-order"}
          busy={saving}
          order={dialog.order}
          products={products.filter(
            (product) =>
              product.available > 0 ||
              dialog.order?.items.some((item) => item.productId === product.id),
          )}
          onClose={() => setDialog(null)}
          onSave={saveOrder}
        />
      )}
      {dialog?.type === "delete-product" && (
        <DeleteProductDialog
          busy={saving}
          product={dialog.product}
          onClose={() => setDialog(null)}
          onConfirm={() => deleteProduct(dialog.product)}
        />
      )}
      {logoutDialogOpen && (
        <LogoutDialog
          busy={loggingOut}
          onClose={() => setLogoutDialogOpen(false)}
          onConfirm={handleLogout}
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
  onUpdateDelivery,
  onUpdateStatus,
}: {
  orders: Order[];
  products: Product[];
  users: User[];
  user: User;
  onNavigate: (section: Section) => void;
  onUpdateDelivery: (order: Order) => void;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
}) {
  const paidOrders = orders.filter((order) => order.status === "payed");
  const waitingOrders = orders.filter((order) => order.status === "reserved");
  const totalSales = paidOrders.reduce(
    (total, order) =>
      total +
      order.items.reduce(
        (orderTotal, item) =>
          orderTotal + parseAriaryPrice(item.product?.prix ?? "") * item.quantity,
        0,
      ),
    0,
  );
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
        <StatCard label="Total des ventes" value={formatAriary(totalSales)} note={`${formatNumber(paidOrders.length)} commande${paidOrders.length === 1 ? "" : "s"} payée${paidOrders.length === 1 ? "" : "s"}`} icon="check" tone="gold" />
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
        <OrdersTable
          orders={orders.slice(0, 5)}
          onUpdateDelivery={onUpdateDelivery}
          onUpdateStatus={onUpdateStatus}
          compact
        />
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
  onEdit,
  onUpdateDelivery,
  onUpdateStatus,
}: {
  orders: Order[];
  onAdd: () => void;
  onEdit: (order: Order) => void;
  onUpdateDelivery: (order: Order) => void;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">SUIVI &amp; ORGANISATION</span><h1>Commandes</h1><p>Gardez un œil sur chaque commande de votre boutique.</p></div>
        <button className="btn btn-primary" onClick={onAdd} type="button"><Icon name="plus" /> Nouvelle commande</button>
      </div>
      <div className="table-summary"><span><strong>{formatNumber(orders.length)}</strong> commande{orders.length === 1 ? "" : "s"}</span><span className="table-filter-label"><Icon name="filter" /> Résultats</span></div>
      <section className="panel table-panel">
        <OrdersTable
          orders={orders}
          onEdit={onEdit}
          onUpdateDelivery={onUpdateDelivery}
          onUpdateStatus={onUpdateStatus}
        />
      </section>
    </>
  );
}

function OrdersTable({
  orders,
  onEdit,
  onUpdateDelivery,
  onUpdateStatus,
  compact = false,
}: {
  orders: Order[];
  onEdit?: (order: Order) => void;
  onUpdateDelivery: (order: Order) => void;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
  compact?: boolean;
}) {
  if (orders.length === 0) {
    return <EmptyState title="Aucune commande pour le moment" text="Les commandes apparaîtront ici dès leur création." />;
  }
  return (
    <div className="table-scroll">
      <table className="data-table orders-table">
        <thead><tr><th>Référence</th><th>Produit</th>{!compact && <th>Client / livraison</th>}<th>Date</th><th>Quantité</th><th>Statut</th>{!compact && <th>Action</th>}</tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <span className="order-reference">#{order.id.slice(0, 8).toLocaleUpperCase()}</span>
                {order.facebookChannel && (
                  <small className="muted-cell">
                    {order.facebookChannel === "messenger" ? "Messenger" : "Commentaire Facebook"}
                    {order.facebookUserId ? ` · ${order.facebookUserId}` : ""}
                  </small>
                )}
              </td>
              <td>
                <div className="order-products-cell">
                  {order.items.map((item) => (
                    <span key={item.id}>
                      {item.product?.nom ?? "Produit supprimé"}
                      {item.productColor ? ` · ${item.productColor.name}` : ""} × {item.quantity}
                    </span>
                  ))}
                </div>
              </td>
              {!compact && (
              <td>
                <div className="order-customer-cell">
                  <strong>{order.customerName || (order.facebookUserId ? "Client Facebook" : "Client à renseigner")}</strong>
                  {order.customerPhone && <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>}
                  {order.deliveryAddress && <small>{order.deliveryAddress}</small>}
                  {!order.customerPhone && !order.deliveryAddress && (
                    <small className="muted-cell">
                      Coordonnées à compléter
                    </small>
                  )}
                  {order.deliveredAt && (
                    <small className="delivery-timestamp">
                      Livrée le {formatDateTime(order.deliveredAt)}
                    </small>
                  )}
                </div>
              </td>
              )}
              <td className="muted-cell">{formatDate(order.createdAt)}</td>
              <td><span className="quantity-cell">{order.items.reduce((total, item) => total + item.quantity, 0)}</span></td>
              <td><StatusBadge status={order.status} /></td>
              {!compact && (
                <td>
                  <div className="order-actions">
                    <select
                      aria-label={`Modifier le statut de la commande ${order.id}`}
                      className="status-select"
                      onChange={(event) => onUpdateStatus(order, event.target.value as OrderStatus)}
                      value={order.status}
                    >
                      {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    {onEdit && <button className="text-link" onClick={() => onEdit(order)} type="button">Modifier</button>}
                    {!order.deliveredAt && order.status !== "canceled" && (
                      <button
                        className="text-link"
                        onClick={() => onUpdateDelivery(order)}
                        type="button"
                      >
                        Marquer livrée
                      </button>
                    )}
                  </div>
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
  canPublish,
  busy,
  onAdd,
  onDelete,
  onEdit,
  onPublish,
}: {
  products: Product[];
  canPublish: boolean;
  busy: boolean;
  onAdd: () => void;
  onDelete: (product: Product) => void;
  onEdit: (product: Product) => void;
  onPublish: (product: Product) => void;
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
                    <td>
                      <span className="table-product">
                        {product.imageUrl ? (
                          <Image
                            alt=""
                            className="product-image-thumbnail"
                            height={40}
                            src={apiAssetUrl(product.imageUrl)!}
                            unoptimized
                            width={40}
                          />
                        ) : (
                          <span className="product-initial product-initial-large">
                            {initials(product.nom)}
                          </span>
                        )}
                        <span className="product-title">
                          <strong>{product.nom}</strong>
                          <small>
                            {product.description ||
                              (product.keywords.length > 0
                                ? `Mots-clés : ${product.keywords.join(", ")}`
                                : `Ajouté le ${formatDate(product.createdAt)}`)}
                          </small>
                          {product.colors.length > 0 && (
                            <small>
                              Couleurs :{" "}
                              {product.colors
                                .map(
                                  (color) =>
                                    `${color.name} (${color.available}/${color.initial})`,
                                )
                                .join(", ")}
                            </small>
                          )}
                          {product.facebookPostId && (
                            <small className="facebook-post-reference">
                              Publié sur Facebook · ID {product.facebookPostId}
                            </small>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="price-cell">{product.prix || "—"}</td>
                    <td><span className={`inventory-number ${product.available <= 5 ? "inventory-low" : ""}`}>{product.available}</span> <span className="muted-cell">unités</span></td>
                    <td className="muted-cell">{product.initial}</td>
                    <td><span className={`inventory-badge ${product.available === 0 ? "inventory-none" : product.available <= 5 ? "inventory-warning" : "inventory-ok"}`}><i />{product.available === 0 ? "Épuisé" : product.available <= 5 ? "Stock faible" : "En stock"}</span></td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Modifier ${product.nom}`}
                          className="icon-button row-action"
                          onClick={() => onEdit(product)}
                          title="Modifier"
                          type="button"
                        >
                          <Icon name="edit" />
                        </button>
                        {canPublish && !product.facebookPostId && (
                          <button
                            aria-label={`Publier ${product.nom} sur Facebook`}
                            className="icon-button row-action"
                            disabled={busy}
                            onClick={() => onPublish(product)}
                            title="Publier sur Facebook"
                            type="button"
                          >
                            <Icon name="facebook" />
                          </button>
                        )}
                        <button
                          aria-label={`Supprimer ${product.nom}`}
                          className="icon-button row-action row-action-danger"
                          onClick={() => onDelete(product)}
                          title="Supprimer"
                          type="button"
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
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

function SecuritySection({
  busy,
  onRequestOtp,
  onConfirmOtp,
}: {
  busy: boolean;
  onRequestOtp: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<boolean>;
  onConfirmOtp: (otp: string) => Promise<boolean>;
}) {
  const [formError, setFormError] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);

    if (otpRequested) {
      const code = String(values.get("otp") ?? "").trim();
      if (!/^\d{6}$/.test(code)) {
        setFormError("Saisissez le code à 6 chiffres reçu par e-mail.");
        return;
      }
      setFormError("");
      if (await onConfirmOtp(code)) {
        setOtpRequested(false);
        setOtp("");
        form.reset();
      }
      return;
    }

    const currentPassword = String(values.get("currentPassword") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    const confirmPassword = String(values.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setFormError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setFormError("");
    if (await onRequestOtp(currentPassword, newPassword)) {
      setOtpRequested(true);
      setOtp("");
      form.reset();
    }
  }

  function useDifferentPassword() {
    setOtpRequested(false);
    setOtp("");
    setFormError("");
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMPTE &amp; ACCÈS</span>
          <h1>Sécurité</h1>
          <p>Modifiez le mot de passe utilisé pour vous connecter à votre compte.</p>
        </div>
      </div>
      <section className="panel security-panel">
        <div className="panel-header">
          <div>
            <h2>Modifier le mot de passe</h2>
            <p>Un code envoyé par e-mail confirmera toute modification de mot de passe.</p>
          </div>
        </div>
        <form className="dialog-form security-form" onSubmit={submit}>
          {!otpRequested ? (
            <>
              <label className="form-label" htmlFor="current-password">
                Mot de passe actuel
              </label>
              <div className="password-input-control">
                <input
                  autoComplete="current-password"
                  className="field-control"
                  id="current-password"
                  maxLength={128}
                  name="currentPassword"
                  required
                  type={visiblePasswords.current ? "text" : "password"}
                />
                <button
                  aria-label={visiblePasswords.current ? "Masquer le mot de passe actuel" : "Afficher le mot de passe actuel"}
                  className="password-toggle"
                  onClick={() => setVisiblePasswords((state) => ({ ...state, current: !state.current }))}
                  type="button"
                >
                  <Icon name={visiblePasswords.current ? "eyeOff" : "eye"} />
                </button>
              </div>
              <label className="form-label" htmlFor="new-password">
                Nouveau mot de passe
              </label>
              <div className="password-input-control">
                <input
                  autoComplete="new-password"
                  className="field-control"
                  id="new-password"
                  maxLength={128}
                  minLength={8}
                  name="newPassword"
                  required
                  type={visiblePasswords.next ? "text" : "password"}
                />
                <button
                  aria-label={visiblePasswords.next ? "Masquer le nouveau mot de passe" : "Afficher le nouveau mot de passe"}
                  className="password-toggle"
                  onClick={() => setVisiblePasswords((state) => ({ ...state, next: !state.next }))}
                  type="button"
                >
                  <Icon name={visiblePasswords.next ? "eyeOff" : "eye"} />
                </button>
              </div>
              <p className="dialog-hint">Utilisez entre 8 et 128 caractères.</p>
              <label className="form-label" htmlFor="confirm-password">
                Confirmer le nouveau mot de passe
              </label>
              <div className="password-input-control">
                <input
                  autoComplete="new-password"
                  className="field-control"
                  id="confirm-password"
                  maxLength={128}
                  minLength={8}
                  name="confirmPassword"
                  required
                  type={visiblePasswords.confirm ? "text" : "password"}
                />
                <button
                  aria-label={visiblePasswords.confirm ? "Masquer la confirmation" : "Afficher la confirmation"}
                  className="password-toggle"
                  onClick={() => setVisiblePasswords((state) => ({ ...state, confirm: !state.confirm }))}
                  type="button"
                >
                  <Icon name={visiblePasswords.confirm ? "eyeOff" : "eye"} />
                </button>
              </div>
              <div className="security-actions">
                <Button className="btn btn-primary" disabled={busy} type="submit">
                  {busy ? "Envoi du code…" : "Envoyer un code OTP"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="dialog-hint" role="status">
                Un code à 6 chiffres a été envoyé à l’adresse e-mail de votre compte. Il expire dans 10 minutes.
              </p>
              <label className="form-label" htmlFor="password-otp">
                Code de confirmation
              </label>
              <input
                autoComplete="one-time-code"
                className="field-control"
                id="password-otp"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="otp"
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                pattern="\d{6}"
                required
                type="text"
                value={otp}
              />
              <div className="security-actions">
                <Button className="btn btn-primary" disabled={busy} type="submit">
                  {busy ? "Confirmation…" : "Confirmer le changement"}
                </Button>
                <Button disabled={busy} onClick={useDifferentPassword} type="button" variant="ghost">
                  Recommencer
                </Button>
              </div>
            </>
          )}
          {formError && (
            <p className="dialog-hint" role="alert">
              {formError}
            </p>
          )}
        </form>
      </section>
    </>
  );
}

function FacebookPostComposer({
  busy,
  onPublish,
}: {
  busy: boolean;
  onPublish: (
    message: string,
    image?: File,
    includeMessengerLink?: boolean,
  ) => Promise<boolean>;
}) {
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [includeMessengerLink, setIncludeMessengerLink] = useState(true);
  const [imageError, setImageError] = useState("");
  const [postFormKey, setPostFormKey] = useState(0);

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    if (image && image.size > 8 * 1024 * 1024) {
      setImageError("L’image ne doit pas dépasser 8 Mio.");
      return;
    }
    if (image && !["image/jpeg", "image/png"].includes(image.type)) {
      setImageError("Le format de l’image doit être JPEG ou PNG.");
      return;
    }
    const published = await onPublish(
      message,
      image ?? undefined,
      includeMessengerLink,
    );
    if (published) {
      setMessage("");
      setImage(null);
      setImageError("");
      setPostFormKey((key) => key + 1);
    }
  }

  return (
    <section className="panel table-panel">
      <div className="panel-header table-panel-heading">
        <div>
          <h2>Publication Facebook</h2>
          <p>Publiez immédiatement sur votre Page, ou utilisez cette étape lors de l’ajout d’un produit.</p>
        </div>
      </div>
      <form className="dialog-form" key={postFormKey} onSubmit={submitPost}>
        <label className="form-label" htmlFor="facebook-post-message">Texte de la publication</label>
        <textarea
          className="field-control"
          id="facebook-post-message"
          maxLength={5000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Rédigez votre publication..."
          required
          rows={5}
          value={message}
        />
        <label className="form-label" htmlFor="facebook-post-image">Image (JPEG ou PNG, 8 Mio maximum)</label>
        <input
          accept="image/jpeg,image/png"
          className="field-control image-file-input"
          id="facebook-post-image"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file && file.size > 8 * 1024 * 1024) {
              setImage(null);
              setImageError("L’image ne doit pas dépasser 8 Mio.");
              event.target.value = "";
              return;
            }
            if (file && !["image/jpeg", "image/png"].includes(file.type)) {
              setImage(null);
              setImageError("Le format de l’image doit être JPEG ou PNG.");
              event.target.value = "";
              return;
            }
            setImage(file);
            setImageError("");
          }}
          type="file"
        />
        {imageError && <p className="dialog-hint" role="alert">{imageError}</p>}
        {image && <p className="dialog-hint">Image sélectionnée : {image.name}</p>}
        <label className="remember-check">
          <input
            checked={includeMessengerLink}
            onChange={(event) => setIncludeMessengerLink(event.target.checked)}
            type="checkbox"
          />
          <span className="custom-checkbox"><Icon name="check" /></span>
          <span>Ajouter un lien « Écrivez-nous sur Messenger »</span>
        </label>
        <p className="dialog-hint">
          Le lien ouvrira directement la conversation avec votre Page. Facebook n’affiche pas de bouton natif sous les publications organiques.
        </p>
        <div className="dialog-actions">
          <Button disabled={busy || !message.trim()} type="submit">
            {busy ? "Publication..." : "Publier sur Facebook"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function FacebookSection({
  busy,
  greetingMessage,
  onSaveGreeting,
}: {
  busy: boolean;
  greetingMessage: string;
  onSaveGreeting: (message: string) => Promise<boolean>;
}) {
  const [greetingDraft, setGreetingDraft] = useState(greetingMessage);

  async function saveGreeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveGreeting(greetingDraft);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RÉSEAUX SOCIAUX</span>
          <h1>Facebook</h1>
          <p>Configurez les réponses automatiques de votre Page.</p>
        </div>
      </div>
      <section className="panel table-panel">
        <div className="panel-header table-panel-heading">
          <div>
            <h2>Message automatique</h2>
            <p>Envoyé en privé après un commentaire ou un message sans produit reconnu.</p>
          </div>
        </div>
        <form className="dialog-form" onSubmit={saveGreeting}>
          <label className="form-label" htmlFor="facebook-greeting">Message d’accueil</label>
          <textarea
            className="field-control"
            id="facebook-greeting"
            maxLength={2000}
            onChange={(event) => setGreetingDraft(event.target.value)}
            placeholder="Bonjour, merci de nous avoir contactés. Nous revenons vers vous rapidement."
            rows={4}
            value={greetingDraft}
          />
          <p className="dialog-hint">
            2 000 caractères maximum. Laissez le texte vide pour désactiver la réponse générale. Les confirmations de commande et demandes de précision restent actives.
          </p>
          <div className="dialog-actions">
            <Button disabled={busy} type="submit">
              {busy ? "Enregistrement..." : "Enregistrer le message"}
            </Button>
          </div>
        </form>
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
        ) : <p className="dialog-hint"><Icon name="mail" /> Un mot de passe provisoire aléatoire de 8 caractères sera généré et envoyé par e-mail.</p>}
        <DialogActions busy={busy} onClose={onClose} submitLabel={user ? "Enregistrer" : "Créer le compte"} />
      </form>
    </DialogFrame>
  );
}

interface ProductFormValues {
  nom: string;
  description: string;
  keywords: string[];
  prix: string;
  initial: number;
  available?: number;
  colors: ProductColorFormValue[];
  image?: File;
  removeImage?: boolean;
  publishOnFacebook?: boolean;
  facebookMessage?: string;
}

interface ProductColorFormValue {
  id: string;
  name: string;
  initial: number;
  available: number;
}

function ProductDialog({
  busy,
  canPublish,
  product,
  onClose,
  onSave,
}: {
  busy: boolean;
  canPublish: boolean;
  product?: Product;
  onClose: () => void;
  onSave: (values: ProductFormValues) => void;
}) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [publishOnFacebook, setPublishOnFacebook] = useState(false);
  const [colorRows, setColorRows] = useState<ProductColorFormValue[]>(() =>
    product?.colors.map((color) => ({
      id: color.id,
      name: color.name,
      initial: color.initial,
      available: color.available,
    })) ?? [],
  );
  const [keywordError, setKeywordError] = useState("");
  const [imageError, setImageError] = useState("");
  const [colorError, setColorError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    apiAssetUrl(product?.imageUrl ?? null),
  );
  const colorInitialTotal = colorRows.reduce(
    (total, color) => total + color.initial,
    0,
  );
  const colorAvailableTotal = colorRows.reduce(
    (total, color) => total + color.available,
    0,
  );

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const keywords = String(form.get("keywords") ?? "")
      .split(/[,\n;]+/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    if (keywords.length > 30) {
      setKeywordError("Ajoutez au maximum 30 mots-clés ou variantes.");
      return;
    }
    if (keywords.some((keyword) => keyword.length > 80)) {
      setKeywordError("Chaque mot-clé ou variante doit faire 80 caractères maximum.");
      return;
    }
    if (colorRows.length > 30) {
      setColorError("Ajoutez au maximum 30 couleurs.");
      return;
    }
    if (
      colorRows.some(
        (color) =>
          !color.name.trim() ||
          color.name.trim().length > 50 ||
          !Number.isInteger(color.initial) ||
          color.initial < 0 ||
          !Number.isInteger(color.available) ||
          color.available < 0 ||
          color.available > color.initial,
      )
    ) {
      setColorError(
        "Chaque couleur doit avoir un nom et un stock disponible compris entre 0 et son stock initial.",
      );
      return;
    }
    const colorNames = colorRows.map((color) =>
      color.name.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR"),
    );
    if (new Set(colorNames).size !== colorNames.length) {
      setColorError("Chaque couleur doit avoir un nom unique.");
      return;
    }
    if (
      canPublish &&
      publishOnFacebook &&
      selectedImage &&
      !["image/jpeg", "image/png"].includes(selectedImage.type)
    ) {
      setImageError("Pour publier aussi sur Facebook, choisissez une image JPEG ou PNG.");
      return;
    }
    setKeywordError("");
    setImageError("");
    setColorError("");
    onSave({
      nom: String(form.get("nom") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      keywords,
      prix: String(form.get("prix") ?? "").trim(),
      initial: colorRows.length
        ? colorInitialTotal
        : Number(form.get("initial")),
      ...(colorRows.length === 0 && product
        ? { available: Number(form.get("available")) }
        : {}),
      colors: colorRows.map((color) => ({
        ...color,
        name: color.name.trim(),
      })),
      ...(selectedImage ? { image: selectedImage } : {}),
      ...(removeImage ? { removeImage: true } : {}),
      ...(!product && canPublish && publishOnFacebook
        ? {
            publishOnFacebook: true,
            facebookMessage: String(form.get("facebookMessage") ?? "").trim(),
          }
        : {}),
    });
  }
  return (
    <DialogFrame onClose={onClose} title={product ? "Modifier le produit" : "Ajouter un produit"} subtitle="Les informations seront visibles dans votre catalogue.">
      <form className="dialog-form" onSubmit={submit}>
        <label className="form-label" htmlFor="product-name">Nom du produit</label><Input defaultValue={product?.nom} id="product-name" name="nom" placeholder="Ex. Sac en raphia" required />
        <label className="form-label" htmlFor="product-description">Description</label>
        <textarea
          className="field-control product-description-input"
          defaultValue={product?.description ?? ""}
          id="product-description"
          maxLength={5000}
          name="description"
          placeholder="Décrivez le produit, sa matière, ses dimensions ou ses avantages."
          rows={4}
        />
        <label className="form-label" htmlFor="product-keywords">Mots-clés et variantes</label>
        <textarea
          className="field-control"
          defaultValue={product?.keywords.join(", ") ?? ""}
          id="product-keywords"
          name="keywords"
          placeholder="Ex. sac naturel, sac fait main, raphia"
          rows={3}
        />
        <p className="dialog-hint">Séparez les variantes par une virgule (30 maximum, 80 caractères chacune). Le nom du produit reste reconnu automatiquement.</p>
        {keywordError && <p className="dialog-hint" role="alert">{keywordError}</p>}
        <label className="form-label" htmlFor="product-price">Prix</label><Input defaultValue={product?.prix} id="product-price" name="prix" placeholder="Ex. 25 000" />
        {colorRows.length === 0 ? (
          <div className="form-two-columns">
            <div><label className="form-label" htmlFor="product-initial">Stock initial</label><Input defaultValue={product?.initial ?? 0} id="product-initial" min="0" name="initial" required type="number" /></div>
            {product && <div><label className="form-label" htmlFor="product-available">Stock disponible</label><Input defaultValue={product.available} id="product-available" min="0" name="available" required type="number" /></div>}
          </div>
        ) : (
          <div className="color-stock-summary" aria-live="polite">
            <span>Stock initial total <strong>{formatNumber(colorInitialTotal)}</strong></span>
            <span>Disponible total <strong>{formatNumber(colorAvailableTotal)}</strong></span>
          </div>
        )}
        <div className="color-stock-heading">
          <div>
            <label className="form-label" htmlFor="product-color-name-0">Stock par couleur</label>
            <p className="dialog-hint">Les commandes réserveront le stock de la couleur choisie.</p>
          </div>
          <button
            className="add-order-item"
            disabled={colorRows.length >= 30}
            onClick={() =>
              setColorRows((rows) => [
                ...rows,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  initial: 0,
                  available: 0,
                },
              ])
            }
            type="button"
          >
            <Icon name="plus" /> Ajouter une couleur
          </button>
        </div>
        {colorRows.map((color, index) => (
          <div className="color-stock-row" key={color.id}>
            <div>
              <label className="form-label" htmlFor={`product-color-name-${index}`}>Couleur</label>
              <Input
                autoComplete="off"
                id={`product-color-name-${index}`}
                maxLength={50}
                onChange={(event) =>
                  setColorRows((rows) =>
                    rows.map((row) =>
                      row.id === color.id
                        ? { ...row, name: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Ex. Noir"
                required
                value={color.name}
              />
            </div>
            <div>
              <label className="form-label" htmlFor={`product-color-initial-${index}`}>Initial</label>
              <Input
                id={`product-color-initial-${index}`}
                min="0"
                onChange={(event) => {
                  const initial = Number(event.target.value);
                  setColorRows((rows) =>
                    rows.map((row) =>
                      row.id === color.id
                        ? {
                            ...row,
                            initial,
                              available: product?.colors.some(
                                (existingColor) => existingColor.id === row.id,
                              )
                                ? Math.min(row.available, initial)
                                : initial,
                            }
                          : row,
                    ),
                  );
                }}
                required
                type="number"
                value={color.initial}
              />
            </div>
            <div>
              <label className="form-label" htmlFor={`product-color-available-${index}`}>Disponible</label>
              <Input
                id={`product-color-available-${index}`}
                max={color.initial}
                min="0"
                onChange={(event) => {
                  const available = Number(event.target.value);
                  setColorRows((rows) =>
                    rows.map((row) =>
                      row.id === color.id ? { ...row, available } : row,
                    ),
                  );
                }}
                required
                type="number"
                value={color.available}
              />
            </div>
            <button
              aria-label={`Retirer la couleur ${color.name || index + 1}`}
              className="remove-order-item"
              onClick={() =>
                setColorRows((rows) => rows.filter((row) => row.id !== color.id))
              }
              type="button"
            >
              <Icon name="close" />
            </button>
          </div>
        ))}
        {colorError && <p className="dialog-hint" role="alert">{colorError}</p>}
        <label className="form-label" htmlFor="product-image">Image du produit (JPEG, PNG ou WebP, 5 Mio maximum)</label>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="field-control image-file-input"
          id="product-image"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file && file.size > 5 * 1024 * 1024) {
              setSelectedImage(null);
              setImageError("L’image du produit ne doit pas dépasser 5 Mio.");
              setPreviewUrl(removeImage ? null : apiAssetUrl(product?.imageUrl ?? null));
              event.target.value = "";
              return;
            }
            if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
              setSelectedImage(null);
              setImageError("Le format de l’image doit être JPEG, PNG ou WebP.");
              setPreviewUrl(removeImage ? null : apiAssetUrl(product?.imageUrl ?? null));
              event.target.value = "";
              return;
            }
            setImageError("");
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
        {imageError && <p className="dialog-hint" role="alert">{imageError}</p>}
        {previewUrl && <Image alt="Aperçu du produit" className="product-image-preview" height={96} src={previewUrl} unoptimized width={96} />}
        {product?.imageUrl && !removeImage && (
          <button className="remove-image-button" onClick={() => { setRemoveImage(true); setSelectedImage(null); setPreviewUrl(null); }} type="button">Retirer l’image actuelle</button>
        )}
        {!product && canPublish && (
          <>
            <label className="remember-check">
              <input
                checked={publishOnFacebook}
                onChange={(event) => {
                  setPublishOnFacebook(event.target.checked);
                  if (!event.target.checked) setImageError("");
                }}
                type="checkbox"
              />
              <span className="custom-checkbox"><Icon name="check" /></span>
              <span>Publier ce produit sur Facebook après son enregistrement</span>
            </label>
            {publishOnFacebook && (
              <>
                <label className="form-label" htmlFor="product-facebook-message">Texte de la publication (facultatif)</label>
                <textarea
                  className="field-control"
                  id="product-facebook-message"
                  maxLength={5000}
                  name="facebookMessage"
                  placeholder="Par défaut, le nom et le prix du produit seront publiés."
                  rows={3}
                />
                <p className="dialog-hint">
                  L’image du produit sera jointe à la publication. Le fichier doit être au format JPEG ou PNG.
                </p>
              </>
            )}
          </>
        )}
        <DialogActions busy={busy} onClose={onClose} submitLabel={product ? "Enregistrer" : "Ajouter le produit"} />
      </form>
    </DialogFrame>
  );
}

interface OrderFormValues {
  product_id: string;
  product_color_id?: string;
  quantity: number;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
}

function OrderDialog({
  busy,
  order,
  products,
  onClose,
  onSave,
}: {
  busy: boolean;
  order?: Order;
  products: Product[];
  onClose: () => void;
  onSave: (values: OrderFormValues) => void;
}) {
  const [productId, setProductId] = useState(
    order?.items[0]?.productId ?? "",
  );
  const [productColorId, setProductColorId] = useState(
    order?.items[0]?.productColorId ?? "",
  );
  const [quantity, setQuantity] = useState(order?.items[0]?.quantity ?? 1);
  const [status, setStatus] = useState<OrderStatus>(
    order?.status ?? "reserved",
  );
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedColor = selectedProduct?.colors.find(
    (color) => color.id === productColorId,
  );
  const originalQuantity =
    order?.items.reduce(
      (total, item) =>
        item.productId === productId &&
        (selectedProduct?.colors.length
          ? item.productColorId === productColorId
          : true)
          ? total + item.quantity
          : total,
      0,
    ) ?? 0;
  const available =
    (selectedColor?.available ??
      (selectedProduct?.colors.length ? 0 : selectedProduct?.available ?? 0)) +
    (status !== "canceled" && order?.status !== "canceled"
      ? originalQuantity
      : 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      product_id: productId,
      ...(productColorId ? { product_color_id: productColorId } : {}),
      quantity,
      status,
      customer_name: String(form.get("customer_name") ?? "").trim(),
      customer_phone: String(form.get("customer_phone") ?? "").trim(),
      delivery_address: String(form.get("delivery_address") ?? "").trim(),
    });
  }
  return (
    <DialogFrame
      onClose={onClose}
      title={order ? "Modifier la commande" : "Nouvelle commande"}
      subtitle={
        order
          ? "Choisissez un produit et indiquez la quantité à réserver."
          : "Chaque commande concerne un seul produit."
      }
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="order-customer-fields">
          <label className="form-label" htmlFor="order-customer-name">
            Nom du client
          </label>
          <Input
            autoComplete="name"
            defaultValue={order?.customerName ?? ""}
            id="order-customer-name"
            maxLength={120}
            name="customer_name"
            placeholder="Nom et prénom"
          />
          <label className="form-label" htmlFor="order-customer-phone">
            Numéro de téléphone
          </label>
          <Input
            autoComplete="tel"
            defaultValue={order?.customerPhone ?? ""}
            id="order-customer-phone"
            maxLength={40}
            name="customer_phone"
            placeholder="+261 ..."
            type="tel"
          />
          <label className="form-label" htmlFor="order-delivery-address">
            Adresse de livraison
          </label>
          <textarea
            autoComplete="street-address"
            className="field-control product-description-input"
            defaultValue={order?.deliveryAddress ?? ""}
            id="order-delivery-address"
            maxLength={500}
            name="delivery_address"
            placeholder="Adresse complète, quartier, repère..."
            rows={3}
          />
          {order?.facebookUserId && (
            <p className="dialog-hint">
              Les commandes reçues via Facebook ne contiennent pas automatiquement l’adresse ni le téléphone du client. Complétez ces informations après l’avoir contacté.
            </p>
          )}
        </div>
        <label className="form-label" htmlFor="order-product">
          Produit
        </label>
        <select
          className="field-control"
          id="order-product"
          onChange={(event) => {
            setProductId(event.target.value);
            setProductColorId("");
          }}
          required
          value={productId}
        >
          <option disabled value="">
            Choisir un produit
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.nom} · {product.available} disponible
              {product.available === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        {selectedProduct && selectedProduct.colors.length > 0 && (
          <>
            <label className="form-label" htmlFor="order-product-color">
              Couleur
            </label>
            <select
              className="field-control"
              id="order-product-color"
              onChange={(event) => setProductColorId(event.target.value)}
              required
              value={productColorId}
            >
              <option disabled value="">
                Choisir une couleur
              </option>
              {selectedProduct.colors.map((color) => (
                <option
                  key={color.id}
                  disabled={
                    status !== "canceled" &&
                    color.available +
                      (order?.status !== "canceled" &&
                      order?.items[0]?.productColorId === color.id
                        ? order?.items[0]?.quantity ?? 0
                        : 0) <
                      1
                  }
                  value={color.id}
                >
                  {color.name} · {color.available} disponible
                  {color.available === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="form-label" htmlFor="order-quantity">
          Quantité
        </label>
        <Input
          id="order-quantity"
          max={status === "canceled" ? undefined : available}
          min="1"
          onChange={(event) => setQuantity(Number(event.target.value))}
          required
          type="number"
          value={quantity}
        />
        {products.length === 0 && (
          <p className="dialog-hint">
            Aucun produit n’a de stock disponible.
          </p>
        )}
        {selectedProduct?.colors.length && !productColorId ? (
          <p className="dialog-hint" role="status">
            Ce produit est géré par couleur : choisissez une couleur pour réserver son stock.
          </p>
        ) : null}
        <label className="form-label" htmlFor="order-status">
          Statut {order ? "de la commande" : "initial"}
        </label>
        <select
          className="field-control"
          id="order-status"
          onChange={(event) =>
            setStatus(event.target.value as OrderStatus)
          }
          value={status}
        >
          <option value="reserved">En attente</option>
          <option value="payed">Payée</option>
          <option value="canceled">Annulée</option>
        </select>
        <DialogActions
          busy={busy}
          disabled={!productId}
          onClose={onClose}
          submitLabel={
            order ? "Enregistrer les modifications" : "Créer la commande"
          }
        />
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

function LogoutDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="logout-dialog-title"
        aria-modal="true"
        className="dialog-card logout-dialog"
        role="alertdialog"
      >
        <div className="dialog-header">
          <div>
            <span className="dialog-eyebrow">TIAKO DIA TIAKO</span>
            <h2 id="logout-dialog-title">Se déconnecter ?</h2>
            <p>Voulez-vous vraiment quitter votre espace administrateur ?</p>
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Annuler
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? (
              <>
                <span className="button-spinner" /> Déconnexion…
              </>
            ) : (
              "Se déconnecter"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteProductDialog({
  busy,
  product,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  product: Product;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="delete-product-dialog-title"
        aria-modal="true"
        className="dialog-card logout-dialog"
        role="alertdialog"
      >
        <div className="dialog-header">
          <div>
            <span className="dialog-eyebrow">CATALOGUE PRODUITS</span>
            <h2 id="delete-product-dialog-title">Supprimer ce produit ?</h2>
            <p>
              « {product.nom} » sera retiré du catalogue. Les commandes déjà
              enregistrées seront conservées.
              {product.facebookPostId
                ? " La publication Facebook associée sera également supprimée de votre Page."
                : ""}
            </p>
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Annuler
          </button>
          <button
            className="btn btn-primary btn-danger"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? (
              <>
                <span className="button-spinner" /> Suppression…
              </>
            ) : (
              "Supprimer le produit"
            )}
          </button>
        </div>
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
