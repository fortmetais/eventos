import { lazy, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Loading, Notice } from "./components/ui";
import { Explore } from "./pages/Explore";
const EventDetail = lazy(() =>
  import("./pages/EventDetail").then((m) => ({ default: m.EventDetail })),
);
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const NewPassword = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.NewPassword })),
);
const Registration = lazy(() =>
  import("./pages/Registration").then((m) => ({ default: m.Registration })),
);
const DecisionResponse = lazy(() =>
  import("./pages/DecisionResponse").then((m) => ({
    default: m.DecisionResponse,
  })),
);
const Profile = lazy(() =>
  import("./pages/Profile").then((m) => ({ default: m.Profile })),
);
const AdminMembers = lazy(() =>
  import("./pages/Organization").then((m) => ({ default: m.AdminMembers })),
);
const Invitation = lazy(() =>
  import("./pages/Organization").then((m) => ({ default: m.Invitation })),
);
const Members = lazy(() =>
  import("./pages/Organization").then((m) => ({ default: m.Members })),
);
const OrganizationDashboard = lazy(() =>
  import("./pages/Organization").then((m) => ({
    default: m.OrganizationDashboard,
  })),
);
const OrganizationLayout = lazy(() =>
  import("./pages/Organization").then((m) => ({
    default: m.OrganizationLayout,
  })),
);
const OrganizationPicker = lazy(() =>
  import("./pages/Organization").then((m) => ({
    default: m.OrganizationPicker,
  })),
);
const PlatformAdmin = lazy(() =>
  import("./pages/Organization").then((m) => ({ default: m.PlatformAdmin })),
);
const ManageEvents = lazy(() =>
  import("./pages/ManageEvents").then((m) => ({ default: m.ManageEvents })),
);
const VolunteerFormSetup = lazy(() =>
  import("./pages/VolunteerFormSetup").then((m) => ({
    default: m.VolunteerFormSetup,
  })),
);
const ReviewRegistrations = lazy(() =>
  import("./pages/ReviewRegistrations").then((m) => ({
    default: m.ReviewRegistrations,
  })),
);
const Health = lazy(() =>
  import("./pages/Health").then((m) => ({ default: m.Health })),
);
function Protected({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <Loading />;
  if (!auth.session)
    return (
      <Navigate
        replace
        to={`/entrar?next=${encodeURIComponent(location.pathname)}`}
      />
    );
  if (auth.error)
    return (
      <div className="narrow-shell">
        <Notice>{auth.error}</Notice>
        <button className="button outline" onClick={() => void auth.refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  if (admin && !auth.access?.account.platformAdmin)
    return (
      <div className="narrow-shell">
        <Notice>Acesso restrito ao administrador da plataforma.</Notice>
      </div>
    );
  return children;
}
export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Explore />} />
            <Route path="eventos/:id" element={<EventDetail />} />
            <Route path="inscricao/:campaignId" element={<Registration />} />
            <Route path="resposta/:noticeId" element={<DecisionResponse />} />
            <Route path="entrar" element={<Login />} />
            <Route path="nova-senha" element={<NewPassword />} />
            <Route path="convite/:token" element={<Invitation />} />
            <Route
              path="meu-perfil"
              element={
                <Protected>
                  <Profile />
                </Protected>
              }
            />
            <Route
              path="admin"
              element={
                <Protected admin>
                  <PlatformAdmin />
                </Protected>
              }
            />
            <Route
              path="admin/organizacoes/:organizationId/membros"
              element={
                <Protected admin>
                  <AdminMembers />
                </Protected>
              }
            />
            <Route
              path="organizacao"
              element={
                <Protected>
                  <OrganizationPicker />
                </Protected>
              }
            />
            <Route
              path="organizacao/:organizationId"
              element={
                <Protected>
                  <OrganizationLayout />
                </Protected>
              }
            >
              <Route index element={<OrganizationDashboard />} />
              <Route path="eventos" element={<ManageEvents />} />
              <Route
                path="eventos/:eventId/ficha-servos"
                element={<VolunteerFormSetup />}
              />
              <Route path="inscricoes" element={<ReviewRegistrations />} />
              <Route path="membros" element={<Members />} />
              <Route path="saude" element={<Health />} />
            </Route>
            <Route
              path="*"
              element={
                <div className="narrow-shell">
                  <Notice>Esta página não foi encontrada.</Notice>
                  <a className="button outline" href="/">
                    Voltar para os eventos
                  </a>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
