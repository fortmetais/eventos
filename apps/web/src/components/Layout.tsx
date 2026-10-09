import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { Loading } from "./ui";
import { Church, Heart, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { organizationDestination, pendingInvitation } from "../lib/navigation";
export function Layout() {
  const auth = useAuth();
  const location = useLocation();
  const invitation = pendingInvitation();
  if (
    invitation &&
    auth.session &&
    auth.access &&
    !auth.loading &&
    !auth.error &&
    ["/", "/meu-perfil"].includes(location.pathname)
  )
    return <Navigate replace to={invitation} />;
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/">
            <span className="brand-symbol">
              <Church size={25} />
            </span>
            encontro<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Menu principal">
            <NavLink to="/" end>
              {auth.eventsEnabled || auth.volunteerRegistrationsReady
                ? "Explorar eventos"
                : "Início"}
            </NavLink>
            {auth.access?.organizations.length ? (
              <NavLink to={organizationDestination(auth.access)}>
                {auth.access.organizations.length === 1
                  ? "Minha organização"
                  : "Minhas organizações"}
              </NavLink>
            ) : null}
            {auth.access?.account.platformAdmin && (
              <NavLink to="/admin">Administração</NavLink>
            )}
          </nav>
          <div className="header-actions">
            {auth.session ? (
              <>
                <Link className="button subtle" to="/meu-perfil">
                  Minha área
                </Link>
                <button
                  className="icon-button"
                  aria-label="Sair"
                  onClick={() => void auth.logout()}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link className="button subtle" to="/entrar">
                Entrar <span aria-hidden="true">↗</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      <main>
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="site-footer">
        <div>
          <Link className="brand" to="/">
            encontro<span className="brand-dot">.</span>
          </Link>
          <span>Experiências que aproximam. Comunidades que acolhem.</span>
        </div>
        <span>
          Feito para caminhar juntos <Heart size={14} />
        </span>
      </footer>
    </>
  );
}
