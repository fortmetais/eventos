import { useDisclosureDismiss } from "../lib/useDisclosureDismiss";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Loading } from "./ui";
import { Church, Heart, LogOut, Menu, UserRound, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { organizationDestination, pendingInvitation } from "../lib/navigation";
import { useUnsavedChanges } from "../lib/unsaved-changes";

export function Layout() {
  const auth = useAuth();
  const location = useLocation();
  const invitation = pendingInvitation();
  const returnToPoster = auth.temporaryHome && location.pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLDivElement>(null);
  useDisclosureDismiss(menuOpen, () => setMenuOpen(false), menuButton, header);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const menuId = useId();
  const { run } = useUnsavedChanges(false);
  const protectedRegistrations = /^\/organizacao\/[^/]+\/inscricoes\/?$/.test(location.pathname);
  useEffect(() => {
    if (returnToPoster) window.location.replace("/");
  }, [returnToPoster]);
  useEffect(() => {
    setMenuOpen(false);
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      if (!document.querySelector("dialog[open]")) main.current?.focus({ preventScroll: true });
    }
  }, [location.pathname]);
  if (returnToPoster) return <Loading />;
  if (
    invitation && auth.session && auth.access && !auth.loading && !auth.error &&
    ["/", "/meu-perfil"].includes(location.pathname)
  ) return <Navigate replace to={invitation} />;
  return (
    <>
      <a className="skip-link" href="#conteudo-principal">Ir para o conteúdo</a>
      <header className={`site-header${protectedRegistrations ? "" : " site-header--standard"}${menuOpen ? " site-menu-open" : ""}`}>
        <div className="header-inner" ref={header}>
          <Link className="brand" to="/">
            <span className="brand-symbol"><Church size={25} aria-hidden="true" /></span>
            encontro<span className="brand-dot">.</span>
          </Link>
          <nav id={menuId} aria-label="Menu principal" onClick={(event) => {
            if ((event.target as Element).closest("a")) setMenuOpen(false);
          }}>
            <NavLink to={auth.temporaryHome ? "/eventos" : "/"} end>
              {auth.eventsEnabled || auth.volunteerRegistrationsReady || auth.camperRegistrationsReady ? "Explorar eventos" : "Início"}
            </NavLink>
            {auth.access?.organizations.length ? (
              <NavLink to={organizationDestination(auth.access)}>
                {auth.access.organizations.length === 1 ? "Minha organização" : "Minhas organizações"}
              </NavLink>
            ) : null}
            {auth.access?.account.platformAdmin && <NavLink to="/admin">Administração</NavLink>}
          </nav>
          <div className="header-actions">
            {auth.session ? (
              <>
                <Link className="button subtle header-account" to="/meu-perfil" aria-label="Minha área">
                  <UserRound size={18} className="header-account-icon" aria-hidden="true" />
                  <span className="header-account-label">Minha área</span>
                </Link>
                <button className="icon-button" aria-label="Sair" title="Sair" onClick={() => void run(() => { void auth.logout(); })}>
                  <LogOut size={18} aria-hidden="true" />
                </button>
              </>
            ) : (
              <Link className="button subtle" to="/entrar">Entrar <span aria-hidden="true">↗</span></Link>
            )}
            <button ref={menuButton} className="icon-button site-menu-toggle" type="button"
              aria-label={menuOpen ? "Fechar menu principal" : "Abrir menu principal"}
              aria-expanded={menuOpen} aria-controls={menuId}
              onClick={() => setMenuOpen((value) => !value)}>
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      <main id="conteudo-principal" ref={main} tabIndex={-1} className={protectedRegistrations ? "application-main" : "application-main ui-standard"}>
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>
      <footer className="site-footer">
        <div>
          <Link className="brand" to="/">encontro<span className="brand-dot">.</span></Link>
          <span>Experiências que aproximam. Comunidades que acolhem.</span>
        </div>
        <span>Feito para caminhar juntos <Heart size={14} aria-hidden="true" /></span>
      </footer>
    </>
  );
}
